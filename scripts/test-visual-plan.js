#!/usr/bin/env node

const { buildPlanFromText, normalizeJsonSpec, recoverPixelPerfectPlan } = require("./plan-visual-reconstruction");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const blocked = buildPlanFromText("pixel-perfect full-page screenshot");
  assert(blocked.readiness === "blocked-by-measurements", "exact text plan should be blocked without measurements");
  assert(blocked.sections.length === 0, "exact text plan must not invent sections");
  assert(Object.keys(blocked.tokens).length === 0, "exact text plan must not invent tokens");

  const ready = normalizeJsonSpec({
    scope: "full-page",
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 400, height: 200 },
    cssViewport: { width: 200, height: 100 },
    devicePixelRatio: 2,
    captureEnvironment: { browser: "Chromium", zoom: 1, fontsReady: true, animationsFrozen: true },
    sections: [{ name: "Hero", box: { x: 0, y: 0, width: 200, height: 100 }, repeatedComponents: ["TextList"] }],
    regions: [{
      name: "Hero heading",
      role: "heading",
      parentSection: "Hero",
      box: { x: 10, y: 10, width: 150, height: 60 },
      visibleText: "Measured heading",
      expectedLineCount: 2,
      typography: { fontFamily: "Inter", fontSource: "local:Inter", fontSize: "40px", fontWeight: 700, lineHeight: "44px" },
    }],
    components: [{ name: "TextList", parentSection: "Hero", kind: "ruled-text-grid", styles: { display: "grid" } }],
    tokens: { color: { bg: "#000000" } },
  });
  assert(ready.readiness === "ready", "complete exact plan should be ready");
  assert(ready.components[0].name === "TextList", "declared component should be preserved");
  assert(ready.components[0].styles.display === "grid", "declared component styles should be preserved");
  assert(ready.components.some((component) => component.name === "Hero heading"), "renderable region should become a component");
  assert(ready.sections[0].repeatedComponents.includes("Hero heading"), "renderable region should attach to its parent section");
  assert(ready.sections[0].positioning === "absolute", "exact section boxes should default to absolute positioning");

  const forcedReady = normalizeJsonSpec({
    fidelityMode: "pixel-perfect",
    readiness: "ready",
    sections: [],
  });
  assert(forcedReady.readiness === "blocked-by-measurements", "validation errors must override a forced ready state");
  const invalidRegion = normalizeJsonSpec({
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 200, height: 100 },
    cssViewport: { width: 100, height: 50 },
    devicePixelRatio: 2,
    captureEnvironment: { browser: "Chromium", zoom: 1, fontsReady: true, animationsFrozen: true },
    sections: [{ name: "Hero", box: { x: 0, y: 0, width: 200, height: 100 } }],
    regions: [{ name: "Invalid region" }],
  });
  assert(invalidRegion.readiness === "blocked-by-measurements", "regions without coordinates must block readiness");
  const offByOneRaster = normalizeJsonSpec({
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 201, height: 100 },
    cssViewport: { width: 100, height: 50 },
    devicePixelRatio: 2,
    captureEnvironment: { browser: "Chromium", zoom: 1, fontsReady: true, animationsFrozen: true },
    sections: [{ name: "Hero", box: { x: 0, y: 0, width: 201, height: 100 } }],
    regions: [{ name: "Canvas", box: { x: 0, y: 0, width: 201, height: 100 } }],
  });
  assert(offByOneRaster.readiness === "blocked-by-measurements", "raster and CSS viewport × DPR must match exactly");
  const recovered = recoverPixelPerfectPlan({
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 300, height: 200 },
  });
  assert(recovered.recoverable, "reference raster should be enough to create a generatable baseline");
  assert(recovered.plan.readiness === "ready-with-estimates", "recovered plan should be marked as estimated");
  assert(recovered.plan.cssViewport.width === 300 && recovered.plan.devicePixelRatio === 1, "unknown DPR should normalize to a DPR 1 baseline");
  const correctedScale = recoverPixelPerfectPlan({
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 201, height: 101 },
    cssViewport: { width: 100, height: 50 },
    devicePixelRatio: 2,
  });
  assert(
    correctedScale.plan.devicePixelRatio === 1 && correctedScale.plan.cssViewport.width === 201,
    "inconsistent viewport/DPR should reset to an executable DPR 1 baseline"
  );
  const routedExact = buildPlanFromText("Use this screenshot for a pixel-perfect reconstruction");
  assert(routedExact.fidelityMode === "pixel-perfect", "pixel-perfect screenshot request should route to exact reconstruction");
  assert(routedExact.readiness === "blocked-by-measurements", "unmeasured exact reconstruction should require measurement recovery");

  console.log("PASS");
  console.log("  exact text plan blocks heuristic defaults: ✓");
  console.log("  complete measured plan becomes ready: ✓");
  console.log("  declared component and styles survive normalization: ✓");
  console.log("  incomplete plan cannot force readiness: ✓");
  console.log("  exact screenshot requests route to exact mode: ✓");
  console.log("  invalid regions and off-by-one raster contracts are blocked: ✓");
  console.log("  recoverable measurement gaps become an estimated baseline instead of a terminal stop: ✓");
}

try {
  run();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
