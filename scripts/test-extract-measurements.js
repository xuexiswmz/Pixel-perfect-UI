#!/usr/bin/env node
const sharp = require("sharp");
const { execSync } = require("child_process");
const fs = require("fs");

async function run() {
  const dir = ".tmp-test";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const imgPath = `${dir}/test-orange.png`;

  // Create a solid orange RGB image
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 102, b: 51 } }
  }).png().toFile(imgPath);

  const plan = JSON.stringify({
    regions: [
      { name: "box", region: { x: 10, y: 10, width: 80, height: 80 } },
    ]
  });

  const cmd = `node scripts/extract-measurements.js --image ${imgPath} --input '${plan}'`;
  const stdout = execSync(cmd, { encoding: "utf8" });
  const output = JSON.parse(stdout);

  const color = output.regions[0].styles.backgroundColor;
  const pass = color === "#FF6633";

  console.log(pass ? "PASS" : "FAIL");
  console.log("  Extracted:", color, "Expected: #FF6633", pass ? "✓" : "✗");

  process.exit(pass ? 0 : 1);
}

run().catch(err => { console.error(err.message); process.exit(1); });
