---
name: pixel-perfect-ui
description: Reconstruct or patch frontend UI from screenshots, mockups, design images, and existing-page comparisons with a measured pixel-perfect workflow. Use when Codex must reproduce visible layout, typography, wrapping, spacing, borders, component morphology, icons, assets, and responsive baseline behavior in HTML, React, Next.js-style JSX, Vue, or Svelte; when the user asks for pixel-level restoration, high-fidelity screenshot-to-code, exact visual matching, or screenshot-guided local UI correction; and when implementation must be rendered, captured, diffed, automatically corrected, and delivered as working code rather than a validation report. Do not use as the primary workflow for backend APIs, permissions, data modeling, or business logic without a visual UI target.
---

# Pixel-perfect-UI

## Outcome

Turn a visual reference into working frontend code and iteratively correct it until the rendered result matches the reference as closely as the environment permits.

Always deliver code. Treat measurement gaps, raster mismatches, and fidelity failures as internal correction signals—not as the final response.

Never hand off:

- only `blocked-by-measurements`
- only `match: false`
- only a diff report
- an empty recovered shell marked `intermediateOnly: true`

## Supported Work

- Reconstruct a full page from a screenshot or mockup.
- Reconstruct a section or component from a cropped visual reference.
- Patch an existing page until it matches a reference screenshot.
- Correct one or more screenshot-identified regions inside an existing project.
- Preserve the current HTML, React, Vue, Svelte, CSS, Tailwind, Less, or SCSS stack.

Keep backend orchestration, permissions, persistence, and non-trivial business state outside this skill unless the user explicitly includes them.

## Non-Negotiable Fidelity Rules

- Treat the reference image as the visual source of truth.
- Preserve component morphology: lists remain lists, ruled grids remain ruled grids, rectangular controls do not become pills, and borderless regions do not become cards.
- Do not add unobserved headings, badges, gradients, shadows, containers, or decorative controls.
- Preserve visible copy and heading line counts at the baseline viewport.
- Reuse actual logos, icons, images, and fonts when available.
- Do not let a large uniform background dilute foreground errors.
- Do not resize mismatched screenshots and call the result pixel-perfect.
- Finish the supplied desktop or baseline viewport before adding inferred responsive variants.

## Core Workflow

### 1. Inspect the Target

Inspect the reference and the destination project before generating code.

Determine:

- full page, section, component, or existing-page patch
- framework and style system
- target route and host component
- visible sections and repeated components
- exact text, icons, images, and UI state

For existing projects, preserve local naming, component boundaries, routing, tokens, and style ownership.

### 2. Lock the Coordinate Model

Keep these values separate:

- `referenceRaster`: physical PNG pixels
- `cssViewport`: browser viewport in CSS pixels
- `devicePixelRatio`: raster pixels per CSS pixel
- `coordinateSpace`: normally `reference-raster-px`

Require:

`referenceRaster = cssViewport × devicePixelRatio`

If the original DPR is unknown, use a normalized DPR `1` baseline whose CSS viewport equals the reference raster. Mark it as an estimate and continue.

### 3. Measure the Reference

Run:

```bash
node scripts/auto-sample-screenshot.js --image <reference.png>
```

Use the result for raster dimensions, background, foreground coverage, visual bands, and rule candidates. Do not treat unlabeled bands as semantic sections without visual inspection.

Create named regions for dominant content such as:

- navigation and search
- hero heading and supporting copy
- statistics
- CTA groups
- cards, lists, grids, and dividers
- logos, icons, illustrations, and images
- lower content and footer boundaries

Then run:

```bash
node scripts/extract-measurements.js \
  --image <reference.png> \
  --file <measured-plan.json> \
  --output <measured-plan.with-raster.json>
```

Read `references/visual-measurement-guide.md` for the exact region, typography, asset, and coordinate schema.

### 4. Build and Recover the Exact Plan

Set `fidelityMode` to `pixel-perfect`.

Prefer a fully measured `ready` plan. If the plan is `measurement-draft` or `blocked-by-measurements`, recover it internally:

- normalize unknown or inconsistent viewport/DPR to a DPR `1` baseline
- create a measured full-page section when section labels are incomplete
- seed verification regions
- infer the smallest containing `parentSection`
- estimate first-pass typography from region boxes and line counts
- preserve every estimate in `recoveryActions`
- continue as `ready-with-estimates`

Use estimated values only for the first render. Replace them from the diff.

If recovery produces `intermediateOnly: true`, continue visual decomposition and add renderable regions before any user handoff.

### 5. Generate or Patch Code

For a new reconstruction:

```bash
node scripts/generate-visual-scaffold.js \
  --file <measured-plan.json> \
  --stack <html|react|vue|svelte> \
  --css <css|tailwind|less|scss> \
  --out <output-directory>
```

Replace remaining structural slots with measured content. Renderable regions containing `visibleText`, `componentName`, or `assetSource` must become real components.

For an existing page:

1. Run `scripts/locate-target.js` or `scripts/locate-visual-patch-targets.js`.
2. Confirm the host file, component path, insertion type, and style destination.
3. Patch the smallest owning module.
4. Keep unrelated markup unchanged.

### 6. Capture Deterministically

Start the implementation and capture it at the locked CSS viewport and DPR:

```bash
node scripts/capture-screenshot.js \
  --url <http://127.0.0.1:port> \
  --width <css-width> \
  --height <css-height> \
  --dpr <dpr> \
  --output <target.png> \
  --metadata-output <target.capture.json>
```

The capture must:

- wait for `document.fonts.ready`
- wait for images
- reject broken assets by default
- freeze transitions and animations
- verify `cssViewport × DPR` equals the output raster

Use equivalent browser automation when local Chrome/Chromium is unavailable.

### 7. Compare and Correct

Run:

```bash
node scripts/verify-fidelity.js \
  --reference <reference.png> \
  --target <target.png> \
  --regions-file <measured-plan.json> \
  --diff-output <fidelity-diff.png>
```

Review:

- exact raster status
- foreground similarity and IoU
- horizontal and vertical structure profiles
- named-region bounds
- heading line counts
- worst foreground regions
- ordered `recoveryActions`

Correct in this order:

1. capture raster and DPR
2. page and section geometry
3. typography, font source, width constraints, and wrapping
4. component type and repeated structure
5. borders, rules, radius, shadows, and opacity
6. logos, icons, images, and colors

Recapture and rerun verification after every meaningful correction.

### 8. Recover Instead of Stopping

Apply these rules whenever verification fails:

- Raster mismatch: recapture using the returned integer CSS viewport and DPR before changing layout code.
- Missing measurements: generate a `ready-with-estimates` baseline, then replace estimates after the first diff.
- Heading line mismatch: correct font family, weight, size, line height, letter spacing, and width.
- Bounds mismatch: apply the measured delta to the owning section or component.
- Missing asset: locate the real source or create a cropped reference fallback, then continue.
- No named regions: add semantic regions and rerun verification.

Only stop automatic recovery when the reference raster cannot be read or a required external resource is genuinely unobtainable. Even then, return the best code already produced and identify the remaining approximation.

## Completion Gate

Do not claim completion until:

- working code exists in the requested project or output directory
- `intermediateOnly` is false
- reference and target raster dimensions match
- valid named regions are present
- dominant-region bounds are within the configured tolerance
- heading line counts match
- fonts and assets loaded during capture
- a diff artifact and machine-readable report exist
- remaining approximations are disclosed

Default exact tolerances:

- dominant element bounds: `2px`
- long rules and dividers: `1px`
- heading line count: exact
- verifier score: project threshold or default `95`

## Output Contract

Return:

- created or modified file paths
- target framework and style mode
- capture viewport, DPR, and raster
- final fidelity scores and named-region issues
- diff artifact path
- any unresolved font, asset, or platform-rendering approximation

Do not return internal plans or validation failures without the generated code.

## Resource Routing

Read only what the task requires:

- Exact reconstruction workflow: `references/visual-reconstruction-pipeline.md`
- Measurement schema: `references/visual-measurement-guide.md`
- Script CLI contracts: `references/script-contracts.md`
- Framework conventions: `references/framework-routing.md`
- CSS mode conventions: `references/css-output-matrix.md`
- Existing-page location: `references/patch-location-strategy.md`
- Screenshot-guided local patching: `references/visual-patch-existing.md`
- Token schema: `references/design-token-schema.md`
- IDE installation: `references/ide-installation.md`

## Verification Commands

Run core regression checks:

```bash
npm run verify:all
```

Run browser capture checks when Chrome/Chromium is available:

```bash
npm run verify:capture
```
