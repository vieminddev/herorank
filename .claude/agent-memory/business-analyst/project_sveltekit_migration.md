---
name: project-sveltekit-migration
description: 2026-06-12 migration of HeroRank from Next.js to SvelteKit (Svelte 5) for Cloudflare deploy
metadata:
  type: project
---

Migrating HeroRank Next.js→SvelteKit + Svelte 5 runes + Tailwind 4 + @sveltejs/adapter-cloudflare. Branch migrate-sveltekit. 3 frontend engineers.

**Why:** deploy target is Cloudflare; want lighter bundle + off Next.js lock-in. Pure presentational port (no backend exists) → parity-only, no redesign.

**How to apply:** Spec at `_workspaces/2026-06-12_sveltekit-migration/01_ba_spec.md`. Ownership: Eng A = foundation (app.css, app.html, root+dashboard layouts, all 6 shared components, config, shop-analyzer). Eng B = tag-generator+listing-analyzer+rankhero-ai+auth+buyer-check+rank-check. Eng C = landing+pricing+dashboard+profit-calculator+remaining tools. A delivers components first (others depend on $lib/components). Zero file overlap.

**Open decisions for EM:** (1) font delivery @fontsource vs Google <link>; (2) $app/state vs $app/stores per SvelteKit version pin; (3) rotate leaked Firecrawl key. See [[domain-frontend]].
