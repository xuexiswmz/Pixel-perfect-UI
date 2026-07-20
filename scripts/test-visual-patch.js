#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runLocator(repoRoot, fixtureRoot, input) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts/locate-visual-patch-targets.js"),
      "--root",
      fixtureRoot,
      "--input",
      input,
      "--limit",
      "2",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert(result.status === 0, `visual patch locator failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function assertResolvedTarget(target, expectedText) {
  assert(target.status === "ready", `${target.targetRegion} target should resolve as ready`);
  assert(target.preferredCandidate.file === "index.html", `${target.targetRegion} should resolve to index.html`);
  assert(target.preferredCandidate.bestNodes[0].text === expectedText, `${target.targetRegion} resolved to the wrong visible anchor`);
}

function run() {
  const repoRoot = path.resolve(__dirname, "..");
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-perfect-ui-patch-test-"));

  try {
    fs.writeFileSync(
      path.join(fixtureRoot, "index.html"),
      [
        "<!doctype html>",
        '<html lang="zh-CN">',
        "<body>",
        '  <aside class="sidebar">',
        '    <a class="sidebar-item is-active">首页</a>',
        '    <a class="sidebar-item">项目管理</a>',
        "  </aside>",
        '  <main class="page">',
        '    <section class="hero">',
        '      <div class="hero-actions">',
        '        <a class="primary">开始创作</a>',
        '        <a class="secondary">了解更多</a>',
        "      </div>",
        "    </section>",
        "  </main>",
        "</body>",
        "</html>",
      ].join("\n"),
      "utf8",
    );

    const single = runLocator(
      repoRoot,
      fixtureRoot,
      "In the screenshot, add a green outlined button to the right of the hero CTA labeled '了解更多'",
    );
    assert(single.targetCount === 1, "single patch request should create one target");
    assert(single.summary.readyCount === 1, "single patch target should be ready");
    assertResolvedTarget(single.targets[0], "了解更多");
    assert(single.targets[0].preferredCandidate.bestNodes[0].insertionType === "after", "hero CTA patch should insert after its anchor");

    const multi = runLocator(
      repoRoot,
      fixtureRoot,
      "In the screenshot, add a green outlined button to the right of the hero CTA labeled '了解更多', and change the left sidebar item labeled '项目管理' to an active green style",
    );
    assert(multi.targetCount === 2 && multi.multiTarget, "multi-part patch request should create two targets");
    assert(multi.summary.readyCount === 2, "both patch targets should resolve as ready");
    assertResolvedTarget(multi.targets[0], "了解更多");
    assertResolvedTarget(multi.targets[1], "项目管理");

    console.log("PASS");
    console.log("  single screenshot-guided patch resolves the exact anchor: ✓");
    console.log("  multi-target patch preserves independent anchors: ✓");
    console.log("  preferred file and node are asserted: ✓");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
