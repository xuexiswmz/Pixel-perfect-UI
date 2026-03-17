# Input Modes

Use the smallest workflow that safely fits the evidence available.

## 1. One-Line Prompt

Use this mode when the user gives a brief request such as:

- "Build a pricing section"
- "Make a hero block for a SaaS page"
- "Add a testimonial module"

What to do:

1. Infer the page or module type.
2. Infer the likely structure.
3. Infer required states.
4. Detect or choose the stack.
5. Detect or choose the style mode.
6. State assumptions before or alongside the output.

Minimum output:

- semantic structure
- responsive behavior
- hover or interactive states if relevant
- empty assumptions list

## 2. PRD or Requirement Document

Use this mode when the user gives detailed product or UI requirements.

First classify the document:

- `ui`: page structure, components, layout, styling, responsive behavior, and visible states
- `business`: workflows, permissions, validation rules, API behavior, data models, and submission logic
- `mixed`: one PRD contains both

For a mixed PRD, split it before generating code:

- `ui-slice`: routes, sections, information hierarchy, component tree, and view states
- `business-slice`: rules, integrations, field semantics, permissions, workflow transitions, and data contracts

Use this skill to implement only the `ui-slice`. Treat the `business-slice` as assumptions, blockers, or handoff notes unless the repo already contains the required business behavior nearby.

Extract:

- page list
- module list
- CTA hierarchy
- information hierarchy
- data entry fields
- loading, empty, success, and error states
- responsive requirements

Convert the document into:

- route or file plan
- component tree
- styling plan
- generation order
- business dependency list if the PRD is mixed

## 3. Mockup, Wireframe, or UI Image

Use this mode when the user provides a prototype, screenshot, or visual design.

Priority order:

1. visible structure
2. spacing and layout
3. typography
4. color and elevation
5. visible state treatment
6. responsive interpretation

Rules:

- reproduce what is visible before inventing missing details
- do not swap the visual style unless the user asks
- if only one state is visible, infer the minimum additional states needed for usability
- if the screenshot covers a full page, split it into shell, sections, repeated components, and token hints before generating code
- for full-page screenshots, generate reusable components first and assemble the final page last

## 4. Existing Project Patch

Use this mode when the user wants to add or modify one local module in an existing codebase.

Examples:

- "Add a new FAQ block below pricing"
- "Insert a stats strip after the hero"
- "Replace the sidebar promo card"

Required actions:

1. detect the stack from the repo
2. locate the page or host component
3. locate the nearest semantic anchor
4. determine insertion type
5. determine style ownership
6. apply a minimal diff

Never default to a full-page rewrite for local patch work.

## 5. Screenshot-Guided Existing Patch

Use this mode when the user provides a screenshot, mockup, or visual crop and asks to change one visible area in the current project.

Examples:

- "在图里的 hero 右下角加一个状态徽标"
- "把截图左侧导航第二项改成绿色高亮"
- "在这个空状态卡片下面补一个次级按钮"
- "把图片中右上角工具区的图标按钮样式改圆一些"

Required actions:

1. inspect the image and identify the visual region
2. split multi-part requests into one or more semantic UI targets
3. describe nearby anchors such as text, icon meaning, section role, or card type
4. convert each target into repo-search keywords
5. locate the most likely host file and node for each target
6. apply the smallest local patch per target

Do not search by pixel coordinates alone. Use semantic structure first, then use placement clues such as left sidebar, top-right toolbar, hero CTA row, or empty-state card body.

## 6. Mixed PRD Triage

Use this workflow when one document includes both style requirements and business requirements.

Examples of UI signals:

- hero
- dashboard layout
- card grid
- sidebar
- modal
- spacing
- typography
- Tailwind
- responsive

Examples of business signals:

- approval flow
- permission matrix
- role-based access
- endpoint
- API integration
- submit and retry
- validation rules
- state machine
- database field mapping

What to do:

1. Identify the strongest UI deliverable.
2. Separate visual requirements from domain behavior.
3. Build the frontend structure and states that can be implemented safely.
4. Mark the remaining business behavior as dependencies, assumptions, or follow-up tasks.

Do not let business details expand this skill into a full application-logic planner.
