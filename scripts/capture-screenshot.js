#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const sharp = require("sharp");
const { chromium } = require("playwright-core");
const { parseArgs } = require("../lib/utils");

function findBrowserExecutable(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) throw new Error(`Browser executable not found: ${resolved}`);
    return resolved;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("No Chrome/Chromium executable found. Pass --executable <path>.");
  }
  return found;
}

function resolveTarget(options) {
  if (options.url) return options.url;
  if (options.file) return pathToFileURL(path.resolve(options.file)).href;
  throw new Error("Provide --url <url> or --file <html-path>.");
}

async function captureScreenshot(options) {
  const width = Number(options.width);
  const height = Number(options.height);
  const deviceScaleFactor = Number(options.deviceScaleFactor || options.dpr || 1);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Provide positive integer --width and --height values in CSS pixels.");
  }
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
    throw new Error("Provide a positive --dpr value.");
  }
  if (!options.output) throw new Error("Provide --output <png-path>.");

  const executablePath = findBrowserExecutable(options.executable);
  const target = resolveTarget(options);
  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--hide-scrollbars"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor,
      colorScheme: options.colorScheme === "light" ? "light" : "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(target, {
      waitUntil: options.waitUntil || "load",
      timeout: Number(options.timeout || 30000),
    });
    await page.addStyleTag({
      content: [
        "*, *::before, *::after {",
        "  animation-delay: 0s !important;",
        "  animation-duration: 0s !important;",
        "  animation-iteration-count: 1 !important;",
        "  caret-color: transparent !important;",
        "  transition-delay: 0s !important;",
        "  transition-duration: 0s !important;",
        "}",
      ].join("\n"),
    });
    const readiness = await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }));
      return {
        fontsStatus: document.fonts?.status || "unsupported",
        imageCount: document.images.length,
        incompleteImages: Array.from(document.images).filter((image) => !image.complete).length,
        brokenImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length,
      };
    });
    if (Number(options.waitMs || 0) > 0) {
      await page.waitForTimeout(Number(options.waitMs));
    }

    const screenshotOptions = {
      path: outputPath,
      animations: "disabled",
      caret: "hide",
      fullPage: Boolean(options.fullPage),
      type: "png",
    };
    if (options.selector) {
      await page.locator(options.selector).first().screenshot(screenshotOptions);
    } else {
      await page.screenshot(screenshotOptions);
    }

    const metadata = await sharp(outputPath).metadata();
    const expectedRaster = {
      width: Math.round(width * deviceScaleFactor),
      height: Math.round(height * deviceScaleFactor),
    };
    const targetRaster = { width: metadata.width, height: metadata.height };
    const exactRaster = !options.fullPage && !options.selector &&
      targetRaster.width === expectedRaster.width && targetRaster.height === expectedRaster.height;
    if (!options.fullPage && !options.selector && !exactRaster) {
      throw new Error(
        `Captured raster ${targetRaster.width}x${targetRaster.height} does not equal CSS viewport × DPR ${expectedRaster.width}x${expectedRaster.height}.`
      );
    }

    const result = {
      target,
      browserExecutable: executablePath,
      cssViewport: { width, height },
      devicePixelRatio: deviceScaleFactor,
      expectedRaster,
      targetRaster,
      exactRaster,
      fontsReady: readiness.fontsStatus === "loaded" || readiness.fontsStatus === "unsupported",
      imagesReady: readiness.incompleteImages === 0 && readiness.brokenImages === 0,
      brokenImages: readiness.brokenImages,
      imageCount: readiness.imageCount,
      animationsFrozen: true,
      output: outputPath,
    };
    if (!result.imagesReady && !options.allowIncompleteAssets) {
      throw new Error(`Capture blocked: ${readiness.incompleteImages} incomplete and ${readiness.brokenImages} broken images.`);
    }
    if (options.metadataOutput) {
      const metadataPath = path.resolve(options.metadataOutput);
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(metadataPath, JSON.stringify(result, null, 2), "utf8");
    }
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await captureScreenshot({
    url: args.url,
    file: args.file,
    output: args.output,
    metadataOutput: args["metadata-output"],
    width: args.width,
    height: args.height,
    dpr: args.dpr,
    executable: args.executable,
    selector: args.selector,
    fullPage: Boolean(args["full-page"]),
    colorScheme: args["color-scheme"],
    waitUntil: args["wait-until"],
    waitMs: args["wait-ms"],
    timeout: args.timeout,
    allowIncompleteAssets: Boolean(args["allow-incomplete-assets"]),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { captureScreenshot, findBrowserExecutable };
