#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { captureScreenshot } = require("./capture-screenshot");

async function run() {
  const output = path.resolve(".tmp-test/capture/capture.png");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const html = '<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#000}div{position:absolute;left:20px;top:20px;width:40px;height:20px;background:#fff}</style><div></div>';
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const result = await captureScreenshot({ url, output, width: 160, height: 100, dpr: 2, colorScheme: "dark" });
  if (!result.exactRaster || result.targetRaster.width !== 320 || result.targetRaster.height !== 200) {
    throw new Error(`unexpected raster ${result.targetRaster.width}x${result.targetRaster.height}`);
  }
  if (!result.fontsReady || !result.imagesReady || !result.animationsFrozen) {
    throw new Error("capture readiness checks did not pass");
  }
  const brokenOutput = path.resolve(".tmp-test/capture/broken.png");
  const brokenHtml = '<!doctype html><style>html,body{margin:0;background:#000}</style><img src="http://127.0.0.1:9/missing.png">';
  let brokenRejected = false;
  try {
    await captureScreenshot({
      url: `data:text/html;charset=utf-8,${encodeURIComponent(brokenHtml)}`,
      output: brokenOutput,
      width: 80,
      height: 60,
      dpr: 1,
      colorScheme: "dark",
    });
  } catch (error) {
    brokenRejected = /broken images/.test(error.message);
  }
  if (!brokenRejected) throw new Error("broken image should block capture readiness");
  console.log("PASS");
  console.log(`  CSS viewport: ${result.cssViewport.width}x${result.cssViewport.height} ✓`);
  console.log(`  DPR: ${result.devicePixelRatio} ✓`);
  console.log(`  target raster: ${result.targetRaster.width}x${result.targetRaster.height} ✓`);
  console.log("  fonts/images ready and animations frozen: ✓");
  console.log("  broken image readiness rejected: ✓");
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
