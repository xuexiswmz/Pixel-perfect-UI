# Script Contracts

This file defines the intended input and output contract for each bundled script.

## Contents

- Visual patch planning and repository location
- Visual reconstruction planning and scaffolding
- Screenshot auto-sampling and region measurement
- Fidelity verification
- Skill installation

## plan-visual-patch.js

Purpose:

- convert a screenshot-guided patch request into semantic search hints for existing-project patching

CLI:

```bash
node scripts/plan-visual-patch.js --input "In the screenshot, add a green outlined button to the right of the second hero CTA"
node scripts/plan-visual-patch.js --file patch-request.txt
```

Input:

- `--input`: screenshot-guided patch description
- `--file`: path to a plain-text patch request
- `--region`: optional forced semantic region label
- `--anchor`: optional forced visible-text anchor
- `--query`: optional forced locate-target query
- `--insertion`: optional forced insertion type
- `--intent`: optional short patch intent override

Output JSON:

- `mode`: `visual-patch-existing`
- `patchIntent`: normalized patch request
- `targetCount`: number of semantic patch targets
- `multiTarget`: whether more than one target was extracted
- `targets`: array of per-target patch plans
- `combinedQuery`: merged search hints across all targets
- `combinedAnchor`: merged visible-text anchors across all targets
- `targetRegion`: first target's semantic region for backward compatibility
- `relation`: first target's relative placement for backward compatibility
- `query`: first target's search keywords for backward compatibility
- `anchor`: first target's visible-text anchor for backward compatibility
- `insertionType`: first target's `before | after | append | replace | wrap` value for backward compatibility
- `styleHints`: merged string array of style descriptors
- `assumptions`: string array
- `confidence`: `low | medium`

Target object:

- `id`: stable target identifier
- `targetRegion`: semantic UI region such as `hero`, `sidebar`, `card`, or `header-toolbar`
- `relation`: relative placement such as `inside`, `below`, `right-of`, or `after`
- `patchIntent`: target-local normalized patch request
- `query`: search keywords for `locate-target.js`
- `anchor`: extracted visible-text anchor if available
- `insertionType`: `before | after | append | replace | wrap`
- `styleHints`: string array of style descriptors
- `assumptions`: string array
- `confidence`: `low | medium`

## locate-visual-patch-targets.js

Purpose:

- chain screenshot-guided patch planning with repo-local target location for one or more semantic UI regions

CLI:

```bash
node scripts/locate-visual-patch-targets.js --root . --input "In the screenshot, add a green outlined button to the right of the second hero CTA"
node scripts/locate-visual-patch-targets.js --root . --file patch-request.txt --limit 3
```

Input:

- `--root`: project root to scan with `locate-target.js`
- `--input`: screenshot-guided patch description
- `--file`: path to a plain-text patch request
- `--limit`: optional candidate count per target, default `3`
- all optional overrides supported by `plan-visual-patch.js`

Output JSON:

- `mode`: `visual-patch-existing`
- `root`: resolved scan root
- `patchIntent`: normalized patch request
- `targetCount`: number of semantic patch targets
- `multiTarget`: whether more than one target was extracted
- `combinedQuery`: merged search hints across all targets
- `combinedAnchor`: merged visible-text anchors across all targets
- `targets`: array of resolved target objects
- `summary.readyCount`: count of high-confidence targets
- `summary.reviewCount`: count of medium-confidence targets that need review
- `summary.unresolvedCount`: count of targets without candidates

Resolved target object:

- all fields from `plan-visual-patch.js` target output
- `locate`: raw `locate-target.js` result for this target
- `status`: `ready | review | unresolved`
- `summary`: short human-readable location summary

## locate-target.js

Purpose:

- rank likely host files and anchors before patching an existing project

CLI:

```bash
node scripts/locate-target.js --root . --query "pricing faq" --anchor "hero"
```

Input:

- `--root`: project root to scan
- `--query`: business or module keywords
- `--anchor`: optional nearby anchor text
- `--limit`: optional max result count

Output JSON:

- `root`: absolute scan root
- `query`: input query
- `anchor`: input anchor
- `candidates`: ranked array

Candidate object:

- `framework`: detected local framework flavor
- `locatorEngine`: `typescript-ast | markup-tree`
- `file`: relative file path
- `score`: numeric ranking score
- `confidence`: `low | medium | high`
- `reasons`: why this file matched
- `bestNodes`: ranked structural node candidates inside the file

Node candidate object:

- `path`: structural path such as `main > section.pricing > div.grid`
- `tag`: matched markup tag
- `line`: starting line number
- `depth`: nesting depth
- `text`: trimmed visible text preview
- `id`: matched ID if present
- `classes`: matched classes if present
- `score`: node score
- `confidence`: `low | medium | high`
- `insertionType`: suggested patch type
- `reasons`: why the node ranked highly

## plan-visual-reconstruction.js

Purpose:

- transform a screenshot analysis or visual-description text into a reconstruction plan before code generation

CLI:

```bash
node scripts/plan-visual-reconstruction.js --input "full-page landing screenshot with hero, feature cards, testimonials, faq"
node scripts/plan-visual-reconstruction.js --file measured-plan.json
node scripts/plan-visual-reconstruction.js --input "..." --format markdown
```

Input:

- `--input`: screenshot analysis text or visual description
- `--file`: path to a text or JSON visual analysis file
- `--format`: `json | markdown`

Output:

- `scope`
- `pageName`
- `fidelityMode`: `high-fidelity | pixel-perfect`
- `readiness`: `ready | ready-with-estimates | measurement-draft | blocked-by-measurements`
- `validationErrors`: missing exact measurements that block pixel-perfect generation
- `referenceRaster`, `cssViewport`, `devicePixelRatio`, `coordinateSpace`, `regions`, `measurements`, and `captureEnvironment` when supplied
- `shell`
- `sections`
- `components`
- `tokens` using grouped token families such as `color`, `space`, `radius`, `shadow`, `typography`, and `layout`
- `assemblySteps`

Use this script before writing code from a full-page screenshot so the page gets decomposed into reusable pieces first.

In `pixel-perfect` mode, natural-language input without exact measurements returns `blocked-by-measurements` and does not invent sections or design tokens. Declared JSON components and their styles take precedence over inferred components.
Renderable named regions containing `visibleText`, `assetSource`, or `componentName` become measured components and must declare `parentSection`; verification-only regions remain regions only.

## generate-visual-scaffold.js

Purpose:

- convert a visual reconstruction plan JSON into a page scaffold with sections, components, token files, and an assembly guide

CLI:

```bash
node scripts/generate-visual-scaffold.js --file assets/templates/visual/page-analysis.example.json --stack react --css scss --out generated-visual-ui
node scripts/generate-visual-scaffold.js --input "{\"scope\":\"full-page\",...}" --stack html --css css
```

Input:

- `--input`: raw plan JSON string
- `--file`: path to plan JSON
- `--stack`: `html | react | vue | svelte`
- `--css`: `css | tailwind | less | scss`
- `--out`: target output directory

Output:

- `stack`
- `cssMode`
- `outDir`
- `pageName`
- `created`: array of generated files

Generated artifacts typically include:

- page entry file
- section files that reflect inferred layout kinds such as split hero shells, card grids, rails, or stacked bodies
- component files
- visual plan copy
- visual token file
- assembly guide
- style token and page style files for non-Tailwind modes

In `pixel-perfect` mode:

- recoverable incomplete plans are normalized to `ready-with-estimates` and still generate code
- recovery uses a DPR 1 capture baseline, full-page section, section-level verification regions, inferred ownership, and box-derived typography estimates when those values are absent
- recovered plans without visible renderable regions set `intermediateOnly: true` and must not be treated as a final deliverable
- generation exits with code `2` only when the reference raster itself is unavailable and a baseline cannot be constructed
- section boxes, positioning, declared styles, and component styles are preserved
- raster-coordinate boxes are converted to CSS pixels from `referenceRaster` and `cssViewport`
- component boxes use `parentSection` or `relativeBox`; a uniquely referenced repeated component can infer its parent section
- visual defaults such as gradient pills, rounded cards, and shadows are disabled
- Tailwind targets also receive a neutral `page.css` and `tokens.css` so measured precision styles are not lost

## auto-sample-screenshot.js

Purpose:

- sample objective screenshot structure before semantic planning without inventing design defaults

CLI:

```bash
node scripts/auto-sample-screenshot.js --image reference.png
node scripts/auto-sample-screenshot.js --image reference.png --sample-width 1200 --mask-threshold 18
```

Input:

- `--image`: reference raster path
- `--sample-width`: analysis width, default `1200`
- `--mask-threshold`: distance from the detected background used to classify foreground
- `--band-threshold`: minimum profile density used to detect visual bands

Output:

- exact reference raster width and height; CSS viewport and DPR remain unresolved until supplied from the capture environment
- sampled dimensions and scale
- valid `#RRGGBB` background color
- foreground coverage
- foreground content bounds
- horizontal and vertical bands
- strong rule candidates
- confidence notes
- a `measurement-draft` pixel-perfect plan with no invented semantic sections

## extract-measurements.js

Purpose:

- extract region-level raster measurements from named boxes

CLI:

```bash
node scripts/extract-measurements.js --image reference.png --file measured-plan.json --output measured-plan.with-raster.json
```

Input:

- `--image`: reference raster path
- `--file` or `--input`: JSON containing `regions` or `sections`
- `--output`: optional path for the merged plan and extracted measurements
- each region requires `name` and `region` or `box` with `x`, `y`, `width`, and `height`
- set `role` or `kind` to `heading`, `title`, `text`, or `label` to request a line-count hint

The script preserves the input plan and returns a merged plan whose top-level and `measurements.regions` entries contain the measured regions.

Output per region:

- clamped raster box
- dominant and inner background colors
- foreground bounds and absolute foreground bounds
- foreground centroid
- ink coverage
- horizontal bands and inferred text line count
- edge density

RGBA images, negative coordinates, small regions, and boxes crossing image boundaries are normalized safely.

## capture-screenshot.js

Purpose:

- capture a deterministic target raster with local Chrome/Chromium before fidelity verification

CLI:

```bash
node scripts/capture-screenshot.js \
  --url http://127.0.0.1:3000 \
  --width 1453 \
  --height 837 \
  --dpr 2 \
  --output target.png \
  --metadata-output target.capture.json
```

Input:

- `--url` or `--file`: rendered page URL or local HTML file
- `--width`, `--height`: CSS viewport dimensions
- `--dpr`: device pixel ratio
- `--output`: target PNG path
- `--metadata-output`: optional JSON capture report
- `--executable`: optional Chrome/Chromium executable override
- `--color-scheme`: `dark | light`
- `--selector`: optional element-only capture
- `--full-page`: optional full-page capture; exact viewport raster checks apply only to viewport captures
- `--wait-ms`, `--wait-until`, `--timeout`: optional stability controls
- `--allow-incomplete-assets`: diagnostic override; otherwise broken or incomplete images block capture

Behavior:

- launches local Chrome/Chromium through `playwright-core`
- freezes CSS animations and transitions
- waits for `document.fonts.ready` and image completion
- rejects broken image assets by default
- captures at `CSS viewport × DPR`
- verifies viewport captures have the expected raster dimensions

Output:

- CSS viewport, DPR, expected and actual raster dimensions
- font/image readiness and animation-freeze status
- browser executable and output paths

## verify-fidelity.js

Purpose:

- compare a rendered target screenshot against a reference without allowing uniform backgrounds to dilute visible-content errors

CLI:

```bash
node scripts/verify-fidelity.js --reference reference.png --target target.png
node scripts/verify-fidelity.js \
  --reference reference.png \
  --target target.png \
  --regions-file measured-plan.json \
  --diff-output fidelity-diff.png \
  --min-score 95
```

The first form is diagnostic only. Pixel-perfect acceptance requires `--regions-file` or `--regions`.

Input:

- `--reference` or `--ref`: reference raster
- `--target`: target capture
- `--threshold`: per-pixel color-distance threshold, default `0.05`
- `--mask-threshold`: foreground/background threshold, default `18`
- `--min-score`: required composite and named-region score, default `95`
- `--regions-file` or `--plan`: JSON containing `regions`, `keyRegions`, or `measurements.regions`
- `--regions`: inline region JSON
- `--diff-output`: optional PNG heatmap path
- `--allow-size-mismatch`: keep normalized size-mismatch diagnostics explicit; it never waives the exact acceptance gate

Output:

- `match`, `baseCompositeScore`, `semanticPenalty`, and final `compositeScore`
- `pixelPerfectEligible`, which is false when raster dimensions differ or named regions are absent
- raw pixel, foreground, foreground-IoU, row-profile, column-profile, and size scores
- exact-dimension status and background-aware coverage diagnostics
- worst 4×4 foreground regions
- named-region foreground bounds, similarity, IoU, text line bands, and line-count match
- actionable issues and optional diff artifact path
- ordered `recoveryActions` describing how to recapture or patch the next iteration

Mismatched raster dimensions fail even though the target is normalized internally for diagnostic scoring.
An otherwise identical image without named regions remains diagnostic-only and cannot return `match: true`.
Named heading line-count mismatches apply a semantic score penalty because wrapping errors are structural, not antialiasing noise.

## install-skill.js

Purpose:

- install this skill into one or more IDE-local skill folders

CLI:

```bash
node scripts/install-skill.js --ai codex
node scripts/install-skill.js --ai cursor
node scripts/install-skill.js --ai all --install-deps
```

Input:

- `--ai`: target IDE key or `all`
- `--target`: root folder where IDE folders live, defaults to current directory
- `--install-deps`: when present, runs `npm install --omit=dev` in each installed target

Output JSON:

- `targetRoot`
- `installDeps`
- `installed`: array of `{ ai, path }`
