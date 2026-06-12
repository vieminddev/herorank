---
name: project-sveltekit-migration
description: QA patterns and gotchas for the herorank Next.js → SvelteKit migration, including build blockers, icon renames, and cleanup steps
metadata:
  type: project
---

[PROJECT-SPECIFIC] SvelteKit migration QA findings on herorank.

**Why:** 3 engineers ported Next.js to SvelteKit — QA verify task caught these issues.

**How to apply:** Reference when doing future QA on this repo or similar migrations.

## Build Blocker
`postcss.config.mjs` is a Next.js leftover that conflicts with SvelteKit+Tailwind v4.
SvelteKit uses `@tailwindcss/vite` in `vite.config.ts` — no PostCSS needed.
If build fails with "Cannot find module '@tailwindcss/postcss'" — delete `postcss.config.mjs`.

## lucide-svelte 0.469 Icon Renames
- `BarChart3` → `ChartColumn`
- `Wand2` → `Wand`
- `Home` → `House` (if used as icon; text "Home" in Header.svelte is not an icon)

## Svelte 5 Type Narrowing
TypeScript narrows `const` union types aggressively. A ternary like
`x === "a" ? "b" : x === "b" ? "c" : "d"` where `x: "a"|"b"|"c"` will error at the
last branch because TypeScript knows `x` must be `"c"` and comparing `"c" === "b"` has no overlap.
Fix: pass the value directly or cast to string.

## Next.js Leftover Files to Delete
- `src/app/` — Next.js app router directory
- `src/components/` — old .tsx components
- `next.config.ts`
- `eslint.config.mjs`
- `postcss.config.mjs`

## Svelte 4 Syntax Check
`grep -rn "export let\|^\$:" src/routes src/lib` — should return 0 matches in Svelte 5 migration.
