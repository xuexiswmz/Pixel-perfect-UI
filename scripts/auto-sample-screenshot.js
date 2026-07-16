#!/usr/bin/env node
const sharp = require("sharp");
const { parseArgs } = require("../lib/utils");

async function dominantColor(pixels) {
  const buckets = {};
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`.toUpperCase();
    buckets[key] = (buckets[key] || 0) + 1;
  }
  return Object.entries(buckets).sort((a,b) => b[1]-a[1])[0][0];
}

async function edgeDetect(imagePath, width, height) {
  // Find vertical edges by scanning for color transitions
  const sample = await sharp(imagePath)
    .resize(Math.min(width, 1200))
    .raw().toBuffer({ resolveWithObject: true });

  const sw = sample.info.width;
  const h = sample.info.height;
  const midY = Math.floor(h / 2);
  const rowOffset = midY * sw * 3;

  const edges = [];
  let prevR = sample.data[rowOffset], prevG = sample.data[rowOffset+1], prevB = sample.data[rowOffset+2];
  for (let x = 1; x < sw; x++) {
    const idx = rowOffset + x * 3;
    const dr = Math.abs(sample.data[idx] - prevR);
    const dg = Math.abs(sample.data[idx+1] - prevG);
    const db = Math.abs(sample.data[idx+2] - prevB);
    if (dr + dg + db > 60) {
      edges.push({ x: Math.round(x * width / sw), strength: dr+dg+db });
    }
    prevR = sample.data[idx]; prevG = sample.data[idx+1]; prevB = sample.data[idx+2];
  }

  return edges.filter(e => e.strength > 120).map(e => e.x);
}

async function sampleStrip(imagePath, x, width, y, height) {
  const { data } = await sharp(imagePath)
    .extract({ left: x, top: y, width: Math.min(width, 10000), height: Math.min(height, 10000) })
    .raw().toBuffer({ resolveWithObject: true });
  return { color: dominantColor(data), width, height };
}

async function main() {
  const args = parseArgs(process.argv);
  const imagePath = args.image;

  if (!imagePath) { console.error("Provide --image"); process.exit(1); }

  const meta = await sharp(imagePath).metadata();
  const w = meta.width, h = meta.height;

  // 1. Get page background color from a corner
  const corner = await sampleStrip(imagePath, 0, 100, 0, 100);
  const center = await sampleStrip(imagePath, Math.floor(w*0.3), Math.floor(w*0.4), Math.floor(h*0.3), Math.floor(h*0.4));
  const rightEdge = await sampleStrip(imagePath, w - 100, 100, 0, 100);

  // 2. Detect vertical layout boundaries
  const edgeColumns = await edgeDetect(imagePath, w, h);
  const mainContentLeft = edgeColumns.find(e => e > 100) || 0;
  const mainContentRight = [...edgeColumns].reverse().find(e => e < w - 100) || w;

  // 3. Build plan with measured values
  const plan = {
    scope: "full-page",
    pageName: "Precision Reconstruction",
    preciseOverrides: {
      pageShell: {
        backgroundColor: corner.color,
        maxWidth: `${w}px`,
      },
      sections: {
        Header: {
          backgroundColor: center.color,
          padding: "16px 32px",
        },
        MainContent: {
          backgroundColor: corner.color,
          padding: "24px 0",
          gap: "24px",
        },
      },
      components: {},
    },
    sections: [
      {
        name: "Header",
        role: "Top navigation",
        layout: "horizontal shell",
        styles: {
          backgroundColor: center.color !== corner.color ? center.color : undefined,
          padding: "16px 32px",
        },
      },
      {
        name: "MainContent",
        role: "Primary content area",
        layout: "stack",
        styles: {
          backgroundColor: corner.color,
          padding: "24px 0",
        },
      },
    ],
    tokens: {
      color: {
        bg: corner.color,
        surface: center.color !== corner.color ? center.color : "#FFFFFF",
        border: "#E2E8F0",
        text: { primary: "#0F172A", secondary: "#475569", muted: "#64748B" },
        brand: { primary: "#2563EB", accent: "#7C3AED" },
      },
    },
  };

  console.log(JSON.stringify({
    measurements: {
      pageWidth: w,
      pageHeight: h,
      cornerBg: corner.color,
      centerBg: center.color,
      rightEdgeBg: rightEdge.color,
      layoutHints: {
        mainContentLeft,
        mainContentRight,
        contentWidth: mainContentRight - mainContentLeft,
        detectedEdges: edgeColumns.slice(0, 10),
      },
    }, plan
  }, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
