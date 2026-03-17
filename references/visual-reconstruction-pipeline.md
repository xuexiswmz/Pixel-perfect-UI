# Visual Reconstruction Pipeline

Use this workflow when the user provides a screenshot, full-page mockup, or polished UI image and expects high-fidelity code.

## Core Rule

Do not jump directly from screenshot to one large page file.

For full-page images, always:

1. detect the page shell
2. split the page vertically into sections
3. identify repeated component patterns
4. extract visual tokens
5. decide responsive behavior
6. assemble the final page from reusable pieces

## Step 1: Decide the Visual Scope

Classify the image as one of:

- `full-page`
- `section-shot`
- `component-shot`
- `mixed-collage`

For `full-page`, use the full decomposition workflow.
For `section-shot` or `component-shot`, you may skip page-shell reconstruction.

## Step 2: Extract the Page Shell

Before section-level work, identify global page attributes:

- top navigation or header presence
- main content width
- background treatment
- footer presence
- edge gutters
- major grid behavior

This defines the page shell.

## Step 3: Slice the Page into Sections

Split the page by strong visual boundaries:

- background changes
- large spacing gaps
- container breaks
- heading transitions
- card-group boundaries
- CTA or form zones

Each section should have:

- `name`
- `role`
- `approximate vertical order`
- `layout type`
- `main content blocks`

## Step 4: Identify Repeated Components

Look for recurring UI units such as:

- cards
- stat pills
- nav items
- feature tiles
- pricing blocks
- avatar clusters
- CTA buttons
- list rows
- badges

Promote repeated structures into reusable components before writing code.

## Step 5: Extract Visual Tokens

Capture the tokens visible in the screenshot:

- page background
- surface colors
- text tiers
- accent colors
- border radius scale
- border treatments
- shadow depth
- spacing rhythm
- type hierarchy

Approximate values are acceptable if they preserve visual fidelity.

Prefer grouped tokens over flat tokens:

- `color`
- `space`
- `radius`
- `shadow`
- `typography`
- `layout`

## Step 6: Infer Responsive Behavior

The screenshot is usually desktop-biased, so infer how it should collapse:

- multi-column grids stack
- nav compresses or wraps
- large hero side-by-side layouts become vertical
- wide card rows become 2-column or 1-column

Never keep desktop-only spacing on narrow screens.

## Step 7: Assembly Order

Generate in this order:

1. shell
2. section wrappers
3. repeated components
4. section composition
5. final page assembly
6. visual polish

This keeps the high-fidelity page maintainable.

If you want a file structure before writing detailed code, run `scripts/generate-visual-scaffold.js` using the plan JSON from the previous step.
The scaffold should preserve layout semantics, so a `two-column` section becomes a split lead-and-aside shell, card-heavy sections become a grid shell, and testimonial rails become horizontally assembled sections instead of generic stacked wrappers.

## Output Contract

Before generating code from a full-page screenshot, produce or internally derive:

- page shell summary
- ordered section list
- reusable component catalog
- token summary
- assembly plan

Only then generate code.

Optional automation path:

1. run `scripts/plan-visual-reconstruction.js`
2. save or pipe the JSON plan
3. run `scripts/generate-visual-scaffold.js`
4. refine each generated layout-aware section and component into high-fidelity code

## Practical Heuristics

- If two areas share the same card pattern, make one component.
- If a section uses a distinct background, treat it as its own slice.
- If typography changes mark hierarchy shifts, use them to define section boundaries.
- If a screenshot shows one state only, generate the minimum additional states needed for usable code.
