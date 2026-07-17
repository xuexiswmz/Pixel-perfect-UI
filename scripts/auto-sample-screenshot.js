#!/usr/bin/env node

const sharp = require("sharp");
const { parseArgs } = require("../lib/utils");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHex(color) {
  return `#${[color.r, color.g, color.b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function dominantColor(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const r = Math.round(data[i] / 8) * 8;
    const g = Math.round(data[i + 1] / 8) * 8;
    const b = Math.round(data[i + 2] / 8) * 8;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const [key = "255,255,255"] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const [r, g, b] = key.split(",").map(Number);
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
}

function distanceFrom(color, data, index) {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findBands(profile, threshold, scale, gapTolerance = 4) {
  const bands = [];
  let start = null;
  let lastActive = null;
  let peak = 0;
  for (let index = 0; index <= profile.length; index += 1) {
    const density = index < profile.length ? profile[index] : 0;
    if (density >= threshold) {
      if (start === null) start = index;
      lastActive = index;
      peak = Math.max(peak, density);
      continue;
    }
    if (start !== null && index - lastActive <= gapTolerance) continue;
    if (start !== null) {
      bands.push({
        start: Math.round(start * scale),
        end: Math.round((lastActive + 1) * scale),
        span: Math.max(1, Math.round((lastActive + 1 - start) * scale)),
        peakDensity: Math.round(peak * 1000) / 1000,
      });
    }
    start = null;
    lastActive = null;
    peak = 0;
  }
  return bands;
}

async function analyzeScreenshot(imagePath, options = {}) {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable.");

  const sampleWidth = Math.min(metadata.width, Number(options.sampleWidth) || 1200);
  const scale = metadata.width / sampleWidth;
  const sampled = await sharp(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .resize({ width: sampleWidth, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = sampled.info.width;
  const height = sampled.info.height;
  const patchSize = clamp(Math.round(Math.min(width, height) * 0.035), 6, 40);
  const cornerBuffers = [];
  const corners = [
    [0, 0],
    [width - patchSize, 0],
    [0, height - patchSize],
    [width - patchSize, height - patchSize],
  ];
  for (const [left, top] of corners) {
    const patch = await sharp(imagePath)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .resize({ width: sampleWidth, withoutEnlargement: true })
      .extract({ left, top, width: patchSize, height: patchSize })
      .raw()
      .toBuffer();
    cornerBuffers.push(patch);
  }
  const background = dominantColor(Buffer.concat(cornerBuffers));
  const maskThreshold = Number(options.maskThreshold) || 18;
  const rowCounts = new Float64Array(height);
  const columnCounts = new Float64Array(width);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      if (distanceFrom(background, sampled.data, index) <= maskThreshold) continue;
      rowCounts[y] += 1;
      columnCounts[x] += 1;
      foregroundPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const rowDensity = Array.from(rowCounts, (count) => count / width);
  const columnDensity = Array.from(columnCounts, (count) => count / height);
  const horizontalBands = findBands(rowDensity, Number(options.bandThreshold) || 0.006, scale, 5);
  const verticalBands = findBands(columnDensity, Number(options.bandThreshold) || 0.006, scale, 5);
  const maxRuleThickness = Math.max(3, Math.round(scale * 3));
  const horizontalRules = findBands(rowDensity, 0.5, scale, 1)
    .filter((band) => band.peakDensity >= 0.75 && band.span <= maxRuleThickness);
  const verticalRules = findBands(columnDensity, 0.5, scale, 1)
    .filter((band) => band.peakDensity >= 0.75 && band.span <= maxRuleThickness);
  const contentBounds = maxX < 0
    ? null
    : {
        x: Math.round(minX * scale),
        y: Math.round(minY * scale),
        width: Math.round((maxX - minX + 1) * scale),
        height: Math.round((maxY - minY + 1) * scale),
        confidence: "medium",
      };

  const measurements = {
    referenceRaster: {
      width: metadata.width,
      height: metadata.height,
    },
    cssViewport: null,
    devicePixelRatio: null,
    coordinateSpace: "reference-raster-px",
    sampledAt: { width, height, scale: Math.round(scale * 10000) / 10000 },
    backgroundColor: toHex(background),
    foregroundCoverage: Math.round(foregroundPixels / (width * height) * 10000) / 100,
    contentBounds,
    horizontalBands,
    verticalBands,
    horizontalRules,
    verticalRules,
    confidence: {
      backgroundColor: "high",
      referenceRaster: "high",
      cssViewport: "unknown until DPR and capture settings are supplied",
      contentBounds: contentBounds ? "medium" : "low",
      bands: "measurement-only; semantic labels require visual inspection",
    },
  };

  return {
    measurements,
    plan: {
      scope: "full-page",
      fidelityMode: "pixel-perfect",
      readiness: "measurement-draft",
      referenceRaster: measurements.referenceRaster,
      cssViewport: null,
      devicePixelRatio: null,
      coordinateSpace: "reference-raster-px",
      preciseOverrides: {
        pageShell: {
          backgroundColor: measurements.backgroundColor,
        },
      },
      sections: [],
      components: [],
      tokens: { color: { bg: measurements.backgroundColor } },
      unresolved: [
        "Label measured bands as semantic sections after visual inspection.",
        "Record key element bounding boxes and exact typography before generation.",
        "Record CSS viewport, devicePixelRatio, and browser capture environment before generation.",
        "Keep bounding boxes in reference-raster pixels; the generator converts them to CSS pixels from the viewport/raster ratio.",
      ],
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.image) {
    console.error("Provide --image <path>.");
    process.exit(1);
  }
  const result = await analyzeScreenshot(args.image, {
    sampleWidth: Number(args["sample-width"] || 1200),
    maskThreshold: Number(args["mask-threshold"] || 18),
    bandThreshold: Number(args["band-threshold"] || 0.006),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { analyzeScreenshot };
