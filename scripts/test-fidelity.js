#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { compareImages } = require("./verify-fidelity");

async function makeFixture(filePath, width, height, box) {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  });
  if (!box) {
    await image.png().toFile(filePath);
    return;
  }
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#fff"/></svg>`
  );
  await image.composite([{ input: overlay }]).png().toFile(filePath);
}

async function makeHeadingFixture(filePath, lines) {
  const width = 220;
  const height = 140;
  const rects = Array.from({ length: lines }, (_, index) =>
    `<rect x="20" y="${20 + index * 32}" width="${150 - index * 15}" height="14" fill="#fff"/>`
  ).join("");
  const svg = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${rects}</svg>`);
  await sharp(svg).png().toFile(filePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const dir = path.resolve(".tmp-test/fidelity");
  fs.mkdirSync(dir, { recursive: true });
  const reference = path.join(dir, "reference.png");
  const identical = path.join(dir, "identical.png");
  const shifted = path.join(dir, "shifted.png");
  const wrongSize = path.join(dir, "wrong-size.png");
  const headingTwoLines = path.join(dir, "heading-two-lines.png");
  const headingThreeLines = path.join(dir, "heading-three-lines.png");
  const transparentRed = path.join(dir, "transparent-red.png");
  const transparentBlue = path.join(dir, "transparent-blue.png");

  await makeFixture(reference, 200, 120, { x: 20, y: 20, width: 20, height: 12 });
  await makeFixture(identical, 200, 120, { x: 20, y: 20, width: 20, height: 12 });
  await makeFixture(shifted, 200, 120, { x: 150, y: 90, width: 20, height: 12 });
  await makeFixture(wrongSize, 220, 120, { x: 20, y: 20, width: 20, height: 12 });
  await makeHeadingFixture(headingTwoLines, 2);
  await makeHeadingFixture(headingThreeLines, 3);
  await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toFile(transparentRed);
  await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0 } } }).png().toFile(transparentBlue);

  const canvasRegion = [{ name: "Canvas", role: "region", box: { x: 0, y: 0, width: 200, height: 120 } }];
  const sameResult = await compareImages(reference, identical, { regions: canvasRegion });
  const noRegionResult = await compareImages(reference, identical);
  const invalidRegionResult = await compareImages(reference, identical, { regions: [{ name: "Invalid" }] });
  const shiftedResult = await compareImages(reference, shifted, { regions: canvasRegion });
  const sizeResult = await compareImages(reference, wrongSize, { regions: canvasRegion });
  const headingResult = await compareImages(headingTwoLines, headingThreeLines, {
    regions: [{ name: "Hero heading", role: "heading", expectedLineCount: 2, box: { x: 0, y: 0, width: 220, height: 75 } }],
  });
  const transparentResult = await compareImages(transparentRed, transparentBlue, {
    regions: [{ name: "Transparent canvas", role: "region", box: { x: 0, y: 0, width: 40, height: 40 } }],
  });
  const shiftedBarReference = path.join(dir, "wide-bar-reference.png");
  const shiftedBarTarget = path.join(dir, "wide-bar-target.png");
  await makeFixture(shiftedBarReference, 1200, 400, { x: 100, y: 100, width: 1000, height: 40 });
  await makeFixture(shiftedBarTarget, 1200, 400, { x: 103, y: 100, width: 1000, height: 40 });
  const shiftedBarResult = await compareImages(shiftedBarReference, shiftedBarTarget, {
    regions: [{ name: "Wide rule", role: "divider", tolerancePx: 1, box: { x: 80, y: 80, width: 1040, height: 80 } }],
  });
  const oddReference = path.join(dir, "odd-reference.png");
  const oddTarget = path.join(dir, "odd-target.png");
  await makeFixture(oddReference, 201, 101, { x: 10, y: 10, width: 20, height: 10 });
  await makeFixture(oddTarget, 200, 100, { x: 10, y: 10, width: 20, height: 10 });
  const oddSizeResult = await compareImages(oddReference, oddTarget, {
    captureDpr: 2,
    regions: [{ name: "Canvas", role: "region", box: { x: 0, y: 0, width: 201, height: 101 } }],
  });

  assert(sameResult.match, "identical images should match");
  assert(!noRegionResult.match && !noRegionResult.pixelPerfectEligible, "pixel-perfect acceptance should require named regions");
  assert(!invalidRegionResult.match && !invalidRegionResult.pixelPerfectEligible, "regions without coordinates must be rejected");
  assert(sameResult.compositeScore === 100, "identical images should score 100");
  assert(shiftedResult.diagnostics.rawDiffPercent < 5, "fixture should expose background dilution in raw pixel diff");
  assert(shiftedResult.compositeScore < 80, "shifted foreground should receive a low composite score");
  assert(!shiftedResult.match, "shifted foreground should fail fidelity verification");
  assert(!sizeResult.match, "dimension mismatch should fail strict verification");
  assert(sizeResult.diagnostics.exactDimensions === false, "dimension mismatch should be reported");
  assert(sizeResult.recoveryActions.some((action) => action.type === "recapture-at-reference-raster"), "size mismatch should return a recapture action");
  assert(transparentResult.match && transparentResult.compositeScore === 100, "hidden RGB under full transparency must not affect comparison");
  assert(headingResult.namedRegions[0].referenceLineCount === 2, "reference heading should have two lines");
  assert(headingResult.namedRegions[0].targetLineCount === 3, "target heading should have three lines");
  assert(headingResult.namedRegions[0].lineCountMatch === false, "heading wrap mismatch should fail");
  assert(headingResult.semanticPenalty === 8, "heading wrap mismatch should apply a semantic penalty");
  assert(shiftedBarResult.namedRegions[0].maxBoxError === 3, "named region should report the 3px shift");
  assert(!shiftedBarResult.match, "named region exceeding bbox tolerance should fail");
  const oddRecovery = oddSizeResult.recoveryActions.find((action) => action.type === "recapture-at-reference-raster");
  assert(oddRecovery.devicePixelRatio === 1 && oddRecovery.cssViewport.width === 201, "odd raster should fall back to an integer DPR 1 recapture action");

  console.log("PASS");
  console.log(`  identical score: ${sameResult.compositeScore} ✓`);
  console.log("  missing named regions rejected: ✓");
  console.log("  invalid named regions rejected: ✓");
  console.log(`  shifted raw diff: ${shiftedResult.diagnostics.rawDiffPercent}% (background-diluted fixture) ✓`);
  console.log(`  shifted composite score: ${shiftedResult.compositeScore} ✓`);
  console.log(`  dimension mismatch detected: ${!sizeResult.diagnostics.exactDimensions} ✓`);
  console.log("  size mismatch returns an automatic recapture action: ✓");
  console.log("  transparent hidden RGB ignored: ✓");
  console.log(`  heading line mismatch: ${headingResult.namedRegions[0].referenceLineCount} vs ${headingResult.namedRegions[0].targetLineCount} ✓`);
  console.log(`  named-region bbox gate: ${shiftedBarResult.namedRegions[0].maxBoxError}px shift rejected ✓`);
  console.log("  odd raster recovery falls back to an executable DPR 1 viewport: ✓");
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
