#!/usr/bin/env node
const { renderAllPrecisionCss, renderBoxLayoutCss } = require("../lib/page-styles");

function run() {
  const plan = {
    sections: [
      {
        name: "FloatingPanel",
        layout: "stack",
        positioning: "absolute",
        box: { x: 20, y: 40, width: 300, height: 200 }
      },
      {
        name: "RegularSection",
        layout: "stack",
        positioning: undefined,
        box: undefined
      }
    ]
  };

  const css = renderAllPrecisionCss(plan);

  const checks = [
    css.includes("position: absolute"),
    css.includes("left: 20px"),
    css.includes("top: 40px"),
    css.includes("width: 300px"),
    css.includes("height: 200px"),
    css.includes("floating-panel"),
    !css.includes("regular-section"), // no box → no CSS generated
  ];

  const pass = checks.every(Boolean);

  console.log(pass ? "PASS" : "FAIL");
  checks.forEach((ok, i) => {
    const labels = ["position:absolute", "left:20px", "top:40px", "width:300px", "height:200px", "selector:floating-panel", "!selector:regular-section"];
    console.log("  " + labels[i] + ":", ok ? "✓" : "✗");
  });
  console.log("\nGenerated CSS:\n" + css);

  process.exit(pass ? 0 : 1);
}

run();
