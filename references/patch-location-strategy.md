# Patch Location Strategy

Use this workflow when the user wants a local module change inside an existing page.

This workflow also applies when the user points to a visible screenshot region and wants that area changed in the current repo.

## Goal

Find the exact place to edit with the highest confidence and the smallest possible diff.

## Step 1: File-Level Search

Rank candidate files using:

- route or page name matches
- module name matches
- nearby text anchors
- framework-specific entry points
- layout or section naming

Strong file clues:

- `page`, `index`, `home`, `landing`, `pricing`, `dashboard`
- route folders such as `app`, `pages`, `views`, `routes`
- repeated business nouns from the requirement
- screenshot-derived semantic nouns such as `hero`, `sidebar`, `empty state`, `toolbar`, `avatar`, or `project card`

## Step 2: Host Component Search

Within each candidate file, locate the host subtree using:

- heading text
- class names
- IDs
- data attributes
- component names
- nearby sibling labels

Prefer semantic anchors over raw line offsets.

For screenshot-guided edits, convert the visible region into anchor types such as:

- section role: `hero`, `header`, `sidebar`, `empty state`
- nearby copy: visible button text, title text, helper text
- icon meaning: home, bell, upload, settings, avatar
- card type: project card, stat card, promo card, modal panel

Do not treat "top left at x=120" as a sufficient locator by itself.

When possible, parse markup regions into a structure tree and rank actual nodes instead of stopping at file-level search.

## Step 3: Insertion Type

Classify the required edit as one of:

- `before`
- `after`
- `append`
- `replace`
- `wrap`

Do not patch until the insertion type is clear.

## Step 4: Style Ownership

Decide whether styles belong in:

- the local component file
- the page-level stylesheet
- a sibling stylesheet
- utility classes already used by the host project

## Step 5: Confidence

Treat location as high confidence only if at least two independent signals agree:

- file path + content anchor
- component name + heading text
- route folder + class name

If confidence is low:

1. report the top candidates
2. explain the ambiguity
3. choose the safest minimal edit path

For screenshot-guided edits, confidence is strongest when at least two of these agree:

- visual region label + file path clues
- visible copy + host subtree text
- card role + class or component name
- sidebar or toolbar placement + semantic node type

## Output Contract

Before editing, describe the path in plain language:

- target file
- host component
- nearest anchor
- insertion type
- style destination

Example:

`app/page.tsx -> <main> -> PricingSection -> after the pricing grid -> add FAQ module`
