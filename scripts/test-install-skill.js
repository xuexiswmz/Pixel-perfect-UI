#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findFilesNamed(root, expectedName) {
  const matches = [];
  if (!fs.existsSync(root)) return matches;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.name === expectedName) matches.push(entryPath);
    if (entry.isDirectory()) matches.push(...findFilesNamed(entryPath, expectedName));
  }
  return matches;
}

function run() {
  const repoRoot = path.resolve(__dirname, "..");
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-perfect-ui-install-test-"));

  try {
    const install = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts/install-skill.js"), "--ai", "codex", "--target", targetRoot],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert(install.status === 0, `installer failed: ${install.stderr || install.stdout}`);

    const installedRoot = path.join(targetRoot, ".codex/skills/pixel-perfect-ui");
    assert(fs.existsSync(path.join(installedRoot, "SKILL.md")), "installed skill is missing SKILL.md");
    assert(fs.existsSync(path.join(installedRoot, "lib/utils.js")), "installed skill is missing lib/utils.js");
    assert(fs.existsSync(path.join(installedRoot, "lib/page-styles.js")), "installed skill is missing lib/page-styles.js");
    assert(findFilesNamed(installedRoot, ".DS_Store").length === 0, "installed skill must not contain .DS_Store files");

    const plan = spawnSync(
      process.execPath,
      ["scripts/plan-visual-reconstruction.js", "--input", "pixel-perfect full-page screenshot"],
      { cwd: installedRoot, encoding: "utf8" },
    );
    assert(plan.status === 0, `installed planner failed: ${plan.stderr || plan.stdout}`);

    const parsed = JSON.parse(plan.stdout);
    assert(parsed.fidelityMode === "pixel-perfect", "installed planner lost pixel-perfect routing");
    assert(parsed.readiness === "blocked-by-measurements", "unmeasured exact input should remain blocked before recovery");

    const installedPlanPath = path.join(targetRoot, "measured-plan.json");
    fs.writeFileSync(
      installedPlanPath,
      JSON.stringify({
        fidelityMode: "pixel-perfect",
        readiness: "ready",
        referenceRaster: { width: 400, height: 200 },
        cssViewport: { width: 200, height: 100 },
        devicePixelRatio: 2,
        coordinateSpace: "reference-raster-px",
        captureEnvironment: { browser: "Chromium", zoom: 1, fontsReady: true, animationsFrozen: true },
        sections: [{ name: "Hero", box: { x: 0, y: 0, width: 400, height: 200 } }],
        regions: [{
          name: "Hero heading",
          componentName: "HeroHeading",
          role: "heading",
          parentSection: "Hero",
          box: { x: 40, y: 40, width: 300, height: 80 },
          visibleText: "Measured interface heading",
          expectedLineCount: 1,
          typography: { fontFamily: "Inter", fontSource: "local:Inter", fontSize: "40px", fontWeight: 700, lineHeight: "44px" },
        }],
      }),
      "utf8",
    );

    const generatedDir = path.join(targetRoot, "generated-example");
    const generated = spawnSync(
      process.execPath,
      [
        "scripts/generate-visual-scaffold.js",
        "--file",
        installedPlanPath,
        "--stack",
        "react",
        "--css",
        "scss",
        "--out",
        generatedDir,
      ],
      { cwd: installedRoot, encoding: "utf8" },
    );
    assert(generated.status === 0, `installed generator failed: ${generated.stderr || generated.stdout}`);
    const generatedHeading = path.join(generatedDir, "src/components/HeroHeading.jsx");
    assert(fs.existsSync(generatedHeading), "installed generator did not create the measured heading component");
    assert(fs.readFileSync(generatedHeading, "utf8").includes("Measured interface heading"), "installed generator lost measured visible text");

    console.log("PASS");
    console.log("  installed runtime dependencies are present: ✓");
    console.log("  installed skill excludes operating-system metadata: ✓");
    console.log("  installed planner executes successfully: ✓");
    console.log("  installed generator executes a measured plan: ✓");
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
