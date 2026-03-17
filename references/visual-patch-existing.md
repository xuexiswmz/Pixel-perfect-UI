# Screenshot-Guided Existing Patch

Use this workflow when the user says things like:

- "在图片这个地方加一个按钮"
- "把图里左侧导航的激活态改成绿色"
- "在这个卡片底部补一个阴影"
- "把右上角头像旁边再加一个图标"

## Goal

Translate a screenshot-localized request into a repo-localized patch plan.

## Core Rule

Do not jump from pixel position directly to file edits.

Always bridge through semantic UI structure first.

## Step 1: Name the Target Region

Describe the requested area using UI structure:

- page shell: header, sidebar, main content, footer
- section: hero, project list, toolbar, empty state
- component: card, button row, icon button, avatar, badge
- relation: left of title, below hero copy, inside card footer, after toolbar icons

Bad:

- "the thing around x=240 y=700"

Better:

- "the empty-state project card under the 最近项目 heading"

## Step 2: Extract Search Anchors

Build anchors from what is visible:

- text labels: `最近项目`, `开始创作`, `首页`
- role labels: `empty-state card`, `hero CTA row`, `top-right utility actions`
- icon meaning: home, bell, avatar, folder
- placement hints: `left sidebar`, `top header`, `below hero`, `inside first card`

## Step 3: Convert to Patch Search

Use `scripts/plan-visual-patch.js` to normalize the request into:

- one or more `targets`
- each target's `targetRegion`
- each target's `query`
- each target's `anchor`
- each target's `insertionType`
- each target's `styleHints`

Then run `scripts/locate-target.js` for each target with that target's `query` and `anchor`.

If you want one command for the full bridge, run `scripts/locate-visual-patch-targets.js` instead. It will:

- produce the semantic targets
- run `locate-target.js` for each target
- return per-target candidate files and node paths
- summarize which targets are ready, review-needed, or unresolved

## Step 4: Verify Before Editing

Before patching, state:

- target file
- host component or subtree
- nearest visible anchor
- insertion type
- style destination

## Step 5: Patch Minimally

Prefer:

- one component subtree
- one local stylesheet or utility-class block
- one nearby insertion point

Avoid:

- unrelated layout rewrites
- re-theming the whole page
- guessing business logic from the screenshot

## Example Flow

Input:

- screenshot shows a hero with two buttons
- user says "在第二个按钮右边加一个绿色描边按钮，并把左侧导航第二项改成绿色高亮"

Derived plan:

- `targets[0].targetRegion`: hero CTA row
- `targets[0].query`: hero cta button action row
- `targets[0].anchor`: 开始创作 了解更多
- `targets[0].insertionType`: after
- `targets[0].styleHints`: outlined, green, pill, secondary action
- `targets[1].targetRegion`: left sidebar navigation
- `targets[1].query`: sidebar nav item active state green
- `targets[1].anchor`: 首页 项目管理
- `targets[1].insertionType`: replace or append depending on the request

Then locate each host module separately and patch only the matching local subtree.
