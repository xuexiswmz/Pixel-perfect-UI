---
name: frontend-ui-builder
description: Generate or patch frontend UI code from a brief, UI-focused PRD, wireframe, mockup, screenshot, or existing page context. Use for page structure, component composition, responsive behavior, styling, precise insertion, screenshot-guided edits, and high-fidelity or pixel-perfect screenshot reconstruction with measured geometry, typography, browser capture, visual diff, and iterative correction across HTML, React, Next.js-style JSX, Vue, and Svelte with CSS, Tailwind CSS, Less, or Sass/SCSS. Do not use this skill as the primary workflow for domain rules, API orchestration, permissions, data modeling, or non-trivial business logic.
---

# Frontend UI Builder

## Overview

Use this skill to turn UI requirements into implementation-ready frontend code, especially when the request mixes ambiguous input, visual fidelity, framework adaptation, and precise in-project placement.

This skill supports two major workflows:

1. Generate new static UI code from a brief, PRD, or visual design.
2. Patch an existing page or component by locating the correct host file, container, nesting level, and style ownership before editing.

It also supports a screenshot-guided patch workflow:

3. Read a screenshot or mockup, identify the target visual region, map that region to a likely host module in the current repo, and apply a minimal patch.

## Scope Boundary

Own the presentation layer:

- page structure
- component tree
- layout and spacing
- responsive behavior
- visible interaction states
- style-system alignment
- precise frontend placement in an existing repo

Do not own the primary implementation plan for:

- API contracts or endpoint orchestration
- data modeling or persistence rules
- role or permission logic
- approval flows, business workflows, or domain rules
- non-trivial submission logic or state machines

If a request mixes UI and business requirements, extract a UI slice first. Implement the presentational structure, note business dependencies explicitly, and leave the business slice for a separate skill or follow-up pass.

## Core Workflow

### Step 1: Classify the Input

Start by identifying the strongest source of truth:

- One-line brief: infer the missing information architecture, component tree, states, and responsive behavior before generating code.
- PRD or requirement document: extract pages, modules, interactions, empty states, loading states, error states, and CTA hierarchy.
- Mockup, wireframe, or UI image: prioritize visual fidelity. Reproduce layout, spacing, typography, color, borders, radius, shadow, alignment, and visible states before adding your own interpretation.
- Existing codebase request: treat the current project as the source of truth for stack, style system, naming, routing, and component composition.

Then classify the workstream:

- `ui`: the request is mainly about layout, components, styling, responsiveness, or frontend placement.
- `business`: the request is mainly about rules, workflows, APIs, permissions, or data behavior. Do not use this skill as the main executor.
- `mixed`: one document contains both UI and business requirements. Extract `ui-slice` and `business-slice` before continuing.

If the request is ambiguous or mixed, run `scripts/analyze-request.js` first.

### Step 2: Detect the Delivery Mode

Choose one mode early and keep the scope tight:

- `create-page`: build a full new page or screen.
- `create-component`: build a standalone section, card group, modal, form block, or other reusable module.
- `patch-existing`: insert, replace, wrap, or extend a module inside an existing page or component.
- `visual-patch-existing`: use a screenshot, mockup, or image-region description to guide a local edit in an existing codebase.
- `reconstruct-screenshot-exact`: reproduce a screenshot at one locked viewport using measured geometry and a render-capture-diff loop.

If the user asks for a small module in an existing page, do not rewrite the full page unless the surrounding structure makes it necessary.

For mixed PRDs:

1. extract routes, sections, states, and component structure into `ui-slice`
2. extract APIs, validation, permissions, workflows, and domain rules into `business-slice`
3. implement only the `ui-slice` unless the user explicitly asks for the business layer in the same turn
4. surface the `business-slice` as assumptions, integration points, or follow-up work

For `visual-patch-existing`:

1. inspect the image and identify the target visual region
2. split the request into one or more semantic regions such as `hero CTA`, `empty-state card`, `left sidebar item`, or `toolbar actions`
3. run `scripts/plan-visual-patch.js` to convert each visual target into patch keywords, anchors, insertion hints, and style clues
4. run `scripts/locate-visual-patch-targets.js` to resolve each target into candidate files and host nodes, or run `scripts/locate-target.js` per target if you need manual control
5. confirm each host path in plain language, then patch only the local module that owns that region

### Step 3: Match the Project Stack

Prefer the existing stack and style system over personal preference:

- HTML projects: generate semantic HTML plus a matching stylesheet.
- React or Next.js-style projects: generate JSX components and follow the existing file conventions.
- Vue projects: generate single-file components if the repo uses them.
- Svelte projects: generate `.svelte` components.

For styles, preserve the current project choice if detectable:

- plain CSS
- Tailwind CSS
- Less
- Sass or SCSS

Read only the relevant reference file for the chosen output target:

- `references/framework-routing.md`
- `references/css-output-matrix.md`

### Step 4: Lock Pixel-Perfect Inputs

Use this step when the user asks for pixel-perfect, exact, or measurable screenshot equivalence. Ordinary high-fidelity work may use the standard reconstruction flow unless the user also requires strict screenshot validation.

1. Record `referenceRaster`, `cssViewport`, and `devicePixelRatio` separately. Require `referenceRaster = cssViewport × DPR` and use the same browser zoom for the target capture.
2. Run `scripts/auto-sample-screenshot.js` to obtain objective page-level measurements. Treat its bands as unlabeled observations, not semantic sections.
3. Visually label sections and key elements. Record a bounding box for the page shell, navigation, hero text, stats, content grid, CTAs, lists, and other visually dominant regions.
4. Run `scripts/extract-measurements.js` with those named regions. For headings, record exact visible text, line count, font family, font size, weight, line height, letter spacing, and `white-space` behavior.
5. Record the source and type of every logo, icon, illustration, and font. Reuse the actual asset when available; do not redraw it with a generic symbol.
6. Set `fidelityMode` to `pixel-perfect`. Treat `blocked-by-measurements` or `measurement-draft` as an internal recovery state, not a user-facing terminal result. Fill derivable values, create a normalized DPR 1 baseline when the original DPR is unknown, mark estimates explicitly, and continue generating code.

Read `references/visual-measurement-guide.md` for the measurement schema.

### Step 5: Generate or Patch

For new code:

1. Define the component tree.
2. Define the semantic structure.
3. Define states and responsiveness.
4. Generate the smallest complete set of files needed.

For existing code patches:

1. Run `scripts/locate-target.js` against the project root.
2. Identify the host file, host component, insertion type, and style ownership.
3. Confirm the nesting path in plain language before editing.
4. Apply the smallest possible change.

If location confidence is low, read `references/patch-location-strategy.md` before editing.

For screenshot-guided patches:

1. do not rely on raw x/y coordinates alone
2. translate the requested area into semantic structure first
3. prefer visible labels, section roles, nearby icons, card types, and button copy as anchors
4. if multiple regions look similar, rank the most likely host files and explain the ambiguity before editing

For exact reconstruction:

1. reproduce the baseline viewport first; add responsive variants only after the baseline passes
2. preserve component morphology: a text grid stays a text grid, a ruled list stays a ruled list, and a rectangular button does not become a pill
3. do not introduce unobserved cards, headings, borders, shadows, gradients, badges, or decorative containers
4. prefer measured CSS values and explicit asset dimensions over inferred design tokens
5. wait for `document.fonts.ready` and stable assets before capturing the target screenshot

### Step 6: Render, Compare, and Iterate

For `reconstruct-screenshot-exact`, completion requires a closed validation loop:

1. render the implementation in the target browser at the locked CSS viewport and DPR
2. run `scripts/capture-screenshot.js` or an equivalent browser automation tool; capture only after fonts, images, and animations are stable
3. run `scripts/verify-fidelity.js` with the reference, target, named regions, and a diff output path
4. fix the worst named region first; prioritize dimensions and section geometry, then typography and wrapping, then component shape, borders, icons, and color
5. repeat capture and verification until the threshold passes or a concrete blocker remains

Do not claim pixel-perfect fidelity without at least one target capture and diff report. If verification does not pass, report the remaining scores and issues plainly.

Failure is a correction signal, not the deliverable:

- raster mismatch: update the capture CSS viewport/DPR and recapture before editing layout
- incomplete measurements: recover a `ready-with-estimates` baseline, generate code, then replace estimates from the first diff
- line-count or box mismatch: patch the owning typography or geometry and recapture
- missing asset source: locate the real asset or crop a reference-region fallback, then continue

Only stop automatic recovery when the reference raster itself is unavailable or an external resource cannot be obtained. Even then, deliver the best generated code and identify the remaining approximation; do not return only a blocked plan.

A recovered full-page shell with no visible components is marked `intermediateOnly: true`. It is an internal artifact, never the final handoff. Continue inspecting the screenshot, add renderable named regions and components, capture, and iterate until `intermediateOnly` is false and the delivered code contains the visible page content.

### Step 7: Output Rules

Always produce code that is:

- high fidelity when a visual artifact exists
- semantically structured
- responsive by default, except that pixel-perfect work must pass the locked baseline before responsive variants are added
- consistent with the existing codebase
- explicit about file placement
- explicit about any assumptions
- explicit about any business-layer dependencies that remain unresolved

When patching an existing page, include:

- target file
- host component path
- insertion type: `before`, `after`, `append`, `replace`, or `wrap`
- style destination: local style file, component-scoped style, inline utility classes, or shared token layer

## Resource Guide

### scripts/

- `scripts/analyze-request.js`
  Use first when the input is short, mixed, or ambiguous.
  Returns normalized JSON with input mode, task mode, stack hints, CSS hints, and assumptions.

- `scripts/locate-target.js`
  Use before patching an existing page or nested component tree.
  Returns ranked candidate files, likely anchors, insertion hints, and confidence scores.

- `scripts/plan-visual-patch.js`
  Use when the user points to a screenshot or mockup and asks to add, remove, restyle, or replace something in one or more visible regions.
  Returns one or more semantic patch targets with nearby anchors, insertion hints, and style clues for `locate-target.js`.

- `scripts/locate-visual-patch-targets.js`
  Use when you want the screenshot-guided patch planner and repo locator chained together in one step.
  Returns per-target candidate files, host nodes, and readiness summaries for multi-region edits.

- `scripts/scaffold-output.js`
  Use when you want a starter output structure for a selected stack and style mode.
  Copies or renders starter templates for HTML, React, Vue, or Svelte targets.

- `scripts/plan-visual-reconstruction.js`
  Use when the source of truth is a full-page screenshot, mockup, or UI image.
  Converts screenshot observations into a page shell, section breakdown, component catalog, token hints, and assembly steps before code generation.

- `scripts/generate-visual-scaffold.js`
  Use after a visual reconstruction plan exists.
  Generates a page-level scaffold with layout-aware sections, reusable components, tokens, and an assembly guide for HTML, React, Vue, or Svelte targets. In pixel-perfect mode it automatically converts recoverable measurement gaps into a `ready-with-estimates` baseline instead of stopping.

- `scripts/auto-sample-screenshot.js`
  Run first for pixel-perfect reconstruction. Measures the exact raster size, background, foreground coverage, visual bands, and rule candidates without inventing semantic sections or design values.

- `scripts/extract-measurements.js`
  Run after defining named regions. Extracts clamped region geometry, dominant colors, foreground bounds, centroid, ink coverage, horizontal bands, and edge density; heading/text regions also receive a line-count hint.

- `scripts/verify-fidelity.js`
  Run after every target capture. Requires exact dimensions by default and reports background-aware foreground similarity, foreground IoU, row/column structure, named-region typography and geometry, worst regions, and an optional diff PNG.

- `scripts/capture-screenshot.js`
  Use for deterministic Chromium capture when a local Chrome/Chromium executable is available. Locks the CSS viewport and DPR, waits for fonts and images, freezes animations, verifies the output raster, and can write capture metadata.

### references/

- `references/input-modes.md`
  Read when deciding how to behave for one-line prompts, PRDs, images, or existing-project requests.

- `references/framework-routing.md`
  Read only for the selected framework target.

- `references/css-output-matrix.md`
  Read only for the selected style mode.

- `references/patch-location-strategy.md`
  Read when editing existing nested pages, sections, or component trees.

- `references/visual-patch-existing.md`
  Read when the request is "change the thing in this part of the screenshot" and you need to bridge image observations to repo-local patching.

- `references/script-contracts.md`
  Read when you need the CLI arguments, input schema, or output schema for the bundled scripts.

- `references/ide-installation.md`
  Read when installing this skill into Codex, Cursor, Claude, or other IDE-local skill folders.

- `references/visual-reconstruction-pipeline.md`
  Read when reconstructing a full page from a screenshot or UI image.

- `references/design-token-schema.md`
  Read when you need the current engineering-oriented token groups used by visual planning and scaffold generation.

- `references/visual-measurement-guide.md`
  Read when reconstructing a screenshot or mockup with pixel-perfect fidelity. Extract precise hex colors, pixel spacings, border radii, shadows, and typography values and include them as `preciseOverrides` and per-section/component `styles` in the visual plan JSON.

## Working Rules

- Infer responsibly when the prompt is short, then state assumptions.
- Treat UI images and prototypes as the visual source of truth.
- Prefer minimal, local edits over wide rewrites.
- Preserve existing naming, folder structure, and style conventions.
- Do not mix Tailwind, CSS modules, Less, and SCSS unless the repo already does so.
- Do not introduce a new framework if the existing project already establishes one.
- When the request is for static output, avoid adding client logic that was not requested.
- When the request is for a local module addition, do not move unrelated markup.
- Do not invent API payloads, permission models, or workflow rules unless they are already defined in the repo or explicitly supplied.
- When a PRD is mixed, implement the UI slice and record the business slice separately instead of blending both into one vague output.
- When the request references a screenshot region, convert that region into semantic UI language before searching the codebase.
- For screenshot-guided edits, treat nearby text, icon meaning, card role, and section placement as stronger anchors than approximate pixel position.
- When pixel-perfect fidelity is required, extract exact hex colors, pixel spacings, border radii, and typography values from the screenshot and pass them as `preciseOverrides` and `styles` fields in the visual plan JSON instead of relying solely on token inference.
- Exact raster dimensions are a hard gate. Do not resize mismatched screenshots and call the result pixel-perfect.
- Do not let a large uniform background dilute validation; inspect foreground, structure profiles, and named regions.
- Preserve visible text wrapping exactly for the baseline viewport. A heading line-count mismatch is a blocking fidelity error.
- Treat component type as evidence. Do not transform ruled text lists into pills, plain regions into cards, or square controls into rounded decorative controls.
- In pixel-perfect mode, use neutral scaffolding and only apply visual properties observed or measured from the reference.
- Complete the exact desktop or supplied viewport before adding inferred responsive behavior.

## Quick Execution Pattern

### For a one-line prompt

1. Run `scripts/analyze-request.js`.
2. Infer page type, module tree, states, stack, and CSS target.
3. Generate code with explicit assumptions.

### For a PRD or long requirement document

1. Detect whether the document is `ui`, `business`, or `mixed`.
2. For `mixed`, split the document into `ui-slice` and `business-slice`.
3. Extract modules, CTA hierarchy, content states, layout sections, and responsive requirements from the `ui-slice`.
4. Decide whether the request is full-page or module-level.
5. Generate files in the target framework and style mode.
6. List business dependencies, integration points, or blockers without treating them as resolved UI work.

### For a mockup or UI image

1. Inspect the image first.
2. For standard visual work, run `scripts/plan-visual-reconstruction.js` or follow `references/visual-reconstruction-pipeline.md`.
3. For pixel-perfect work, lock the viewport and run `scripts/auto-sample-screenshot.js` before planning.
4. Label key regions, add exact bounding boxes and typography, then run `scripts/extract-measurements.js`.
5. If the plan is `blocked-by-measurements` or `measurement-draft`, run automatic recovery: fill the capture baseline, infer safe ownership, mark estimated typography, and continue as `ready-with-estimates`.
6. Generate or scaffold with `fidelityMode: pixel-perfect`; preserve the measured component morphology and avoid visual defaults. Treat estimates as first-iteration values, not final truth.
7. Run `scripts/capture-screenshot.js --url <url> --width <css-width> --height <css-height> --dpr <dpr> --output <target.png>` or use equivalent browser automation.
8. Run `scripts/verify-fidelity.js --reference <ref> --target <target> --regions-file <plan> --diff-output <diff.png>`.
9. Execute the returned `recoveryActions`, correct the worst named region, and repeat until the threshold passes. Always return the generated code; report only the approximations that remain.

### For existing-page patch work

1. Run `scripts/locate-target.js`.
2. Rank the candidate host files.
3. Describe the exact insertion path.
4. Patch only the minimal required scope.

### For screenshot-guided patch work

1. Inspect the screenshot and split the request into semantic target regions.
2. Run `scripts/locate-visual-patch-targets.js` with the visual request summary and project root.
3. Review each target's candidate file, node path, and insertion type.
4. Confirm the target file, host component, nearest anchor, insertion type, and style destination for each target.
5. Apply the smallest possible patch and keep the surrounding layout intact.
