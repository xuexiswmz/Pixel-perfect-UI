#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runGenerator(plan, outDir) {
  return spawnSync(process.execPath, [
    "scripts/generate-visual-scaffold.js",
    "--input", JSON.stringify(plan),
    "--stack", "react",
    "--css", "tailwind",
    "--out", outDir,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function run() {
  const outDir = path.resolve(".tmp-test/exact-scaffold/ready");
  const recoveredDir = path.resolve(".tmp-test/exact-scaffold/recovered");
  const blockedDir = path.resolve(".tmp-test/exact-scaffold/blocked");
  fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
  const readyPlan = {
    fidelityMode: "pixel-perfect",
    readiness: "ready",
    referenceRaster: { width: 400, height: 200 },
    cssViewport: { width: 200, height: 100 },
    devicePixelRatio: 2,
    coordinateSpace: "reference-raster-px",
    captureEnvironment: { browser: "Chromium", zoom: 1, fontsReady: true, animationsFrozen: true },
    tokens: { color: { bg: "#000000", text: { primary: "#FFFFFF" } } },
    sections: [{
      name: "Hero",
      box: { x: 20, y: 20, width: 360, height: 160 },
    }],
    regions: [{
      name: "Hero heading",
      componentName: "HeroHeading",
      role: "heading",
      parentSection: "Hero",
      box: { x: 40, y: 40, width: 300, height: 80 },
      visibleText: "Measured heading",
      expectedLineCount: 1,
      typography: { fontFamily: "Inter", fontSource: "local:Inter", fontSize: "40px", fontWeight: 700, lineHeight: "44px" },
    }, {
      name: "Logo",
      componentName: "Logo",
      role: "logo",
      parentSection: "Hero",
      box: { x: 24, y: 24, width: 12, height: 12 },
      assetSource: "/logo.svg",
      alt: "Brand logo",
    }],
  };
  const ready = runGenerator(readyPlan, outDir);
  assert(ready.status === 0, `ready exact scaffold failed: ${ready.stderr}`);
  const section = fs.readFileSync(path.join(outDir, "src/sections/HeroSection.jsx"), "utf8");
  const component = fs.readFileSync(path.join(outDir, "src/components/HeroHeading.jsx"), "utf8");
  const logo = fs.readFileSync(path.join(outDir, "src/components/Logo.jsx"), "utf8");
  const css = fs.readFileSync(path.join(outDir, "src/styles/page.css"), "utf8");
  const combined = `${section}\n${component}\n${css}`;
  assert(!/visual content goes here|Primary narrative|Secondary supporting|gradient|rounded-full/.test(combined), "exact scaffold injected unmeasured content or theme");
  assert(component.includes("Measured heading"), "declared visible text should be preserved");
  assert(logo.includes('src="/logo.svg"') && logo.includes('alt="Brand logo"'), "declared asset source should be rendered");
  assert(css.includes("left: 10px") && css.includes("width: 180px"), "section raster box should convert to CSS pixels");
  assert(css.includes('[data-component="hero-heading"]') && css.includes("width: 150px"), "component box should convert relative to its parent section");

  const recovered = runGenerator({
    fidelityMode: "pixel-perfect",
    readiness: "blocked-by-measurements",
    referenceRaster: { width: 320, height: 180 },
  }, recoveredDir);
  assert(recovered.status === 0, `recoverable exact plan should continue generation: ${recovered.stderr}`);
  const recoveredPlan = JSON.parse(fs.readFileSync(path.join(recoveredDir, "visual-plan.json"), "utf8"));
  const recoveredGuide = fs.readFileSync(path.join(recoveredDir, "VISUAL_ASSEMBLY.md"), "utf8");
  assert(recoveredPlan.readiness === "ready-with-estimates", "recovered plan should expose estimated readiness");
  assert(recoveredPlan.cssViewport.width === 320 && recoveredPlan.devicePixelRatio === 1, "recovery should create a DPR 1 baseline");
  assert(recoveredPlan.recoveryActions.length > 0, "recovery actions should be preserved for later iterations");
  assert(recoveredPlan.intermediateOnly === true, "a recovered shell without renderable regions must be marked intermediate-only");
  assert(recoveredGuide.includes("Recovery Actions"), "assembly guide should expose the next correction steps");

  const blocked = runGenerator({ fidelityMode: "pixel-perfect", readiness: "blocked-by-measurements" }, blockedDir);
  assert(blocked.status === 2, "blocked exact plan should exit with status 2");
  assert(!fs.existsSync(blockedDir), "blocked exact plan should not write scaffold files");

  console.log("PASS");
  console.log("  ready exact plan preserves measured content and coordinates: ✓");
  console.log("  exact mode injects no placeholder theme or copy: ✓");
  console.log("  incomplete but recoverable plan generates a DPR 1 estimated baseline: ✓");
  console.log("  only a plan with no reference raster remains irrecoverable: ✓");
}

try {
  run();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
