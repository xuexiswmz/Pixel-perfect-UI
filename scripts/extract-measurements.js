#!/usr/bin/env node

const sharp = require("sharp");
const { parseArgs, readInput } = require("../lib/utils");

function parsePlan(input) {
  if (typeof input === "object") return input;
  try { return JSON.parse(input); } catch { return { regions: [] }; }
}

function dominantColor(pixels) {
  const buckets = {};
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
    buckets[key] = (buckets[key] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [color, count] of Object.entries(buckets)) {
    if (count > bestCount) { best = color; bestCount = count; }
  }
  return best;
}

function colorDistance(c1, c2) {
  const dr = parseInt(c1.slice(1, 3), 16) - parseInt(c2.slice(1, 3), 16);
  const dg = parseInt(c1.slice(3, 5), 16) - parseInt(c2.slice(3, 5), 16);
  const db = parseInt(c1.slice(5, 7), 16) - parseInt(c2.slice(5, 7), 16);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function extractRegion(imagePath, region) {
  const box = region.region || region.box;
  if (!box || box.x === undefined || !box.width) {
    return { name: region.name, styles: {}, error: "No region coordinates" };
  }

  const left = Math.max(0, Math.round(box.x));
  const top = Math.max(0, Math.round(box.y));
  const width = Math.min(Math.round(box.width), 5000);
  const height = Math.min(Math.round(box.height), 5000);

  const cropped = await sharp(imagePath)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bgColor = dominantColor(cropped.data);

  const padX = Math.max(1, Math.round(width * 0.1));
  const padY = Math.max(1, Math.round(height * 0.1));
  const inner = await sharp(imagePath)
    .extract({ left: left + padX, top: top + padY, width: width - padX * 2, height: height - padY * 2 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const innerColor = dominantColor(inner.data);

  const styles = {
    backgroundColor: bgColor,
    innerBackgroundColor: innerColor,
    colorUniform: colorDistance(bgColor, innerColor) < 10,
  };

  return { name: region.name, region: box, styles };
}

async function main() {
  const args = parseArgs(process.argv);
  const plan = parsePlan(readInput(args));
  const imagePath = args.image;

  if (!imagePath) {
    console.error("Provide --image <path> and --input or --file with regions JSON.");
    process.exit(1);
  }

  const regions = Array.isArray(plan.regions) ? plan.regions
    : Array.isArray(plan.sections) ? plan.sections : [];

  if (regions.length === 0) {
    console.error("No regions found in plan. Provide a JSON with a 'regions' or 'sections' array containing {name, region: {x, y, width, height}} objects.");
    process.exit(1);
  }

  const meta = await sharp(imagePath).metadata();
  const results = [];

  for (const region of regions) {
    const result = await extractRegion(imagePath, region);
    results.push(result);
  }

  console.log(JSON.stringify({
    imageMetadata: { width: meta.width, height: meta.height, format: meta.format },
    regions: results,
  }, null, 2));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
