#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { parseArgs, readInput } = require("../lib/utils");

function parsePlan(input) {
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return { regions: [] };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dominantColor(pixels) {
  const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const [key = "255,255,255"] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const [r, g, b] = key.split(",").map(Number);
  return { r, g, b };
}

function toHex(color) {
  return `#${[color.r, color.g, color.b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function pixelDistance(data, index, color) {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function activeBands(counts, peakRatio = 0.08) {
  const peak = Math.max(0, ...counts);
  const threshold = Math.max(2, peak * peakRatio);
  const bands = [];
  let start = null;
  for (let index = 0; index <= counts.length; index += 1) {
    const active = index < counts.length && counts[index] >= threshold;
    if (active && start === null) start = index;
    if (!active && start !== null) {
      bands.push({ start, end: index, span: index - start });
      start = null;
    }
  }
  return bands;
}

function analyzeGeometry(data, width, height, background, maskThreshold = 18) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;
  let sumX = 0;
  let sumY = 0;
  let edgeTransitions = 0;
  const rowCounts = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const foreground = pixelDistance(data, index, background) > maskThreshold;
      if (foreground) {
        foregroundPixels += 1;
        sumX += x;
        sumY += y;
        rowCounts[y] += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (x > 0) {
        const left = index - 3;
        const difference = Math.sqrt(
          (data[index] - data[left]) ** 2 +
          (data[index + 1] - data[left + 1]) ** 2 +
          (data[index + 2] - data[left + 2]) ** 2
        );
        if (difference > 24) edgeTransitions += 1;
      }
    }
  }

  return {
    foregroundBounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    centroid: foregroundPixels === 0 ? null : {
      x: Math.round(sumX / foregroundPixels * 10) / 10,
      y: Math.round(sumY / foregroundPixels * 10) / 10,
    },
    inkCoverage: Math.round(foregroundPixels / (width * height) * 10000) / 100,
    horizontalBands: activeBands(rowCounts),
    edgeDensity: Math.round(edgeTransitions / Math.max(1, height * Math.max(1, width - 1)) * 10000) / 100,
  };
}

function normalizeBox(region, metadata) {
  const box = region.region || region.box;
  if (!box || box.x === undefined || box.y === undefined || box.width === undefined || box.height === undefined) {
    return null;
  }
  const left = clamp(Math.round(box.x), 0, metadata.width - 1);
  const top = clamp(Math.round(box.y), 0, metadata.height - 1);
  const right = clamp(Math.round(box.x + box.width), left + 1, metadata.width);
  const bottom = clamp(Math.round(box.y + box.height), top + 1, metadata.height);
  return { left, top, width: right - left, height: bottom - top };
}

async function extractRegion(imagePath, region, metadata) {
  const box = normalizeBox(region, metadata);
  if (!box) return { name: region.name, styles: {}, error: "Invalid or missing region coordinates" };

  const cropped = await sharp(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .extract(box)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = dominantColor(cropped.data);
  const padX = Math.min(Math.max(0, Math.round(box.width * 0.1)), Math.floor((box.width - 1) / 2));
  const padY = Math.min(Math.max(0, Math.round(box.height * 0.1)), Math.floor((box.height - 1) / 2));
  const innerBox = {
    left: box.left + padX,
    top: box.top + padY,
    width: Math.max(1, box.width - padX * 2),
    height: Math.max(1, box.height - padY * 2),
  };
  const inner = await sharp(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .extract(innerBox)
    .raw()
    .toBuffer();
  const innerBackground = dominantColor(inner);
  const geometry = analyzeGeometry(cropped.data, box.width, box.height, background);
  const absoluteForegroundBounds = geometry.foregroundBounds
    ? {
        x: box.left + geometry.foregroundBounds.x,
        y: box.top + geometry.foregroundBounds.y,
        width: geometry.foregroundBounds.width,
        height: geometry.foregroundBounds.height,
      }
    : null;

  return {
    ...region,
    name: region.name,
    role: region.role || region.kind || null,
    region: { x: box.left, y: box.top, width: box.width, height: box.height },
    styles: {
      ...(region.styles || {}),
      backgroundColor: toHex(background),
      innerBackgroundColor: toHex(innerBackground),
    },
    geometry: {
      ...geometry,
      absoluteForegroundBounds,
      inferredLineCount: /heading|title|text|label/i.test(region.role || region.kind || "")
        ? geometry.horizontalBands.length
        : null,
    },
  };
}

async function extractMeasurements(imagePath, plan) {
  const regions = Array.isArray(plan.regions)
    ? plan.regions
    : Array.isArray(plan.sections)
      ? plan.sections
      : [];
  if (regions.length === 0) throw new Error("No regions found in plan.");
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable.");
  const results = [];
  for (const region of regions) {
    results.push(await extractRegion(imagePath, region, metadata));
  }
  const referenceRaster = { width: metadata.width, height: metadata.height };
  return {
    ...plan,
    referenceRaster: plan.referenceRaster || referenceRaster,
    coordinateSpace: plan.coordinateSpace || "reference-raster-px",
    regions: results,
    measurements: {
      ...(plan.measurements || {}),
      referenceRaster,
      imageMetadata: { width: metadata.width, height: metadata.height, format: metadata.format },
      regions: results,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const plan = parsePlan(readInput(args));
  if (!args.image) {
    console.error("Provide --image <path> and --input or --file with regions JSON.");
    process.exit(1);
  }
  const result = await extractMeasurements(args.image, plan);
  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { extractMeasurements };
