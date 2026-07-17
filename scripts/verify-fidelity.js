#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { parseArgs } = require("../lib/utils");

const MAX_COLOR_DISTANCE = Math.sqrt(255 ** 2 * 3);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function colorDistance(data, index, color) {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelDistance(a, b, index) {
  const dr = a[index] - b[index];
  const dg = a[index + 1] - b[index + 1];
  const db = a[index + 2] - b[index + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function estimateBackground(data, width, height) {
  const patch = clamp(Math.round(Math.min(width, height) * 0.025), 4, 48);
  const buckets = new Map();
  const corners = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + patch; y += 1) {
      for (let x = startX; x < startX + patch; x += 1) {
        const index = (y * width + x) * 3;
        const r = Math.round(data[index] / 8) * 8;
        const g = Math.round(data[index + 1] / 8) * 8;
        const b = Math.round(data[index + 2] / 8) * 8;
        const key = `${r},${g},${b}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    }
  }

  const [key = "255,255,255"] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const [r, g, b] = key.split(",").map(Number);
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
}

function makeForegroundMask(data, width, height, background, threshold) {
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const index = pixel * 3;
    if (colorDistance(data, index, background) > threshold) {
      mask[pixel] = 1;
      count += 1;
    }
  }
  return { mask, count };
}

function makeProfiles(mask, width, height) {
  const rows = new Float64Array(height);
  const columns = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = mask[y * width + x];
      rows[y] += value;
      columns[x] += value;
    }
  }
  return { rows, columns };
}

function profileSimilarity(reference, target) {
  let difference = 0;
  let union = 0;
  for (let i = 0; i < reference.length; i += 1) {
    difference += Math.abs(reference[i] - target[i]);
    union += Math.max(reference[i], target[i]);
  }
  return union === 0 ? 100 : round((1 - difference / union) * 100);
}

function regionName(gx, gy, gridSize) {
  const horizontal = gx === 0 ? "left" : gx === gridSize - 1 ? "right" : `center-${gx}`;
  const vertical = gy === 0 ? "top" : gy === gridSize - 1 ? "bottom" : `middle-${gy}`;
  return `${vertical}-${horizontal}`;
}

function normalizeBox(region, width, height) {
  const source = region?.region || region?.box || region;
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y) ||
      !Number.isFinite(source.width) || !Number.isFinite(source.height) ||
      source.width <= 0 || source.height <= 0) {
    return null;
  }
  const x = clamp(Math.round(source.x), 0, width - 1);
  const y = clamp(Math.round(source.y), 0, height - 1);
  const boxWidth = clamp(Math.round(source.width), 1, width - x);
  const boxHeight = clamp(Math.round(source.height), 1, height - y);
  return { x, y, width: boxWidth, height: boxHeight };
}

function maskBounds(mask, imageWidth, box) {
  let minX = box.x + box.width;
  let minY = box.y + box.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      if (!mask[y * imageWidth + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function lineBands(mask, imageWidth, box) {
  const counts = [];
  for (let y = box.y; y < box.y + box.height; y += 1) {
    let count = 0;
    for (let x = box.x; x < box.x + box.width; x += 1) {
      count += mask[y * imageWidth + x];
    }
    counts.push(count);
  }
  const radius = clamp(Math.round(box.height * 0.015), 3, 10);
  const smoothed = counts.map((_, index) => {
    let total = 0;
    let samples = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = index + offset;
      if (sample < 0 || sample >= counts.length) continue;
      total += counts[sample];
      samples += 1;
    }
    return samples ? total / samples : 0;
  });
  const peakValue = Math.max(0, ...smoothed);
  const localRadius = clamp(Math.round(box.height * 0.03), 5, 20);
  const candidates = [];
  for (let index = localRadius; index < smoothed.length - localRadius; index += 1) {
    if (smoothed[index] < Math.max(2, peakValue * 0.08)) continue;
    let localMaximum = true;
    for (let scan = index - localRadius; scan <= index + localRadius; scan += 1) {
      if (smoothed[scan] > smoothed[index]) {
        localMaximum = false;
        break;
      }
    }
    if (localMaximum) candidates.push({ index, value: smoothed[index] });
  }

  const minPeakDistance = clamp(Math.round(box.height * 0.025), 5, 18);
  const peaks = [];
  for (const candidate of candidates.sort((a, b) => b.value - a.value)) {
    if (peaks.every((peak) => Math.abs(peak.index - candidate.index) > minPeakDistance)) {
      peaks.push(candidate);
    }
  }
  peaks.sort((a, b) => a.index - b.index);

  const groupGap = clamp(Math.round(box.height * 0.15), 18, 90);
  const groups = [];
  for (const peak of peaks) {
    const current = groups[groups.length - 1];
    if (!current || peak.index - current[current.length - 1].index > groupGap) {
      groups.push([peak]);
    } else {
      current.push(peak);
    }
  }
  return groups.map((group) => ({
    y: box.y + group[0].index,
    height: group[group.length - 1].index - group[0].index + 1,
    peakCount: group.length,
  }));
}

function analyzeNamedRegions(regions, reference, target, refMask, targetMask, width, height, colorThreshold) {
  return (regions || []).map((region, index) => {
    const box = normalizeBox(region, width, height);
    if (!box) {
      return {
        name: region.name || `region-${index + 1}`,
        role: String(region.role || region.kind || "region").toLowerCase(),
        valid: false,
        error: "Missing a valid x/y/width/height box.",
        foregroundSimilarity: 0,
        foregroundIou: 0,
        boundsWithinTolerance: false,
        lineCountMatch: false,
      };
    }
    let union = 0;
    let intersection = 0;
    let diff = 0;
    for (let y = box.y; y < box.y + box.height; y += 1) {
      for (let x = box.x; x < box.x + box.width; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 3;
        const refInk = refMask[pixel] === 1;
        const targetInk = targetMask[pixel] === 1;
        if (refInk || targetInk) union += 1;
        if (refInk && targetInk) intersection += 1;
        if ((refInk || targetInk) && (!(refInk && targetInk) || pixelDistance(reference, target, offset) > colorThreshold)) {
          diff += 1;
        }
      }
    }
    const role = String(region.role || region.kind || "region").toLowerCase();
    const textLike = /heading|title|text|label|copy/.test(role);
    const defaultLinePadding = /heading|title/.test(role) ? Math.round(box.height * 0.25) : 0;
    const linePadding = Number.isFinite(region.lineSearchPaddingPx)
      ? region.lineSearchPaddingPx
      : defaultLinePadding;
    const lineBox = normalizeBox({
      x: box.x,
      y: Math.max(0, box.y - Math.min(8, linePadding)),
      width: box.width,
      height: Math.min(height - Math.max(0, box.y - Math.min(8, linePadding)), box.height + linePadding + Math.min(8, linePadding)),
    }, width, height);
    const referenceLineBands = textLike ? lineBands(refMask, width, lineBox) : [];
    const targetLineBands = textLike ? lineBands(targetMask, width, lineBox) : [];
    const expectedLineCount = textLike
      ? (region.expectedLineCount ?? region.lineCount ?? referenceLineBands.length)
      : null;
    const referenceBounds = maskBounds(refMask, width, box);
    const targetBounds = maskBounds(targetMask, width, box);
    const boundsDelta = referenceBounds && targetBounds
      ? {
          x: targetBounds.x - referenceBounds.x,
          y: targetBounds.y - referenceBounds.y,
          width: targetBounds.width - referenceBounds.width,
          height: targetBounds.height - referenceBounds.height,
        }
      : null;
    const maxBoxError = boundsDelta
      ? Math.max(...Object.values(boundsDelta).map((value) => Math.abs(value)))
      : (referenceBounds || targetBounds ? Infinity : 0);
    const boxTolerancePx = Number.isFinite(region.tolerancePx)
      ? region.tolerancePx
      : /divider|rule/.test(role) ? 1 : 2;
    return {
      name: region.name || `region-${index + 1}`,
      role,
      valid: true,
      box,
      foregroundSimilarity: union === 0 ? 100 : round((1 - diff / union) * 100),
      foregroundIou: union === 0 ? 100 : round(intersection / union * 100),
      referenceForegroundBounds: referenceBounds,
      targetForegroundBounds: targetBounds,
      boundsDelta,
      maxBoxError,
      boxTolerancePx,
      boundsWithinTolerance: maxBoxError <= boxTolerancePx,
      lineSearchBox: textLike ? lineBox : null,
      referenceLineBands,
      targetLineBands,
      expectedLineCount,
      referenceLineCount: textLike ? referenceLineBands.length : null,
      targetLineCount: textLike ? targetLineBands.length : null,
      lineCountMatch: textLike ? targetLineBands.length === expectedLineCount : null,
    };
  });
}

function createDiffImage(reference, target, foregroundUnion, width, height, colorThreshold) {
  const output = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 3;
    const changed = foregroundUnion[pixel] && pixelDistance(reference, target, index) > colorThreshold;
    if (changed) {
      output[index] = 255;
      output[index + 1] = 48;
      output[index + 2] = 64;
      continue;
    }
    output[index] = Math.round(reference[index] * 0.28);
    output[index + 1] = Math.round(reference[index + 1] * 0.28);
    output[index + 2] = Math.round(reference[index + 2] * 0.28);
  }
  return output;
}

async function readRgb(imagePath, width, height) {
  let image = sharp(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha();
  if (width && height) {
    image = image.resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 });
  }
  return image.raw().toBuffer({ resolveWithObject: true });
}

async function compareImages(referencePath, targetPath, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.05;
  const colorThreshold = threshold * MAX_COLOR_DISTANCE;
  const maskThreshold = Number.isFinite(options.maskThreshold) ? options.maskThreshold : 18;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 95;
  const allowSizeMismatch = Boolean(options.allowSizeMismatch);

  const refMeta = await sharp(referencePath).metadata();
  const targetMeta = await sharp(targetPath).metadata();
  if (!refMeta.width || !refMeta.height || !targetMeta.width || !targetMeta.height) {
    throw new Error("Both images must have readable pixel dimensions.");
  }

  const width = refMeta.width;
  const height = refMeta.height;
  const refBuf = await readRgb(referencePath);
  const targetBuf = await readRgb(targetPath, width, height);
  const reference = refBuf.data;
  const target = targetBuf.data;
  const totalPixels = width * height;

  const referenceBackground = estimateBackground(reference, width, height);
  const targetBackground = estimateBackground(target, width, height);
  const referenceForeground = makeForegroundMask(reference, width, height, referenceBackground, maskThreshold);
  const targetForeground = makeForegroundMask(target, width, height, targetBackground, maskThreshold);
  const foregroundUnion = new Uint8Array(totalPixels);

  let rawDiffPixels = 0;
  let foregroundDiffPixels = 0;
  let foregroundUnionPixels = 0;
  let foregroundIntersectionPixels = 0;
  const gridSize = 4;
  const cells = Array.from({ length: gridSize * gridSize }, (_, index) => ({
    index,
    diffPixels: 0,
    unionPixels: 0,
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 3;
      const distance = pixelDistance(reference, target, index);
      const refInk = referenceForeground.mask[pixel] === 1;
      const targetInk = targetForeground.mask[pixel] === 1;
      const union = refInk || targetInk;
      const intersection = refInk && targetInk;

      if (distance > colorThreshold) rawDiffPixels += 1;
      if (intersection) foregroundIntersectionPixels += 1;
      if (!union) continue;

      foregroundUnion[pixel] = 1;
      foregroundUnionPixels += 1;
      const foregroundDifferent = !intersection || distance > colorThreshold;
      if (foregroundDifferent) foregroundDiffPixels += 1;

      const gx = Math.min(gridSize - 1, Math.floor((x / width) * gridSize));
      const gy = Math.min(gridSize - 1, Math.floor((y / height) * gridSize));
      const cell = cells[gy * gridSize + gx];
      cell.unionPixels += 1;
      if (foregroundDifferent) cell.diffPixels += 1;
    }
  }

  const refProfiles = makeProfiles(referenceForeground.mask, width, height);
  const targetProfiles = makeProfiles(targetForeground.mask, width, height);
  const rawDiffPercent = totalPixels === 0 ? 0 : round((rawDiffPixels / totalPixels) * 100);
  const foregroundDiffPercent = foregroundUnionPixels === 0
    ? 0
    : round((foregroundDiffPixels / foregroundUnionPixels) * 100);
  const foregroundIou = foregroundUnionPixels === 0
    ? 100
    : round((foregroundIntersectionPixels / foregroundUnionPixels) * 100);
  const rowProfileSimilarity = profileSimilarity(refProfiles.rows, targetProfiles.rows);
  const columnProfileSimilarity = profileSimilarity(refProfiles.columns, targetProfiles.columns);
  const widthRatio = Math.min(refMeta.width, targetMeta.width) / Math.max(refMeta.width, targetMeta.width);
  const heightRatio = Math.min(refMeta.height, targetMeta.height) / Math.max(refMeta.height, targetMeta.height);
  const sizeSimilarity = round(widthRatio * heightRatio * 100);
  const foregroundSimilarity = round(100 - foregroundDiffPercent);
  const rawPixelSimilarity = round(100 - rawDiffPercent);
  const baseCompositeScore = round(
    rawPixelSimilarity * 0.1 +
    foregroundSimilarity * 0.35 +
    foregroundIou * 0.25 +
    rowProfileSimilarity * 0.125 +
    columnProfileSimilarity * 0.125 +
    sizeSimilarity * 0.05
  );

  const exactDimensions = refMeta.width === targetMeta.width && refMeta.height === targetMeta.height;
  const foregroundCoverageDrift = referenceForeground.count === 0
    ? (targetForeground.count === 0 ? 0 : 100)
    : round(Math.abs(targetForeground.count - referenceForeground.count) / referenceForeground.count * 100);

  const regionDiffs = cells
    .map((cell) => {
      const gx = cell.index % gridSize;
      const gy = Math.floor(cell.index / gridSize);
      return {
        region: regionName(gx, gy, gridSize),
        grid: { column: gx, row: gy },
        foregroundDiffPercent: cell.unionPixels === 0 ? 0 : round(cell.diffPixels / cell.unionPixels * 100),
        diffPixels: cell.diffPixels,
        foregroundUnionPixels: cell.unionPixels,
      };
    })
    .filter((cell) => cell.foregroundUnionPixels > 0)
    .sort((a, b) => b.foregroundDiffPercent - a.foregroundDiffPercent)
    .slice(0, 6);
  const namedRegions = analyzeNamedRegions(
    options.regions,
    reference,
    target,
    referenceForeground.mask,
    targetForeground.mask,
    width,
    height,
    colorThreshold
  );
  const semanticPenalty = Math.min(
    20,
    namedRegions.filter((region) => region.lineCountMatch === false).length * 8 +
    namedRegions.filter((region) => region.boundsWithinTolerance === false).length * 4
  );
  const compositeScore = round(Math.max(0, baseCompositeScore - semanticPenalty));

  const issues = [];
  const recoveryActions = [];
  if (!exactDimensions) {
    issues.push(`Raster size mismatch: reference ${refMeta.width}x${refMeta.height}, target ${targetMeta.width}x${targetMeta.height}.`);
    const candidateDpr = Number.isFinite(options.captureDpr) && options.captureDpr > 0 ? options.captureDpr : 1;
    const requestedDpr = Number.isInteger(refMeta.width / candidateDpr) && Number.isInteger(refMeta.height / candidateDpr)
      ? candidateDpr
      : 1;
    recoveryActions.push({
      priority: 1,
      type: "recapture-at-reference-raster",
      cssViewport: {
        width: refMeta.width / requestedDpr,
        height: refMeta.height / requestedDpr,
      },
      devicePixelRatio: requestedDpr,
      message: "Update the capture viewport/DPR and recapture before changing layout code. Do not stop at the size failure.",
    });
  }
  if (foregroundCoverageDrift > 10) {
    issues.push(`Foreground coverage differs by ${foregroundCoverageDrift}%; check missing, extra, or incorrectly sized content.`);
  }
  if (rowProfileSimilarity < 90) {
    issues.push(`Vertical structure similarity is ${rowProfileSimilarity}%; check section heights and y positions.`);
  }
  if (columnProfileSimilarity < 90) {
    issues.push(`Horizontal structure similarity is ${columnProfileSimilarity}%; check gutters, widths, columns, and x positions.`);
  }
  if (foregroundSimilarity < 90) {
    issues.push(`Foreground similarity is ${foregroundSimilarity}%; typography, line wrapping, borders, or component shapes differ.`);
  }
  if (regionDiffs[0] && regionDiffs[0].foregroundDiffPercent >= 50) {
    issues.push(`Worst region is ${regionDiffs[0].region} at ${regionDiffs[0].foregroundDiffPercent}% foreground difference.`);
  }
  if (namedRegions.length === 0) {
    issues.push("No named regions supplied; pixel-perfect acceptance requires region-level geometry and typography checks.");
    recoveryActions.push({
      priority: 2,
      type: "measure-named-regions",
      message: "Create section, heading, CTA, stat, list, divider, and asset regions from the reference, then rerun verification.",
    });
  }
  for (const region of namedRegions) {
    if (region.valid === false) {
      issues.push(`${region.name} is invalid: ${region.error}`);
      continue;
    }
    if (region.lineCountMatch === false) {
      issues.push(`${region.name} line count differs: expected ${region.expectedLineCount}, target ${region.targetLineCount}.`);
      recoveryActions.push({
        priority: 3,
        type: "correct-text-wrapping",
        region: region.name,
        message: "Adjust font family, weight, size, line height, letter spacing, and width constraint; recapture and compare again.",
      });
    }
    if (region.boundsWithinTolerance === false) {
      issues.push(`${region.name} foreground bounds differ by up to ${region.maxBoxError}px; tolerance is ${region.boxTolerancePx}px.`);
      recoveryActions.push({
        priority: 4,
        type: "correct-region-geometry",
        region: region.name,
        boundsDelta: region.boundsDelta,
        message: "Apply the measured x/y/width/height delta to the owning section or component, then recapture.",
      });
    }
    if (region.foregroundSimilarity < minScore) {
      issues.push(`${region.name} foreground similarity is ${region.foregroundSimilarity}%.`);
    }
  }

  if (options.diffOutput) {
    const outputPath = path.resolve(options.diffOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const diff = createDiffImage(reference, target, foregroundUnion, width, height, colorThreshold);
    await sharp(diff, { raw: { width, height, channels: 3 } }).png().toFile(outputPath);
  }

  const namedRegionsPass = namedRegions.every((region) =>
    region.valid !== false &&
    region.foregroundSimilarity >= minScore &&
    region.lineCountMatch !== false &&
    region.boundsWithinTolerance !== false
  );
  const pixelPerfectEligible = exactDimensions && namedRegions.length > 0 && namedRegions.every((region) => region.valid !== false);
  const match = compositeScore >= minScore && namedRegionsPass && pixelPerfectEligible;
  return {
    match,
    pixelPerfectEligible,
    compositeScore,
    baseCompositeScore,
    semanticPenalty,
    minScore,
    scores: {
      rawPixelSimilarity,
      foregroundSimilarity,
      foregroundIou,
      rowProfileSimilarity,
      columnProfileSimilarity,
      sizeSimilarity,
    },
    diagnostics: {
      rawDiffPercent,
      foregroundDiffPercent,
      foregroundCoverageDrift,
      referenceForegroundCoverage: round(referenceForeground.count / totalPixels * 100, 2),
      targetForegroundCoverage: round(targetForeground.count / totalPixels * 100, 2),
      exactDimensions,
      normalizedTargetForAnalysis: !exactDimensions,
      sizeMismatchDiagnosticOnly: allowSizeMismatch && !exactDimensions,
      referenceBackground,
      targetBackground,
    },
    imageSize: { width, height },
    referenceSize: { width: refMeta.width, height: refMeta.height },
    targetSize: { width: targetMeta.width, height: targetMeta.height },
    threshold,
    maskThreshold,
    regionDiffs,
    namedRegions,
    issues,
    recoveryActions,
    diffOutput: options.diffOutput ? path.resolve(options.diffOutput) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const referencePath = args.reference || args.ref;
  const targetPath = args.target;
  if (!referencePath || !targetPath) {
    console.error("Provide --reference <path> and --target <path>.");
    process.exit(1);
  }

  let regions = [];
  const regionsFile = args["regions-file"] || args.plan;
  if (regionsFile) {
    const spec = JSON.parse(fs.readFileSync(path.resolve(regionsFile), "utf8"));
    regions = spec.regions || spec.keyRegions || spec.measurements?.regions || [];
  } else if (args.regions) {
    const spec = JSON.parse(args.regions);
    regions = Array.isArray(spec) ? spec : spec.regions || [];
  }

  const result = await compareImages(referencePath, targetPath, {
    threshold: Number.parseFloat(args.threshold || "0.05"),
    maskThreshold: Number.parseFloat(args["mask-threshold"] || "18"),
    minScore: Number.parseFloat(args["min-score"] || "95"),
    allowSizeMismatch: Boolean(args["allow-size-mismatch"]),
    diffOutput: args["diff-output"],
    regions,
    captureDpr: Number.parseFloat(args.dpr || "1"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.match) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { compareImages };
