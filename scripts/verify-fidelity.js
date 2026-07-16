#!/usr/bin/env node

const sharp = require("sharp");
const { parseArgs } = require("../lib/utils");

async function compareImages(referencePath, targetPath, threshold) {
  threshold = typeof threshold === "number" ? threshold : 0.05;

  const ref = sharp(referencePath);
  const refMeta = await ref.metadata();
  const target = sharp(targetPath);
  const targetMeta = await target.metadata();

  const width = Math.min(refMeta.width, targetMeta.width);
  const height = Math.min(refMeta.height, targetMeta.height);

  const refBuf = await ref
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const targetBuf = await target
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const refPixels = refBuf.data;
  const targetPixels = targetBuf.data;
  const totalPixels = width * height;
  let diffPixels = 0;

  const gridSize = 3;
  const cellW = Math.floor(width / gridSize);
  const cellH = Math.floor(height / gridSize);
  const regionDiffs = [];

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      let cellDiff = 0;
      let cellTotal = 0;
      for (let y = gy * cellH; y < (gy + 1) * cellH && y < height; y++) {
        for (let x = gx * cellW; x < (gx + 1) * cellW && x < width; x++) {
          const idx = (y * width + x) * 3;
          const dr = Math.abs(refPixels[idx] - targetPixels[idx]);
          const dg = Math.abs(refPixels[idx + 1] - targetPixels[idx + 1]);
          const db = Math.abs(refPixels[idx + 2] - targetPixels[idx + 2]);
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist > threshold * 441) {
            cellDiff++;
          }
          cellTotal++;
        }
      }
      regionDiffs.push({
        region: `grid-${gx}-${gy}`,
        diffPercent: cellTotal > 0 ? Math.round((cellDiff / cellTotal) * 1000) / 10 : 0,
        diffPixels: cellDiff,
        totalPixels: cellTotal,
      });
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const dr = Math.abs(refPixels[idx] - targetPixels[idx]);
      const dg = Math.abs(refPixels[idx + 1] - targetPixels[idx + 1]);
      const db = Math.abs(refPixels[idx + 2] - targetPixels[idx + 2]);
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > threshold * 441) {
        diffPixels++;
      }
    }
  }

  const diffPercent = Math.round((diffPixels / totalPixels) * 1000) / 10;
  const match = diffPercent < 5;

  return {
    match,
    diffPercent,
    diffPixels,
    totalPixels,
    threshold,
    imageSize: { width, height },
    referenceSize: { width: refMeta.width, height: refMeta.height },
    targetSize: { width: targetMeta.width, height: targetMeta.height },
    regionDiffs: regionDiffs.sort((a, b) => b.diffPercent - a.diffPercent).slice(0, 5),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const referencePath = args.reference || args.ref;
  const targetPath = args.target;
  const threshold = parseFloat(args.threshold || "0.05");

  if (!referencePath || !targetPath) {
    console.error("Provide --reference <path> and --target <path>.");
    process.exit(1);
  }

  const result = await compareImages(referencePath, targetPath, threshold);
  console.log(JSON.stringify(result, null, 2));

  if (!result.match) {
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
