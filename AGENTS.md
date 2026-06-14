# HeroRank — Etsy SEO tools (SaaS)

Stack: **SvelteKit (Svelte 5 runes) + Hono (mounted tại `/api/*`) + Tailwind CSS 4 + Cloudflare Workers** (D1/KV, adapter-cloudflare). KHÔNG còn Next.js/React (đã migrate 2026-06-12).

Quy ước bắt buộc:
- Svelte 5 runes (`$state`, `$derived`, `$props()`) — không dùng syntax Svelte 4 (`export let`, `$:`)
- Business logic trong `src/lib/server/services/` (thuần TS, DI qua factory), data qua `src/lib/server/repositories/` (D1, parameterized queries)
- Mọi secret qua env (`.dev.vars` local / Workers secrets) — không hardcode
- Đọc `docs/backend-architecture.md` + `docs/etsy-data-strategy.md` trước khi thêm tính năng

Dev: `npm run dev` (vite) · `npm run check` · `npx vitest run` · wrangler dev + `wrangler d1 migrations apply DB --local`
