#!/usr/bin/env node
const sharp = require("sharp");
const { execSync } = require("child_process");
const fs = require("fs");

async function run() {
  const dir = ".tmp-test";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const refPath = `${dir}/test-ref.png`;
  const targetPath = `${dir}/test-target.png`;

  // Reference: solid red 100x100
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toFile(refPath);

  // Target: solid blue 100x100 (completely different)
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } }
  }).png().toFile(targetPath);

  const cmd = `node scripts/verify-fidelity.js --reference ${refPath} --target ${targetPath} --threshold 0.05`;
  let output;
  try {
    const stdout = execSync(cmd, { encoding: "utf8" });
    output = JSON.parse(stdout);
  } catch (e) {
    output = JSON.parse(e.stdout);
  }

  // 100% different pixels expected
  const pass = output.diffPercent >= 95;

  console.log(pass ? "PASS" : "FAIL");
  console.log("  Diff:", output.diffPercent + "%", pass ? "✓" : "✗ expected >= 95%");

  process.exit(pass ? 0 : 1);
}

run().catch(err => { console.error(err.message); process.exit(1); });
