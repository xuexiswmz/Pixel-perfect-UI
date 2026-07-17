#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { extractMeasurements } = require("./extract-measurements");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const dir = path.resolve(".tmp-test/measurements");
  fs.mkdirSync(dir, { recursive: true });
  const rgbPath = path.join(dir, "orange.png");
  const rgbaPath = path.join(dir, "rgba.png");
  const transparentPath = path.join(dir, "transparent.png");

  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 102, b: 51 } },
  }).png().toFile(rgbPath);
  await sharp(Buffer.from(
    '<svg width="12" height="12"><rect width="12" height="12" fill="#000"/><rect x="5" y="2" width="4" height="8" fill="rgba(255,255,255,.8)"/></svg>'
  )).png().toFile(rgbaPath);
  await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
  }).png().toFile(transparentPath);

  const rgb = await extractMeasurements(rgbPath, {
    regions: [{ name: "box", region: { x: 10, y: 10, width: 80, height: 80 } }],
  });
  const rgba = await extractMeasurements(rgbaPath, {
    regions: [
      { name: "tiny", role: "heading", region: { x: 10, y: 10, width: 8, height: 8 } },
      { name: "edge", region: { x: -4, y: -3, width: 8, height: 8 } },
    ],
  });
  const transparent = await extractMeasurements(transparentPath, {
    regions: [{ name: "transparent", region: { x: 0, y: 0, width: 8, height: 8 } }],
  });

  assert(rgb.regions[0].styles.backgroundColor === "#FF6633", "solid orange should be measured exactly");
  assert(!rgba.regions[0].error, "RGBA region should not fail");
  assert(rgba.regions[0].region.width === 2 && rgba.regions[0].region.height === 2, "out-of-bounds region should clamp to the image");
  assert(rgba.regions[1].region.x === 0 && rgba.regions[1].region.y === 0, "negative coordinates should clamp to zero");
  assert(Number.isFinite(rgba.regions[0].geometry.inkCoverage), "geometry metrics should be numeric");
  assert(transparent.regions[0].styles.backgroundColor === "#FFFFFF", "fully transparent hidden RGB should flatten to white");

  console.log("PASS");
  console.log(`  RGB color: ${rgb.regions[0].styles.backgroundColor} ✓`);
  console.log("  RGBA extraction: ✓");
  console.log("  tiny and out-of-bounds regions: ✓");
  console.log("  geometry metrics: ✓");
  console.log("  transparent hidden RGB ignored: ✓");
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
