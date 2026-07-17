#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { analyzeScreenshot } = require("./auto-sample-screenshot");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const dir = path.resolve(".tmp-test/auto-sample");
  fs.mkdirSync(dir, { recursive: true });
  const imagePath = path.join(dir, "layout.png");
  const svg = Buffer.from(
    '<svg width="240" height="160"><rect width="240" height="160" fill="#000"/><rect x="20" y="24" width="80" height="18" fill="#fff"/><line x1="0" y1="70" x2="240" y2="70" stroke="#555" stroke-width="1"/></svg>'
  );
  await sharp(svg).png().toFile(imagePath);

  const result = await analyzeScreenshot(imagePath, { sampleWidth: 240 });
  assert(result.measurements.referenceRaster.width === 240, "raster width should be measured exactly");
  assert(result.measurements.referenceRaster.height === 160, "raster height should be measured exactly");
  assert(result.measurements.cssViewport === null, "CSS viewport must remain unknown until DPR is supplied");
  assert(/^#[0-9A-F]{6}$/.test(result.measurements.backgroundColor), "background must be a valid hex color");
  assert(result.measurements.backgroundColor === "#000000", "black background should be detected");
  assert(result.measurements.horizontalBands.length > 0, "visible horizontal bands should be measured");
  assert(result.plan.sections.length === 0, "sampler must not invent semantic sections");
  assert(result.plan.readiness === "measurement-draft", "sampler should mark incomplete semantic measurements");

  console.log("PASS");
  console.log(`  raster: ${result.measurements.referenceRaster.width}x${result.measurements.referenceRaster.height} ✓`);
  console.log(`  background: ${result.measurements.backgroundColor} ✓`);
  console.log(`  horizontal bands: ${result.measurements.horizontalBands.length} ✓`);
  console.log("  invented sections: 0 ✓");
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
