---
name: domain-frontend
description: HeroRank frontend — UI-only Etsy SEO tools clone; page inventory + Next→Svelte conversion knowledge
metadata:
  type: project
domain: frontend
last_analyzed: 2026-06-12
files_analyzed: [src/app/layout.tsx, src/app/(dashboard)/layout.tsx, src/app/globals.css, all 20 page.tsx, 6 components, scripts/crawl-rankhero.mjs, package.json]
---

## Architecture [PROJECT-SPECIFIC]
- Next.js 16 App Router, React 19, Tailwind 4. **UI-only clone of RankHero.com** — no backend, no API routes, no data fetching.
- Every page is `"use client"` with hardcoded mock data; `useState` only for local UI (tabs, inputs, hasSearched flags, copy).
- Route groups: `(dashboard)` wraps Sidebar+Header+footer. Tools under `/tools/etsy/*` (12), plus `/tools/keyword-generator`, `/tools/rankhero-ai`.
- Design system fully in globals.css: `:root` tokens + `@theme inline` exposing them as Tailwind utilities (text-text-primary, bg-orange, etc.). Custom classes: .card, .badge-*, .score-bar, .sidebar-link, .tool-heading-*, .grade-*, animations.

## Key components (fan-in order)
- ToolPageLayout (props prefix/title/description/children) — wraps EVERY tool page. Port first.
- StatCard, Badge, ScoreBar (pure, props only). Sidebar (usePathname active), Header (showDropdown state + breadcrumb).

## Page sizes (largest first)
- shop-analyzer 518, tag-generator 462, listing-analyzer 257, landing 184, pricing 181, dashboard 158, profit-calculator 151 (useMemo), best-sellers 112, video-generator 109, rankhero-ai 94 (useRef+useEffect chat). Rest <75.

## Gotchas
- recharts in package.json deps but NEVER imported in src/ — safe to drop, no chart replacement needed.
- clsx is a dep but pages use template-literal className, not clsx() calls.
- Fonts: Geist via next/font/google (CSS vars --font-geist-sans/mono), Playfair via <head> <link>. Dropping next/font requires redefining these vars + --font-playfair or @theme inline breaks.
- AGENTS.md warns local Next.js has breaking changes vs training data — irrelevant once migrated off Next.
- scripts/crawl-rankhero.mjs hardcodes Firecrawl API key (line 11 + comment line 4). Security issue.
