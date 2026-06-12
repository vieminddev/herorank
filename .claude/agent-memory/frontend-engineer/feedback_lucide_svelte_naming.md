---
name: lucide-svelte-naming
description: lucide-svelte/@lucide/svelte dropped legacy numeric icon aliases — Home/BarChart3/Wand2 don't exist in recent versions; verify names against the installed package before assuming React->Svelte 1:1.
metadata:
  type: feedback
---

When porting `lucide-react` icons to `lucide-svelte`, the names do NOT always map 1:1. Recent lucide versions (observed in `lucide-svelte@0.469.0`) removed legacy/numeric-suffix aliases.

Confirmed renames:
- `Home` → `House`
- `BarChart3` → `ChartColumn`
- `Wand2` → `Wand`

**Why:** lucide deprecated old names; `lucide-svelte` 0.469 only ships the current PascalCase exports from `dist/icons/index.js`. Importing a dropped name fails silently at runtime / errors at build.

**How to apply:** Before assuming an icon name exists, verify against the installed package, e.g.
`python3 -c "import re;print('OK' if re.search(r'as Home\b', open('node_modules/lucide-svelte/dist/icons/index.js').read()) else 'MISSING')"`
(rtk/grep can truncate large files via SIGPIPE — python read is reliable).

Also: `lucide-svelte@0.469` icons are typed as legacy `SvelteComponentTyped` classes, NOT Svelte 5 `Component`. When typing a dynamic-icon array field, use `ComponentType` from `svelte`, not `Component`, or svelte-check errors with "provides no match for the signature".

Note: `lucide-svelte` is deprecated upstream in favor of `@lucide/svelte`; both share this naming caveat.
