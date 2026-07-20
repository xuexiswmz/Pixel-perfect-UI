#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectGeneratedText(root) {
  const chunks = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      chunks.push(collectGeneratedText(entryPath));
    } else if (/\.(?:html|jsx|tsx|vue|svelte|css|scss|less|md|json)$/.test(entry.name)) {
      chunks.push(fs.readFileSync(entryPath, "utf8"));
    }
  }
  return chunks.join("\n");
}

function run() {
  const repoRoot = path.resolve(__dirname, "..");
  const examplePath = path.join(repoRoot, "assets/templates/visual/page-analysis.example.json");
  const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));

  assert(example.fidelityMode === "pixel-perfect", "public example must use pixel-perfect fidelity mode");
  assert(example.readiness === "ready", "public example must be a fully measured ready plan");
  assert(example.referenceRaster && example.cssViewport, "public example must declare raster and CSS viewport");
  assert(Number.isFinite(example.devicePixelRatio), "public example must declare DPR");
  assert(
    example.referenceRaster.width === example.cssViewport.width * example.devicePixelRatio &&
      example.referenceRaster.height === example.cssViewport.height * example.devicePixelRatio,
    "public example must satisfy raster = viewport × DPR",
  );
  assert(Array.isArray(example.regions) && example.regions.length > 0, "public example must contain named regions");
  assert(example.regions.every((region) => region.box && region.parentSection), "every public example region needs a box and parent section");
  assert(!example.tokens?.radius?.pill, "public example must not include an unmeasured pill token");
  assert(!example.tokens?.shadow, "public example must not include unmeasured shadows");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-perfect-ui-example-test-"));
  try {
    const generated = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "scripts/generate-visual-scaffold.js"),
        "--file",
        examplePath,
        "--stack",
        "react",
        "--css",
        "scss",
        "--out",
        outDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert(generated.status === 0, `public example generation failed: ${generated.stderr || generated.stdout}`);

    const combined = collectGeneratedText(outDir);
    assert(
      !/visual content goes here|Primary narrative content|Secondary supporting panel|Card grid content/.test(combined),
      "public example generated placeholder copy",
    );
    assert(combined.includes("Measured interface heading"), "public example visible text was not rendered");

    console.log("PASS");
    console.log("  public example has a complete coordinate contract: ✓");
    console.log("  public example contains measured named regions: ✓");
    console.log("  public example generates without placeholder copy: ✓");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
