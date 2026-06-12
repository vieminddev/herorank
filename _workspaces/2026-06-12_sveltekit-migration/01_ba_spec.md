# Migration Spec: HeroRank — Next.js → SvelteKit (Svelte 5)

**Type:** Refactor / Framework Migration
**Author:** BA
**Date:** 2026-06-12
**Branch:** migrate-sveltekit
**Target stack:** SvelteKit + Svelte 5 (runes) + Tailwind CSS 4 + `@sveltejs/adapter-cloudflare`

---

## 1. Current State

A Next.js 16 (App Router, React 19) app — UI-only clone of RankHero.com. **No backend, no data fetching** — every page renders hardcoded mock data and uses client-side `useState` only for local UI interactivity (tabs, inputs, "has searched" toggles, copy-to-clipboard). This makes the migration **pure presentational porting** — no server logic, no API routes, no auth backend to preserve.

Key facts discovered:
- All 20 page files are `"use client"`. There is **no server-only code** in the app tree.
- **`recharts` is listed in `package.json` but NOT imported anywhere in `src/`.** Safe to drop entirely. No chart component needs replacement.
- Icons: `lucide-react` everywhere → maps 1:1 to `lucide-svelte`.
- `clsx` is a dependency but currently pages use template-literal `className` strings, not `clsx()` calls. Keep `clsx` available; engineers may use it but no forced migration.
- Styling: Tailwind v4 already (`@import "tailwindcss"` + `@theme inline` in globals.css). PostCSS uses `@tailwindcss/postcss`. **globals.css ports almost verbatim.**
- Fonts: Geist Sans + Geist Mono via `next/font/google`; Playfair Display via `<link>` in `<head>`. CSS references `--font-geist-sans`, `--font-geist-mono`, `--font-playfair`.
- Layout tokens `--sidebar-width: 260px`, `--header-height: 56px` drive layout via inline `style`.

**Problems with current codebase (motivation):** vendor lock-in to Next.js, heavier client bundle, and deploy target is Cloudflare — SvelteKit + adapter-cloudflare is the desired runtime.

---

## 2. Target State

- SvelteKit project deployable to Cloudflare via `@sveltejs/adapter-cloudflare`.
- Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`) for all interactivity.
- Tailwind 4 via `@tailwindcss/vite` (SvelteKit uses Vite, not PostCSS-in-Next).
- Visual + behavioral parity with current app. Same routes, same mock data, same interactions.
- No `recharts`. No hardcoded secrets.

---

## 3. File Mapping (Next.js → SvelteKit)

SvelteKit route groups use `(group)` folders exactly like Next.js. Each route folder gets a `+page.svelte`; layouts are `+layout.svelte`.

### Routes (pages)

| Next.js source | SvelteKit target |
|---|---|
| `src/app/layout.tsx` | `src/routes/+layout.svelte` (+ `src/app.html` for `<head>` font links) |
| `src/app/page.tsx` | `src/routes/+page.svelte` |
| `src/app/pricing/page.tsx` | `src/routes/pricing/+page.svelte` |
| `src/app/auth/login/page.tsx` | `src/routes/auth/login/+page.svelte` |
| `src/app/auth/signup/page.tsx` | `src/routes/auth/signup/+page.svelte` |
| `src/app/(dashboard)/layout.tsx` | `src/routes/(dashboard)/+layout.svelte` |
| `src/app/(dashboard)/dashboard/page.tsx` | `src/routes/(dashboard)/dashboard/+page.svelte` |
| `src/app/(dashboard)/tools/rankhero-ai/page.tsx` | `src/routes/(dashboard)/tools/rankhero-ai/+page.svelte` |
| `src/app/(dashboard)/tools/keyword-generator/page.tsx` | `src/routes/(dashboard)/tools/keyword-generator/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/best-sellers/page.tsx` | `src/routes/(dashboard)/tools/etsy/best-sellers/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/etsy-trends/page.tsx` | `src/routes/(dashboard)/tools/etsy/etsy-trends/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/niche-finder/page.tsx` | `src/routes/(dashboard)/tools/etsy/niche-finder/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/shop-analyzer/page.tsx` | `src/routes/(dashboard)/tools/etsy/shop-analyzer/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/listing-analyzer/page.tsx` | `src/routes/(dashboard)/tools/etsy/listing-analyzer/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/buyer-check/page.tsx` | `src/routes/(dashboard)/tools/etsy/buyer-check/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/rank-check/page.tsx` | `src/routes/(dashboard)/tools/etsy/rank-check/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/profit-calculator/page.tsx` | `src/routes/(dashboard)/tools/etsy/profit-calculator/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/tag-generator/page.tsx` | `src/routes/(dashboard)/tools/etsy/tag-generator/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/title-generator/page.tsx` | `src/routes/(dashboard)/tools/etsy/title-generator/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/description-generator/page.tsx` | `src/routes/(dashboard)/tools/etsy/description-generator/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/listing-studio/page.tsx` | `src/routes/(dashboard)/tools/etsy/listing-studio/+page.svelte` |
| `src/app/(dashboard)/tools/etsy/video-generator/page.tsx` | `src/routes/(dashboard)/tools/etsy/video-generator/+page.svelte` |

### Components & assets

| Next.js source | SvelteKit target |
|---|---|
| `src/components/layout/Sidebar.tsx` | `src/lib/components/layout/Sidebar.svelte` |
| `src/components/layout/Header.tsx` | `src/lib/components/layout/Header.svelte` |
| `src/components/tools/ToolPageLayout.tsx` | `src/lib/components/tools/ToolPageLayout.svelte` |
| `src/components/ui/StatCard.tsx` | `src/lib/components/ui/StatCard.svelte` |
| `src/components/ui/Badge.tsx` | `src/lib/components/ui/Badge.svelte` |
| `src/components/ui/ScoreBar.tsx` | `src/lib/components/ui/ScoreBar.svelte` |
| `src/app/globals.css` | `src/app.css` (imported once in root `+layout.svelte`) |

> Import alias note: Next.js `@/components/...` → SvelteKit `$lib/components/...`. The `$lib` alias is built-in (maps to `src/lib`).

---

## 4. Per-File Inventory

Line counts are approximate (source lines). Interactivity column lists the local state each file owns.

### Shared components (port FIRST — pages depend on them)

| Component | ~Lines | State/Interactivity | Deps | Port notes |
|---|---|---|---|---|
| `ToolPageLayout` | 57 | none | none | Takes props `prefix?` (default "Etsy"), `title`, `description`, and `children`. → `$props()` with default; render children via `{@render children()}`. Wraps every tool page. **Highest fan-in — port before any tool page.** |
| `StatCard` | 39 | none | none | Props `label`, `value`, `subtitle?`, `class?` (rename `className`→`class`). Default `class = ""`. |
| `Badge` | 25 | none | none | Props `level` ("high"\|"medium"\|"low"\|"nodata"), `label?`. Has internal `defaultLabels` map. Pure. |
| `ScoreBar` | 52 | none | none | Props `label`, `score`, `maxScore?`=100, `showScore?`=true. Computes `percentage`/`level` → use `$derived`. Inline `style` width/background stays. |
| `Sidebar` | 139 | reads route (`usePathname`) for active link | lucide-react (16 icons), next/link, next/navigation | `usePathname` → `$page.url.pathname` (or `page` from `$app/state`). `<Link href>` → `<a href>`. `navigation` array of groups stays as-is. `{#each}` over groups + items; active = `pathname === item.href`. **Dynamic `<Icon/>` component**: in Svelte render via `<svelte:component this={item.icon}/>` or Svelte 5 `{@const Icon = item.icon}` then `<Icon/>`. |
| `Header` | 135 | `showDropdown` toggle + breadcrumb derived from path | lucide-react (4 icons), next/link, next/navigation, useState | `useState(false)` → `$state(false)`. Breadcrumb built from `pathname.split` → `$derived`. Outside-click overlay `<div onClick=close>` → `onclick`. `<Link>`→`<a>`. |

### Static pages (no/low interactivity)

| Page | ~Lines | State/Interactivity | Deps | Port notes |
|---|---|---|---|---|
| `page.tsx` (landing) | 184 | none (static marketing page) | lucide-react (17 icons), next/link | Pure render. Many icon imports; large JSX → many `<a>` + sections. No `$state`. |
| `dashboard/page.tsx` | 158 | none | lucide-react (16 icons), next/link | Static tool-grid. `toolGroups` data array stays. `{#each}` over groups/tools, dynamic icon component. No `$state`. |

### Auth pages

| Page | ~Lines | State/Interactivity | Deps | Port notes |
|---|---|---|---|---|
| `auth/login/page.tsx` | 70 | `email`, `password`, `remember`, `loading` | next/link, useState | Controlled inputs → `bind:value`. `remember` checkbox → `bind:checked`. Form submit handler is mock (sets loading). `onSubmit`→`onsubmit`, `preventDefault`. |
| `auth/signup/page.tsx` | 64 | `email`, `password`, `confirmPassword`, `loading` | next/link, useState | Same pattern as login. |

### Tool pages — simple (single tool layout + a few state flags)

| Page | ~Lines | State | Deps (lucide + components) | Port notes |
|---|---|---|---|---|
| `title-generator` | 49 | `description`, `hasGenerated`, `copiedIdx` | Copy,Check,Sparkles; ToolPageLayout | Copy-to-clipboard sets `copiedIdx`. `{#if hasGenerated}` result block. |
| `rank-check` | 57 | `listingUrl`, `keyword`, `hasSearched` | Search,TrendingUp/Down,Minus; ToolPageLayout | `{#if hasSearched}` results. |
| `listing-studio` | 61 | `uploaded`, `generated`, `generating` | Upload,Sparkles,Image; ToolPageLayout | Mock upload→generate flow, conditional blocks. |
| `description-generator` | 64 | `productInfo`, `hasGenerated`, `copied` | Copy,Check,Sparkles; ToolPageLayout | Copy flag + `{#if hasGenerated}`. |
| `buyer-check` | 68 | `username`, `hasSearched` | Search,Star,Shield*; ToolPageLayout | Conditional results. |
| `niche-finder` | 68 | `query`, `hasSearched` | Search,Compass; ToolPageLayout, Badge | `{#each}` over niches, Badge per row. |
| `etsy-trends` | 67 | `filter` | Search,TrendingUp/Down,Minus; ToolPageLayout | Filtered list → `$derived` from `filter`. |
| `keyword-generator` | 73 | `seed`, `hasSearched`, `selectedKws[]`, `copied` | Search,Copy,Check; ToolPageLayout, Badge | Multi-select array toggle (push/filter) → `$state` array. Copy joins selected. |
| `video-generator` | 109 | `uploaded`, `generating`, `generated` | Upload,Play,Download,Image; ToolPageLayout | Mock pipeline conditionals. |
| `best-sellers` | 112 | `viewMode` ("shops"\|"listings") | Crown,ArrowUpDown; ToolPageLayout | Tab/toggle between two mock datasets → `{#if}`/`{#each}`. |
| `profit-calculator` | 151 | 7 numeric-string inputs (`itemPrice`…`etsyAds`) | ToolPageLayout (no lucide) | **`useMemo` for computed profit** → `$derived` block. All inputs `bind:value`. Parse strings to numbers in derived calc. |
| `dashboard` listed above |  |  |  |  |

### Tool pages — complex (the two big ones)

| Page | ~Lines | State | Deps | Port notes |
|---|---|---|---|---|
| `shop-analyzer` | **518** | `shopInput`, `hasSearched`, `activeTab` (TabType), `tagView` (TagView) | Search,ExternalLink,Share2,Star; ToolPageLayout, StatCard, ScoreBar | Largest file. Multi-tab interface (overview/…) + tag/keyword sub-view toggle. Lots of mock data objects + nested `{#each}`. Uses StatCard + ScoreBar heavily. **Port shared components first.** Watch: many inline `style={{...}}` objects → Svelte `style="..."` string. |
| `tag-generator` | **462** | `keyword`, `location`, `hasSearched`, `selectedTags[]`, `activeTab`, `copied` | Search,Copy,X,AlertTriangle,Check; ToolPageLayout, Badge | Second largest. Tabbed results (tags/…); selectable tag chips (array toggle); copy-selected; competition warnings. Badge per tag. |

### Listing analyzer (medium)

| Page | ~Lines | State | Deps | Port notes |
|---|---|---|---|---|
| `listing-analyzer` | 257 | `listingInput`, `hasSearched`, `expandedScore` (ScoreKey\|null) | Search,ExternalLink,Star,Chevron*,CheckCircle,XCircle,AlertCircle; ToolPageLayout, StatCard, ScoreBar | Expand/collapse score sections (accordion) → `$state` selected key. Uses StatCard + ScoreBar. |

### rankhero-ai (chat)

| Page | ~Lines | State | Deps | Port notes |
|---|---|---|---|---|
| `rankhero-ai` | 94 | `messages[]`, `input`, `isTyping` | MessageSquare,Send,Bot,User,Sparkles; useState, **useRef, useEffect** | Chat UI. `useRef` for scroll-to-bottom + `useEffect` on messages → in Svelte: `bind:this` on the scroll container + `$effect(() => { messages; el?.scrollTo(...) })`. `INITIAL_MESSAGES` constant stays. Mock "typing" reply on send. |

---

## 5. React → Svelte 5 Conversion Conventions

Apply uniformly. These are the ONLY transformations needed (no logic changes).

| React (Next.js) | Svelte 5 |
|---|---|
| `"use client";` (top of file) | **Delete** — Svelte components are interactive by default |
| `import { useState } from "react"` | remove; use runes (no import) |
| `const [x, setX] = useState(v)` | `let x = $state(v)` |
| `setX(newVal)` | `x = newVal` |
| `const y = useMemo(() => f(a), [a])` | `const y = $derived.by(() => f(a))` (or `$derived(expr)` for simple expr) |
| `useEffect(() => {...}, [deps])` | `$effect(() => {...})` (auto-tracks reads; no dep array) |
| `useRef(null)` + `ref={el}` | `let el = $state<...>()` + `bind:this={el}` |
| `usePathname()` | `import { page } from "$app/state"` → `page.url.pathname` |
| function props `({ title, description, children })` | `let { title, description, children } = $props()` |
| default prop `prefix = "Etsy"` | `let { prefix = "Etsy" } = $props()` |
| `children` / `{children}` | `{@render children()}` (children is a snippet) |
| `onClick={fn}` | `onclick={fn}` |
| `onChange={e => setX(e.target.value)}` on input | prefer `bind:value={x}` (checkbox: `bind:checked`) |
| `onSubmit={e => { e.preventDefault(); ... }}` | `onsubmit={(e) => { e.preventDefault(); ... }}` |
| `className="..."` | `class="..."` |
| `style={{ marginLeft: "var(--sidebar-width)" }}` | `style="margin-left: var(--sidebar-width)"` (kebab-case, string) |
| `{cond && <X/>}` | `{#if cond}<X/>{/if}` |
| `{cond ? <A/> : <B/>}` | `{#if cond}<A/>{:else}<B/>{/if}` |
| `arr.map(item => <X key={item.id}/>)` | `{#each arr as item (item.id)}<X/>{/each}` |
| `<Link href="/x">` | `<a href="/x">` (SvelteKit intercepts `<a>` for client nav automatically) |
| dynamic component `const Icon = item.icon; <Icon size={18}/>` | `{@const Icon = item.icon}` then `<Icon size={18}/>` inside `{#each}`, or `<svelte:component this={item.icon} size={18}/>` |
| `import { X } from "lucide-react"` | `import { X } from "lucide-svelte"` (same icon names) |
| `clsx(...)` | unchanged — `clsx` works in Svelte |
| `React.ReactNode` children type | drop type, use `Snippet` if typing needed |
| `{new Date().getFullYear()}` | unchanged (plain JS in `{}` expression) |

**Note on Svelte `$app/state` vs `$app/stores`:** prefer `$app/state` (`page.url.pathname`, no `$` prefix needed in markup) which is the current Svelte 5 / SvelteKit API. Engineers must use one consistently.

---

## 6. Layout Structure

### Root layout — `src/routes/+layout.svelte`
- Import global CSS once: `import "../app.css";`
- Render page content via `{@render children()}`.
- The `<html>`/`<head>`/`<body>` wrapper moves to **`src/app.html`** (SvelteKit's shell), NOT the Svelte layout. Put there:
  - `<html lang="en">`
  - Playfair Display `<link rel="preconnect">` + stylesheet links (currently in `layout.tsx` `<head>`).
  - `<body class="min-h-screen antialiased">`.
- **Fonts:** Geist Sans/Mono came from `next/font/google` injecting `--font-geist-sans`/`--font-geist-mono` CSS vars. SvelteKit has no `next/font`. Replace with either: (a) `@fontsource/geist-sans` + `@fontsource/geist-mono` npm packages, or (b) Google Fonts `<link>` in `app.html` alongside Playfair. **Whichever is chosen, the CSS vars `--font-geist-sans`, `--font-geist-mono`, `--font-playfair` must still be defined** (globals.css `@theme inline` and `body` rule depend on them). Recommendation: `@fontsource` for self-hosted reliability on Cloudflare; define the three vars in `app.css :root`. Flag as OPEN DECISION for EM.

### Dashboard layout — `src/routes/(dashboard)/+layout.svelte`
- Imports `Sidebar` + `Header` from `$lib/components/layout/`.
- Structure (ported from `(dashboard)/layout.tsx`): outer `flex` wrapper → `<Sidebar/>` (fixed) → content column with `margin-left: var(--sidebar-width)` → `<Header/>` + `<main class="flex-1 p-6">{@render children()}</main>` + footer.
- The **footer** (company/legal links, Etsy trademark, dynamic copyright year) is inline in this layout — port the markup as-is, `{new Date().getFullYear()}` works directly.

---

## 7. globals.css → app.css Notes

Ports **essentially verbatim** (it is already Tailwind 4). Keep all of:
- `@import "tailwindcss";` (line 1).
- `:root` design tokens — full palette: `--navy*`, `--teal*`, `--orange*`, semantic (`--success/warning/danger` + `-bg`), `--score-*`, neutrals (`--bg-page`, `--border*`, `--text-*`), shadows, **`--sidebar-width: 260px`**, **`--header-height: 56px`**, transitions, radii, `--background`/`--foreground`.
- `@theme inline { ... }` block — exposes tokens to Tailwind utilities (`text-text-primary`, `bg-orange`, `border-border`, etc. used throughout markup). **Must keep**, or utility classes break. Includes `--font-sans/mono/serif` mapping to the font vars.
- `body` base rule, scrollbar styling.
- Component classes used in markup: `.tool-heading-prefix`, `.tool-heading-title`, `.score-bar` + `.score-bar-fill(.high/.medium/.low)`, `.badge` + `.badge-high/medium/low/nodata`, `.card` (+ `:hover`), `.sidebar-group-label`, `.sidebar-link` (+ `:hover`, `.active`, ` svg`), animations (`@keyframes fadeIn/slideInLeft/pulse-soft`, `.animate-fade-in`, `.animate-slide-in`, `.stagger-children`), grade badges (`.grade-badge`, `.grade-a..f`).

**Only required edits:**
1. Tailwind 4 in SvelteKit is wired via **`@tailwindcss/vite`** plugin in `vite.config.ts`, not `@tailwindcss/postcss`. The `@import "tailwindcss"` line stays the same.
2. Ensure `--font-geist-sans/mono` and `--font-playfair` are defined (see §6 fonts decision) since `@theme inline` and `body` reference them.

**Acceptance:** every utility class and custom class currently rendered must resolve identically. No token renamed.

---

## 8. Ownership Split — 3 Engineers (no file overlap)

Balanced by total source lines. Shared components are a **shared dependency**: assigned to Engineer A, who ports them FIRST and signals completion before B/C wire tool pages that import them. A also owns root + dashboard layout and app.css so the foundation is single-owned.

### Engineer A — Foundation + big page (shop-analyzer)  (~total ≈ 1150 lines)
Owns the shared base everyone depends on, plus the single largest page.
- `src/app.css` (from globals.css)
- `src/app.html` (head/fonts shell)
- `src/routes/+layout.svelte` (root)
- `src/routes/(dashboard)/+layout.svelte` (dashboard layout + footer)
- `src/lib/components/layout/Sidebar.svelte` (139)
- `src/lib/components/layout/Header.svelte` (135)
- `src/lib/components/tools/ToolPageLayout.svelte` (57)
- `src/lib/components/ui/StatCard.svelte` (39)
- `src/lib/components/ui/Badge.svelte` (25)
- `src/lib/components/ui/ScoreBar.svelte` (52)
- `src/routes/(dashboard)/tools/etsy/shop-analyzer/+page.svelte` (518)
- Config: `svelte.config.js` (adapter-cloudflare), `vite.config.ts` (@tailwindcss/vite + sveltekit), `package.json` scripts, `tsconfig`/`.svelte-kit` setup, `app.d.ts`.

### Engineer B — tag-generator + analyzers + auth + chat  (~total ≈ 1064 lines)
- `src/routes/(dashboard)/tools/etsy/tag-generator/+page.svelte` (462)
- `src/routes/(dashboard)/tools/etsy/listing-analyzer/+page.svelte` (257)
- `src/routes/(dashboard)/tools/rankhero-ai/+page.svelte` (94)
- `src/routes/auth/login/+page.svelte` (70)
- `src/routes/auth/signup/+page.svelte` (64)
- `src/routes/(dashboard)/tools/etsy/buyer-check/+page.svelte` (68)
- `src/routes/(dashboard)/tools/etsy/rank-check/+page.svelte` (57)

### Engineer C — landing + dashboard + remaining tools  (~total ≈ 1051 lines)
- `src/routes/+page.svelte` (landing, 184)
- `src/routes/pricing/+page.svelte` (181)
- `src/routes/(dashboard)/dashboard/+page.svelte` (158)
- `src/routes/(dashboard)/tools/etsy/profit-calculator/+page.svelte` (151)
- `src/routes/(dashboard)/tools/etsy/best-sellers/+page.svelte` (112)
- `src/routes/(dashboard)/tools/etsy/video-generator/+page.svelte` (109)
- `src/routes/(dashboard)/tools/keyword-generator/+page.svelte` (73)
- `src/routes/(dashboard)/tools/etsy/etsy-trends/+page.svelte` (67)
- `src/routes/(dashboard)/tools/etsy/niche-finder/+page.svelte` (68)
- `src/routes/(dashboard)/tools/etsy/title-generator/+page.svelte` (49)
- `src/routes/(dashboard)/tools/etsy/description-generator/+page.svelte` (61)
- `src/routes/(dashboard)/tools/etsy/listing-studio/+page.svelte` (61)

**Dependency ordering:** A delivers shared components + app.css + layouts first → B and C unblock for any page importing `$lib/components/*`. B and C can scaffold/port markup in parallel before A's components land, but final wiring needs A's components present. No two engineers touch the same file at any time.

---

## 9. Other Requirements

### 9.1 Do NOT install `recharts`
Confirmed: `recharts` is in `package.json` deps but **never imported in `src/`**. New SvelteKit `package.json` must OMIT recharts entirely. No chart library replacement needed.

### 9.2 New `package.json` dependencies
- Add: `@sveltejs/kit`, `svelte` (^5), `@sveltejs/adapter-cloudflare`, `@sveltejs/vite-plugin-svelte`, `vite`, `tailwindcss` (^4), `@tailwindcss/vite`, `lucide-svelte`, `clsx`, `typescript`, `svelte-check`, font packages (`@fontsource/geist-sans`, `@fontsource/geist-mono` if chosen).
- Remove: `next`, `react`, `react-dom`, `lucide-react`, `recharts`, `eslint-config-next`, `@tailwindcss/postcss`, `@types/react*`.
- Keep `@mendable/firecrawl-js` ONLY if the crawl script is retained (it's a dev/tooling script, not app code) — list under devDependencies.

### 9.3 `package.json` scripts (standard SvelteKit)
```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  }
}
```
(SvelteKit `vite build` invokes adapter-cloudflare. Drop Next's `start`/`lint` Next variants.)

### 9.4 `scripts/crawl-rankhero.mjs` — remove hardcoded secret
Current file hardcodes `const API_KEY = 'fc-d12...166';` (line 11) AND repeats it in the header comment (line 4). Required change:
- Replace with `const API_KEY = process.env.FIRECRAWL_API_KEY;`
- Add a guard: if `!API_KEY`, log an error and exit (`process.exit(1)`) so it fails loudly instead of sending an undefined key.
- Remove the API key from the header comment (lines 3-5).
- Same applies to `scripts/test-firecrawl.mjs` — VERIFY and scrub if it also hardcodes the key.
- This is a security fix (the key was committed to the repo). Flag for EM: the leaked key should be **rotated** in Firecrawl regardless, since git history still contains it.

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Shared components ported wrong → all tool pages break | High | Engineer A ports + smoke-tests the 6 components + layouts before B/C wire pages. |
| Font vars (`--font-geist-*`, `--font-playfair`) undefined after dropping `next/font` | Medium | §6 mandates defining the three vars in app.css; choose @fontsource vs `<link>`. Verify headings (Playfair) render. |
| `usePathname` → wrong Svelte API (`$app/stores` vs `$app/state`) inconsistency | Medium | Standardize on `$app/state` `page.url.pathname` across Sidebar + Header. |
| Inline `style={{}}` objects (many in shop-analyzer/Header) mis-converted | Medium | Convert to kebab-case CSS strings; spot-check computed widths (ScoreBar, sidebar). |
| Dynamic icon component pattern (`item.icon`) not Svelte-idiomatic | Low | Use `{@const Icon = item.icon}` inside `{#each}`. Documented in §5. |
| `recharts` accidentally reintroduced | Low | Explicit "do not install" rule; it was never imported. |
| Tailwind 4 wired via PostCSS instead of Vite plugin | Medium | A owns vite.config.ts; use `@tailwindcss/vite`, not `@tailwindcss/postcss`. |
| `bind:value` on numeric inputs (profit-calculator) yields strings | Low | Already strings in current code (`useState("25.00")`); parse in `$derived`. Parity preserved. |
| **AGENTS.md warns Next.js here has breaking changes** | N/A for target | We are leaving Next.js — irrelevant to SvelteKit output, but engineers must NOT copy Next-specific APIs. |

---

## 11. Acceptance Criteria

- **Given** the migrated app, **when** running `npm run dev`, **then** all 20 routes render at the same paths with no console errors.
- **Given** any tool page, **when** loaded, **then** the `ToolPageLayout` hero (serif "Etsy" prefix + teal title) and description render identically to current.
- **Given** the sidebar, **when** on a route, **then** the matching nav link shows `.active` styling (driven by `page.url.pathname`).
- **Given** the header, **when** clicking the account avatar, **then** the dropdown toggles open/closed (and closes on outside click).
- **Given** shop-analyzer / tag-generator, **when** switching tabs or selecting tags/chips, **then** state updates and conditional sections render as before.
- **Given** profit-calculator, **when** editing any input, **then** computed profit (now `$derived`) recalculates live.
- **Given** rankhero-ai, **when** sending a message, **then** the list appends and auto-scrolls to bottom.
- **Given** login/signup, **when** typing, **then** inputs are two-way bound; submit toggles loading (mock, no backend).
- **Given** `npm run build`, **then** it produces a Cloudflare-compatible build via adapter-cloudflare with **no `recharts`** in the bundle.
- **Given** `scripts/crawl-rankhero.mjs`, **when** run without `FIRECRAWL_API_KEY`, **then** it exits with an error; **no API key string** exists anywhere in the file.
- **Edge cases:** empty search inputs render the pre-search/empty state; copy-to-clipboard sets the "copied" flag and reverts; breadcrumb on deep routes (`/tools/etsy/shop-analyzer`) renders each segment correctly.

---

## 12. Assumptions

1. Pixel-perfect visual + behavioral **parity** is the goal — no redesign, no new features, no real backend wiring.
2. All data stays **hardcoded mock data** as in the current app (no API/data-loading migration).
3. `$app/state` (Svelte 5 / current SvelteKit) is available in the target version; if pinned to older SvelteKit, fall back to `$app/stores` consistently — flagged for EM.
4. Font delivery method (`@fontsource` vs Google `<link>`) is an EM/engineer decision; spec only mandates the three CSS vars remain defined.
5. The crawl scripts are dev tooling, retained but secret-scrubbed; the Firecrawl key will be rotated out-of-band (git history exposure).
6. No `next.config.ts`, `eslint-config-next`, or `postcss.config.mjs` carry over; replaced by `svelte.config.js` + `vite.config.ts`.
7. Engineer line-count balance is approximate; the binding constraint is **zero file overlap**, which is satisfied.
