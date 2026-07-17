# Visual Reconstruction Pipeline

Use this workflow when a screenshot, full-page mockup, or polished UI image is the visual source of truth.

## Contents

- Fidelity modes
- Standard high-fidelity flow
- Pixel-perfect baseline, measurement, implementation, capture, and diff
- Acceptance criteria
- Responsive work

## Choose the Fidelity Mode

- `high-fidelity`: preserve the design language and structure; small inferred values are acceptable when the reference does not expose them.
- `pixel-perfect`: reproduce one locked raster and capture environment. Missing measurements are blockers, not permission to invent defaults.

## Standard High-Fidelity Flow

1. detect the page shell
2. split the page into semantic sections
3. identify repeated component patterns
4. extract visual tokens
5. infer responsive behavior
6. assemble the page from reusable pieces
7. render and visually inspect the result

Use `scripts/plan-visual-reconstruction.js` for text or JSON planning and `scripts/generate-visual-scaffold.js` when a structural scaffold is useful.

## Pixel-Perfect Flow

Follow this order without skipping the capture and comparison loop.

### 1. Lock the Baseline

Record:

- reference raster width and height
- CSS viewport width and height
- browser and rendering engine
- device pixel ratio
- browser zoom
- color scheme
- font sources and loaded weights
- animation state and reduced-motion setting

Require `referenceRaster = cssViewport × devicePixelRatio`. The target screenshot must use the same raster dimensions. A size mismatch always fails acceptance, though it may still be normalized for diagnostics.

### 2. Auto-Sample Objective Structure

Run:

```bash
node scripts/auto-sample-screenshot.js --image reference.png
```

Use the result for exact raster size, background, foreground coverage, horizontal/vertical bands, and rule candidates. The script intentionally does not invent semantic section names, typography, colors it cannot measure, or default spacing.

### 3. Build a Named Measurement Plan

Visually label the important regions and elements. Include at least:

- page shell and header
- dominant hero heading and supporting copy
- stats or prominent side content
- major grid boundaries and dividers
- CTA group
- repeated lists, cards, tags, or controls
- footer or lower content boundary when visible

Assign exact bounding boxes. Mark text regions with roles such as `heading`, `text`, or `label` so line wrapping can be checked.
Keep boxes in reference-raster pixels. Record `parentSection` for nested components so generation can convert page-level boxes into section-relative CSS coordinates.

Run:

```bash
node scripts/extract-measurements.js --image reference.png --file measured-plan.json
```

Manually complete measurements that raster sampling cannot identify reliably: font family, font weight, line height, letter spacing, exact copy, icon source, grid tracks, border sides, and stacking order.

### 4. Recover Planning Readiness

Set `fidelityMode` to `pixel-perfect`.

Treat these states as internal correction states:

- `measurement-draft`
- `blocked-by-measurements`

Recover and continue:

- if DPR is unknown, use a normalized DPR 1 baseline whose CSS viewport equals the reference raster
- if sections are missing, seed a full-page measured section
- if named regions are missing, seed section verification regions and refine them after the first diff
- if typography is unknown, use box-derived estimates marked as `estimated-system-fallback`
- if component ownership is missing, infer the smallest containing section

Mark the result `ready-with-estimates`, generate code, capture it, and replace estimates from the diff. Do not convert gaps into fashionable defaults such as generic `1200px` containers, cards, gradient buttons, or pills.

If recovery seeds only a full-page shell or verification regions, treat that output as internal scaffolding. Do not hand it to the user as the completed reconstruction; visually decompose the screenshot and populate renderable regions first.

### 5. Implement Exact-First

Reproduce the supplied viewport before responsive variants.

Use this priority order:

1. page dimensions and section boundaries
2. element bounding boxes and alignment
3. font files, weights, line height, width, and wrapping
4. component morphology and repeated grid structure
5. borders, rules, radius, shadows, and opacity
6. logos, icons, and other assets
7. color and antialiasing-level polish

Preserve what the screenshot shows:

- a ruled text list remains a ruled text list
- rectangular controls do not become pills
- a borderless region does not become a card
- a plain icon does not become a boxed icon button
- visible copy and line breaks do not change
- no heading, badge, shadow, gradient, or decoration is added without evidence

### 6. Capture Deterministically

Before capture:

- await `document.fonts.ready`
- wait for image assets to finish loading
- disable or freeze transitions, cursors, carousels, and timers
- use the locked viewport and DPR
- capture the same scroll position and page state

When local Chrome/Chromium is available, use:

```bash
node scripts/capture-screenshot.js \
  --url http://127.0.0.1:3000 \
  --width 1453 \
  --height 837 \
  --dpr 2 \
  --output target.png \
  --metadata-output target.capture.json
```

### 7. Compare and Iterate

Run:

```bash
node scripts/verify-fidelity.js \
  --reference reference.png \
  --target target.png \
  --regions-file measured-plan.json \
  --diff-output fidelity-diff.png
```

The report separates:

- exact dimension status
- raw pixel similarity
- background-aware foreground similarity
- foreground IoU
- vertical and horizontal structure profiles
- named-region bounds and line counts
- worst grid regions
- actionable issues

Named regions are mandatory for pixel-perfect acceptance. Running the verifier without them is diagnostic only.

Fix the worst named region first and repeat. A large plain background must never be used to justify a high score when the visible foreground is misplaced.

When verification fails, execute `recoveryActions` instead of returning the failure as the final deliverable. A raster mismatch means recapture at the reference raster; a line or bounds mismatch means patch and recapture. The user should still receive code after the iteration.

## Baseline Acceptance Criteria

Use project-specific thresholds when supplied. Otherwise, for a pixel-perfect claim require:

- raster dimensions exactly equal
- key-element bounding-box error no greater than 2 px
- heading line counts exactly equal
- prominent rules and dividers within 1 px
- no named region below the configured similarity threshold
- no missing fonts or fallback-font capture
- a generated diff artifact and machine-readable report

The verifier defaults to a composite score of `95`; adjust only when antialiasing or platform rendering differences are understood and documented.

## Responsive Work

Add responsive behavior after the baseline viewport passes. Preserve the baseline rules at the supplied size, then define intentional collapse behavior for narrower screens.
