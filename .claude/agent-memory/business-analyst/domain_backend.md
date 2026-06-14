---
name: domain-backend
description: HeroRank backend Phase 1 — Hono-in-SvelteKit on Workers, Better Auth (D1), Stripe billing, credits ledger
metadata:
  type: project
domain: backend
last_analyzed: 2026-06-12
files_analyzed: [docs/backend-architecture.md, docs/etsy-data-strategy.md, package.json, svelte.config.js, vite.config.ts, auth/login+signup+pricing pages, Header.svelte, (dashboard)/+layout.svelte]
---

## Architecture (chốt 2026-06-12)
- Hono mounted trong SvelteKit catch-all `src/routes/api/[...path]/+server.ts` → `app.fetch`. Một deploy unit trên Cloudflare Workers. Layers: api/ (Hono routes+middleware) → services/ (thuần TS, DI repo, no Hono import) → repositories/ (interface + D1 impl). Anti-lock-in: nhấc Hono ra Worker riêng + đổi repo adapter khi cần.
- Middleware chain mọi tool: auth → check credits → zod validate → service → trừ credits → ledger.

## Verified package facts (WebSearch 2026-06-12)
- better-auth ^1.6.16: D1 qua **Kysely D1Dialect built-in** (kysely + kysely-d1), KHÔNG cần drizzle adapter. Bọc Kysely bằng kyselyAdapter type:'sqlite'. KHÔNG dùng CamelCasePlugin cho instance Better Auth (xung đột, gh discussion #7487).
- better-auth sinh 4 bảng: user, session, account, verification — dùng `@better-auth/cli generate`, KHÔNG tự viết tay schema.
- SvelteKit: svelteKitHandler trong hooks.server.ts KHÔNG tự set locals → phải gọi auth.api.getSession() set event.locals.{user,session} thủ công. Server actions cần plugin sveltekitCookies(getRequestEvent).
- stripe ^22.2.0: PHẢI `Stripe.createFetchHttpClient()` + `constructEventAsync` để chạy Workers (không Node http/crypto).
- hono ^4.12, wrangler ^4.99.
- env.DB chỉ có trong request scope → auth phải factory createAuth(env) per-request, không module singleton.
- Routing: better-auth nuốt /api/auth/* (basePath), phần /api/* còn lại rơi xuống catch-all → Hono. Không chồng lấn.

## Credits model Phase 1
- Monthly credit POOL dùng chung mọi tool (KHÔNG daily-per-tool như pricing page mô tả — nợ kỹ thuật, BR-014).
- Ledger = nguồn sự thật (balance = SUM(delta)); subscriptions.credits_balance là cache cập nhật atomic cùng batch.
- Race: conditional UPDATE ... WHERE credits_balance >= cost + check changes() + db.batch() atomic (D1 batch = all-or-nothing, KHÔNG full transaction → tránh read-then-write).
- Webhook idempotency: bảng processed_stripe_events UNIQUE event_id.

## Plan mapping (đề xuất, PM chốt)
- Plans từ pricing page: Side Hustle $7.99/$5.99, Business $12.99/$9.99 (popular), Enterprise $49.99/$29.99. Slug side|business|enterprise + free.
- Credits/tháng đề xuất: free 30, side 750, business 3000, enterprise 9000 (≈ daily quota ×30).
- echo demo = 1 credit.

## Gotchas
- pricing/+page.svelte hardcode PLANS (line 6-34) + COMPARISON — nguồn tên+giá chính xác.
- login/signup chỉ setTimeout giả; Header hardcode "HR"/"Account" (line 86-90), Sign Out chỉ đóng dropdown.
- (dashboard)/+layout.svelte CHƯA có guard.
- Phase 1 spec: _workspaces/2026-06-12_phase1-auth-billing/01_ba_spec.md
