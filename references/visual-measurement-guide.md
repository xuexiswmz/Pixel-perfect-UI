# Visual Measurement Guide

Use this schema when a screenshot or mockup must be reconstructed with measured fidelity. Exact mode requires geometry, typography, assets, and capture conditions—not only colors and spacing tokens.

## Contents

- Minimal exact plan
- Raster and CSS coordinate model
- Page shell
- Named regions and bounding boxes
- Typography
- Sections and components
- Assets and layering
- Automated measurements
- Readiness gate

## Minimal Exact Plan

```json
{
  "scope": "full-page",
  "fidelityMode": "pixel-perfect",
  "readiness": "measurement-draft",
  "referenceRaster": {
    "width": 2906,
    "height": 1674
  },
  "cssViewport": { "width": 1453, "height": 837 },
  "devicePixelRatio": 2,
  "coordinateSpace": "reference-raster-px",
  "captureEnvironment": {
    "browser": "Chromium",
    "zoom": 1,
    "colorScheme": "dark",
    "fontsReady": true,
    "animationsFrozen": true
  },
  "sections": [],
  "components": [],
  "regions": [],
  "tokens": {},
  "preciseOverrides": {}
}
```

## Raster and CSS Coordinate Model

- `referenceRaster`: physical PNG pixels used by measurement and verification.
- `cssViewport`: browser viewport in CSS pixels used for rendering.
- `devicePixelRatio`: raster pixels per CSS pixel.
- `coordinateSpace`: keep measured boxes as `reference-raster-px`.

Require `referenceRaster.width = cssViewport.width × devicePixelRatio` and the same for height. The generator converts raster boxes to CSS coordinates using the viewport/raster ratio. Do not write raster dimensions directly as CSS `width` or `height` when DPR is not `1`.

## Page Shell

Record:

- raster and viewport width/height
- device pixel ratio and browser zoom
- exact background color or image
- page overflow and scroll position
- outer border, radius, and clipping
- content origin and primary grid guides

Use explicit values such as `width`, `height`, `overflow`, `position`, and `backgroundColor` in `preciseOverrides.pageShell`.

## Named Regions and Bounding Boxes

Create a named region for every visually dominant area:

```json
{
  "name": "Hero heading",
  "role": "heading",
  "parentSection": "Hero",
  "box": { "x": 96, "y": 282, "width": 1490, "height": 532 },
  "visibleText": "Inspira UI.\nAnimated components\nfor Vue and Nuxt.",
  "expectedLineCount": 3,
  "typography": {
    "fontFamily": "Inter",
    "fontSource": "local:Inter variable font",
    "fontSize": "128px",
    "fontWeight": 700,
    "lineHeight": "0.96"
  }
}
```

Use reference-raster coordinates. Recommended tolerance:

- dominant elements: ±2 px for x/y/width/height
- long dividers and rules: ±1 px
- text line count: exact

## Typography

For every important heading, body block, label, statistic, and button, record:

- exact visible text
- line count and deliberate line breaks
- `fontFamily` and actual font file/source
- `fontSize`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `fontStyle`
- `textAlign`
- `whiteSpace`
- width constraint that controls wrapping
- opacity or exact text color

Do not infer font weight from hierarchy alone. A thin `300` heading and a bold `700` heading can have the same box but radically different foreground coverage.

## Sections

Each section may include:

```json
{
  "name": "Lower content grid",
  "role": "Two-column ruled information grid",
  "layout": "measured-grid",
  "positioning": "absolute",
  "box": { "x": 96, "y": 958, "width": 2715, "height": 548 },
  "styles": {
    "display": "grid",
    "gridTemplateColumns": "1fr 1fr",
    "borderTop": "1px solid #202124",
    "borderBottom": "1px solid #202124",
    "overflow": "hidden"
  }
}
```

In pixel-perfect mode, a section with `box` defaults to `positioning: "absolute"`; write the field explicitly when clarity matters.

Record asymmetric padding and individual border sides rather than collapsing them into a generic card style.

## Components

Record component morphology explicitly:

```json
{
  "name": "CategoryList",
  "kind": "ruled-text-grid",
  "parentSection": "Lower content grid",
  "box": { "x": 1555, "y": 1174, "width": 1150, "height": 130 },
  "styles": {
    "display": "grid",
    "gridTemplateColumns": "repeat(3, 1fr)",
    "gap": "0",
    "borderRadius": "0px"
  }
}
```

Useful `kind` values include:

- `heading`
- `body-copy`
- `button`
- `stat`
- `icon`
- `ruled-text-grid`
- `card-grid`
- `toolbar`
- `divider`

Never replace the observed kind with a visually fashionable alternative.

For a component box expressed in page-level raster coordinates, set `parentSection`. The generator converts it to coordinates relative to that section. Alternatively provide `relativeBox` directly.

A named region with `visibleText`, `assetSource`, or `componentName` is renderable. Give it `parentSection`; the planner converts it into a measured component and attaches it to that section. Regions without renderable content remain verification-only.

## Assets

For logos, icons, illustrations, and backgrounds, record:

- asset type: SVG, raster, CSS shape, font glyph
- source file or URL when available
- intrinsic width/height and rendered box
- crop/object-fit behavior
- opacity, filter, blend mode, and transform

Reuse the source asset whenever possible. A generic Unicode star is not an exact replacement for a custom logo or icon.

## Layering and Geometry

Record when visible:

- `position`, `top`, `right`, `bottom`, `left`, or `inset`
- `zIndex`
- `transform`
- flex/grid tracks and alignment
- overflow clipping
- object fit and object position
- individual margins and padding
- single-side borders

## Automated Measurements

Use:

```bash
node scripts/auto-sample-screenshot.js --image reference.png
node scripts/extract-measurements.js --image reference.png --file measured-plan.json
```

Automated values are observations. Review semantic labels, font identity, asset identity, and component kind manually.

## Readiness and Recovery

A plan is not ready for final acceptance when any of these are missing:

- exact reference raster, CSS viewport, and DPR
- named semantic sections
- bounding boxes for dominant elements
- exact heading typography and line counts
- asset and font sources
- capture environment

Mark incomplete plans as `measurement-draft` or `blocked-by-measurements`, then recover them for code generation rather than stopping. Use a normalized DPR 1 baseline for unknown capture scale, infer ownership from containing sections, and derive first-pass typography from measured boxes. Mark these values and the generated plan as `ready-with-estimates`.

Estimated readiness permits implementation and the first capture; it does not permit a pixel-perfect claim. Replace estimates using the verifier's named-region bounds, line bands, and `recoveryActions` until final acceptance passes.
