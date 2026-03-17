# Script Contracts

This file defines the intended input and output contract for each bundled script.

## analyze-request.js

Purpose:

- normalize a short brief, document excerpt, or mixed instruction into a structured request summary

CLI:

```bash
node scripts/analyze-request.js --input "<text>"
node scripts/analyze-request.js --file path/to/request.txt
node scripts/analyze-request.js --input "<text>" --stack react --css tailwind
```

Input:

- `--input`: raw text prompt
- `--file`: path to a plain-text requirement file
- `--stack`: optional forced target stack
- `--css`: optional forced style mode

Output JSON:

- `inputMode`: `brief | document | visual`
- `workstream`: `ui | business | mixed`
- `taskMode`: `create-page | create-component | patch-existing | visual-patch-existing`
- `stack`: `auto | html | react | vue | svelte`
- `cssMode`: `auto | css | tailwind | less | scss`
- `fidelity`: `standard | high`
- `deliverable`: `static-files | component-files | minimal-diff`
- `businessSignals`: string array of matched business-logic indicators
- `assumptions`: string array

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

## scaffold-output.js

Purpose:

- create starter files for a selected stack and style mode

CLI:

```bash
node scripts/scaffold-output.js --stack react --css scss --name faq-section --title "FAQ" --out generated-ui
```

Input:

- `--stack`: `html | react | vue | svelte`
- `--css`: `css | tailwind | less | scss`
- `--name`: component or module base name
- `--title`: visible title placeholder
- `--out`: output folder

Output JSON:

- `stack`
- `cssMode`
- `outDir`
- `created`: array of file paths created

Current scope:

- supports starter scaffolds, not full visual reconstruction
- meant to accelerate generation, not replace the main reasoning workflow

## plan-visual-reconstruction.js

Purpose:

- transform a screenshot analysis or visual-description text into a reconstruction plan before code generation

CLI:

```bash
node scripts/plan-visual-reconstruction.js --input "full-page landing screenshot with hero, feature cards, testimonials, faq"
node scripts/plan-visual-reconstruction.js --file references/visual-spec.json
node scripts/plan-visual-reconstruction.js --input "..." --format markdown
```

Input:

- `--input`: screenshot analysis text or visual description
- `--file`: path to a text or JSON visual analysis file
- `--format`: `json | markdown`

Output:

- `scope`
- `pageName`
- `shell`
- `sections`
- `components`
- `tokens` using grouped token families such as `color`, `space`, `radius`, `shadow`, `typography`, and `layout`
- `assemblySteps`

Use this script before writing code from a full-page screenshot so the page gets decomposed into reusable pieces first.

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
