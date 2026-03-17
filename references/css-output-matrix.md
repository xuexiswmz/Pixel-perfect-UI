# CSS Output Matrix

Use the existing style mode whenever it is detectable.

## plain CSS

Choose when:

- the repo already uses `.css`
- the user asks for static HTML and CSS
- the component is simple and isolated

Best for:

- standalone page artifacts
- plain HTML output
- CSS modules or local styles

## Tailwind CSS

Choose when:

- the repo already uses Tailwind
- the user explicitly asks for Tailwind CSS
- utility-class composition is already dominant

Rules:

- keep class lists readable
- extract repeated patterns only if the repo already has that convention
- do not add custom plugin assumptions without evidence

## Less

Choose when:

- the repo already uses `.less`
- the design system depends on nested rules or variables already expressed in Less

Rules:

- inherit the current variable naming
- avoid introducing Sass syntax

## Sass / SCSS

Choose when:

- the repo already uses `.scss` or `.sass`
- the user explicitly asks for Sass or SCSS

Rules:

- prefer SCSS unless the repo clearly uses indented Sass
- keep token and nesting depth reasonable
- avoid deep nesting for simple modules

## Style Ownership

When patching an existing project, decide where the styles should live:

- local component style file
- page-level style file
- scoped block in a single-file component
- Tailwind classes in markup
- shared token or variable layer only when the new module needs a reusable token
