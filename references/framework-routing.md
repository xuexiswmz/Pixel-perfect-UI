# Framework Routing

Choose the target framework in this order:

1. Explicit user instruction
2. Existing project structure
3. Existing dependency hints
4. Skill default

## HTML

Choose when:

- the user asks for static HTML and CSS
- the repo is plain HTML
- the deliverable is a standalone landing page artifact

Output:

- semantic HTML
- linked stylesheet unless the user asked for inline or Tailwind-only output

## React / Next.js-Style JSX

Choose when:

- the repo uses `.jsx` or `.tsx`
- the project has React-like component structure
- the user asks for React or Next.js output

Output:

- component file
- local style file unless Tailwind is requested

Do not create route loaders, server actions, or fetch logic unless the request needs them.

## Vue

Choose when:

- the repo uses `.vue`
- the user asks for Vue or Nuxt-style component output

Output:

- single-file component when possible
- scoped style block or utility-class output

## Svelte

Choose when:

- the repo uses `.svelte`
- the user asks for Svelte output

Output:

- one `.svelte` component
- local `<style>` block or utility-class output

## Existing Project Detection Hints

Use these clues:

- `package.json` dependencies
- file extensions in the target route
- nearby import patterns
- router folder names such as `app`, `pages`, `views`, or `routes`

If the stack is mixed, follow the local route or local component neighborhood instead of the repo-wide majority.
