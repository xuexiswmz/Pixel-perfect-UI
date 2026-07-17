#!/usr/bin/env node

const { pageStyles, renderAllPrecisionCss } = require("../lib/page-styles");
const { normalizePlan } = require("./generate-visual-scaffold");

function run() {
  const plan = normalizePlan({
    fidelityMode: "pixel-perfect",
    referenceRaster: { width: 600, height: 400 },
    cssViewport: { width: 300, height: 200 },
    coordinateSpace: "reference-raster-px",
    tokens: { color: { bg: "#000000", text: { primary: "#FFFFFF" } } },
    sections: [
      {
        name: "FloatingPanel",
        layout: "stack",
        positioning: "absolute",
        box: { x: 20, y: 40, width: 300, height: 200 },
        styles: {
          fontFamily: "Inter, sans-serif",
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          gridTemplateColumns: "1fr 1fr",
          overflow: "hidden",
        },
      },
      { name: "RegularSection", layout: "stack" },
    ],
    components: [
      {
        name: "TextList",
        parentSection: "FloatingPanel",
        box: { x: 40, y: 60, width: 100, height: 40 },
        styles: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderLeft: "1px solid #222" },
      },
    ],
  });

  const css = renderAllPrecisionCss(plan);
  const base = pageStyles(plan, "css", "default");
  const checks = [
    [css.includes("position: absolute"), "position:absolute"],
    [css.includes("left: 10px"), "raster-to-css left:10px"],
    [css.includes("top: 20px"), "raster-to-css top:20px"],
    [css.includes("width: 150px"), "raster-to-css width:150px"],
    [css.includes("height: 100px"), "raster-to-css height:100px"],
    [css.includes("font-family: Inter, sans-serif"), "font-family"],
    [css.includes("letter-spacing: -0.02em"), "letter-spacing"],
    [css.includes("white-space: nowrap"), "white-space"],
    [css.includes("grid-template-columns: repeat(3, 1fr)"), "component grid"],
    [css.includes("border-left: 1px solid #222"), "single-side border"],
    [css.includes('[data-component="text-list"]'), "component box selector"],
    [css.includes("left: 10px") && css.includes("width: 50px"), "component box converted relative to parent"],
    [!css.includes("regular-section"), "no invented regular-section styles"],
    [!base.includes("linear-gradient(135deg"), "no gradient theme in pixel-perfect mode"],
    [!base.includes("border-radius: var(--radius-pill)"), "no pill default in pixel-perfect mode"],
    [plan.sections[0].box.x === 20, "normalize preserves box"],
    [plan.sections[0].positioning === "absolute", "normalize preserves positioning"],
  ];

  const pass = checks.every(([ok]) => ok);
  console.log(pass ? "PASS" : "FAIL");
  checks.forEach(([ok, label]) => console.log(`  ${label}: ${ok ? "✓" : "✗"}`));
  process.exit(pass ? 0 : 1);
}

run();
