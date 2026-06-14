# Feature Spec: HeroRank Phase 1 — Auth + Billing + Credits

> BA spec, 2026-06-12. Branch `migrate-sveltekit`. Phase per `docs/backend-architecture.md` §Lộ trình.
> Scope chốt: Hono skeleton mounted trong SvelteKit + Better Auth (D1) + Stripe billing 3 gói + credits system, chạy Cloudflare Workers, dev local bằng wrangler/platformProxy + D1 local. KHÔNG có Cloudflare account / Stripe key thật → secret qua env placeholder, Stripe test mode, mục tiêu: build pass + `wrangler dev` chạy + unit tests cho credits logic.

---

## 0. Verified facts (WebSearch 2026-06-12)

| Package | Phiên bản chốt | Ghi chú nguồn |
|---|---|---|
| `better-auth` | `^1.6.16` | Hỗ trợ D1 qua **Kysely D1Dialect built-in** — KHÔNG cần `@better-auth/drizzle-adapter`. Truyền `database: new Kysely({ dialect: new D1Dialect({ database: env.DB }) })` rồi bọc bằng kysely adapter. |
| `kysely` + `kysely-d1` | `kysely ^0.27`, `kysely-d1 ^0.3` | D1Dialect cho Kysely (Workers-safe, không Node deps). |
| `stripe` | `^22.2.0` | Dùng REST qua `fetch`-based client; **bắt buộc** khởi tạo với `httpClient: Stripe.createFetchHttpClient()` để chạy trên Workers (không có Node http). |
| `hono` | `^4.12.x` | Mount trong SvelteKit catch-all. |
| `wrangler` | `^4.99.x` | `wrangler.jsonc`, `wrangler dev` với `--local` D1. |
| `@cloudflare/workers-types` | latest | types cho `D1Database`, `KVNamespace`, `Env`. |
| `zod` | `^3.x` | validate body trong middleware chain. |

**Quyết định lock-in:** KHÔNG dùng plugin `@better-auth/stripe`. Tự viết Stripe integration trong service layer thuần TS → giữ nguyên tắc chống lock-in (`docs/backend-architecture.md` §Nguyên tắc chống lock-in): plan→credits mapping là business logic riêng của HeroRank, không nên buộc vào vòng đời subscription của plugin. Better Auth chỉ lo identity/session.

---

## 1. Overview

- **Mục tiêu:** dựng nền backend tối thiểu để 3 trang FE có sẵn (login, signup, pricing) + dashboard hoạt động thật: đăng ký/đăng nhập, mua gói qua Stripe, được cấp credits/tháng, gọi 1 tool demo trừ credits và ghi ledger.
- **Người dùng:** Etsy seller (end user) đăng ký tài khoản; chưa có admin panel.
- **Trong scope:** email/password auth, session, 3 gói Stripe (Side Hustle / Business / Enterprise) + free tier, credits ledger, middleware chain `auth → credits check → handler → deduct → ledger`, 1 endpoint demo `/api/tools/echo`.
- **Ngoài scope (Phase sau):** OAuth Google (UI để sẵn nút, disable hoặc "coming soon"), LLM tools thật, Etsy API, daily-limit reset theo "uses/day" trên pricing (Phase 1 dùng **monthly credit pool**, xem BR-014).

---

## 2. Current State

- FE thuần presentational (xem memory `domain-frontend`). `login`/`signup` form chỉ `setTimeout` giả loading (login `+page.svelte:7-11`, signup `:7-12`). Nút Google có sẵn (`data-testid="login-google"`).
- `pricing/+page.svelte` hardcode `PLANS` (3 gói) + `COMPARISON`; CTA hiện link `/auth/signup`, CHƯA gọi Stripe.
- `Header.svelte` hardcode avatar "HR" + chữ "Account" (`:86-90`), nút Sign Out chỉ đóng dropdown (`:118-123`). KHÔNG có credits hiển thị.
- `(dashboard)/+layout.svelte` KHÔNG có guard — ai vào `/dashboard` cũng thấy.
- Backend: chưa tồn tại. `package.json` chưa có hono/better-auth/stripe/wrangler/kysely. `svelte.config.js` dùng `adapter-cloudflare()` mặc định. Chưa có `wrangler.jsonc`, chưa có `src/hooks.server.ts`, chưa có `src/lib/server/`.

---

## 3. Proposed Solution

### 3.1 Routing precedence (quyết định then chốt)

Hai thứ cùng tranh `/api/*`:
- **Better Auth** mount qua `hooks.server.ts` → `svelteKitHandler` xử lý `/api/auth/*`.
- **Hono app** mount qua catch-all `src/routes/api/[...path]/+server.ts` → xử lý `/api/billing|me|credits|tools/*`.

**Cơ chế:** `svelteKitHandler` chạy trong `handle` hook TRƯỚC khi request tới route. Nó chỉ "nuốt" path khớp `auth.options.basePath` (mặc định `/api/auth`). Các path `/api/*` còn lại rơi xuống SvelteKit router → trúng catch-all `+server.ts` → forward sang Hono. KHÔNG chồng lấn vì base path khác nhau.

```
Request /api/auth/sign-in/email  → hooks.handle → svelteKitHandler nuốt → Better Auth
Request /api/billing/checkout    → hooks.handle (getSession, set locals) → resolve → catch-all +server.ts → Hono
```

`hooks.server.ts` LUÔN gọi `auth.api.getSession()` set `event.locals.{user,session}` cho mọi request (dùng cho SvelteKit `load`/guard), rồi mới `svelteKitHandler`.

### 3.2 Layered architecture (theo `docs/backend-architecture.md`)

```
src/routes/api/[...path]/+server.ts   → đẩy Request sang Hono app.fetch
src/lib/server/api/app.ts             → khởi tạo Hono, gắn middleware + mount routers
src/lib/server/api/routes/*.ts        → billing, me, credits, tools (Hono routers)
src/lib/server/api/middleware/*.ts    → requireAuth, requireCredits, withDb
src/lib/server/services/*.ts          → creditsService, billingService, planConfig (THUẦN TS, không import Hono)
src/lib/server/repositories/*.ts      → interface + D1 impl (userRepo, subscriptionRepo, creditsRepo)
src/lib/server/auth.ts                → cấu hình Better Auth
src/lib/server/db/schema.sql          → nguồn sự thật schema (đưa vào migrations)
migrations/0001_init.sql              → D1 migration
```

Services nhận `repo` qua tham số (DI), không tự `import` D1 → unit-testable bằng in-memory fake repo. Đây là điều cho phép QA test credits logic không cần D1.

### 3.3 Alternatives đã cân nhắc

| Quyết định | Đã chọn | Loại bỏ vì |
|---|---|---|
| Auth | Better Auth + Kysely D1Dialect | Lucia EOL; tự viết auth tốn thời gian + rủi ro bảo mật. |
| Stripe trên Workers | `stripe` SDK + `createFetchHttpClient()` | SDK mặc định dùng Node `http` → crash trên Workers. |
| Plugin `@better-auth/stripe` | Tự viết billingService | lock-in plan lifecycle; credits mapping là logic riêng. |
| Credits model Phase 1 | Monthly credit pool | pricing dùng "uses/day per tool" — mô hình daily-per-tool phức tạp (cần reset cron + per-tool counter), hoãn sang Phase sau. Phase 1: 1 gói = N credits/tháng dùng chung. |

---

## 4. Data / Business Flow

### 4.1 Signup (email/password)
1. User nhập email/password/confirm ở `signup/+page.svelte`.
2. FE validate `password === confirmPassword` client-side, gọi `authClient.signUp.email(...)`.
3. Better Auth tạo `user` + `account` (password hash) + `session`, set cookie.
4. **Hook tạo subscription "free"**: sau signup, ensure dòng `subscriptions(plan='free', status='active')` + grant credits free (xem BR-002). Cơ chế: Better Auth `databaseHooks.user.create.after` → gọi `creditsService.grantPlanCredits(userId, 'free')`.
5. Redirect `/dashboard`.

### 4.2 Login
1. `authClient.signIn.email(...)` → cookie session → redirect `/dashboard`.

### 4.3 Checkout (mua gói)
1. User authenticated bấm "Get {plan}" ở pricing → FE `POST /api/billing/checkout { plan, period }`.
2. `requireAuth` → billingService tạo/khôi phục `stripe_customer_id` (lưu vào `subscriptions`), tạo Stripe Checkout Session (mode=subscription, price theo plan+period), trả `url`.
3. FE redirect tới Stripe Checkout (test mode).
4. Stripe redirect về `success_url=/dashboard?checkout=success`.

### 4.4 Webhook → cấp credits
1. Stripe gọi `POST /api/billing/webhook`.
2. Verify signature (`stripe.webhooks.constructEventAsync` — bản async vì Workers crypto).
3. Xử lý:
   - `checkout.session.completed` → set subscription plan+status='active', `grantPlanCredits(plan)`.
   - `customer.subscription.updated` → cập nhật plan/status; nếu chu kỳ mới (`invoice.paid` hoặc period change) → grant credits tháng mới.
   - `customer.subscription.deleted` → set status='canceled', hạ về free (credits không thu hồi phần đã cấp).
4. Idempotency: lưu `event.id` đã xử lý (cột `processed_stripe_events` hoặc check ledger reason chứa event.id) → tránh double-grant.

### 4.5 Gọi tool demo (trừ credits)
`POST /api/tools/echo { text }` chạy chain: `requireAuth → requireCredits('echo') → handler(echo text) → deductCredits → ledger insert`. Trả `{ result, creditsRemaining }`.

### 4.6 Error flows
- Chưa auth gọi protected → `401`.
- Đủ auth nhưng thiếu credits → `402 Payment Required` `{ error: 'INSUFFICIENT_CREDITS', balance }`.
- Webhook sai chữ ký → `400`, không xử lý.
- D1 lỗi giữa deduct → ledger: chạy trong 1 `db.batch()` (atomic) → không trừ lệch.

---

## 5. Business Rules (testable)

- **BR-001** Mật khẩu tối thiểu 8 ký tự (Better Auth `emailAndPassword.minPasswordLength=8`). FE từ chối trước khi gọi.
- **BR-002** User mới được tự động cấp gói `free` với **30 credits** khi tạo (Phase 1 chọn 30 ≈ 10 tool calls free, xem §6 pricing credits).
- **BR-003** Mỗi gói cấp `monthlyCredits` (bảng §6.1). Cấp khi `checkout.session.completed` và mỗi chu kỳ thanh toán mới.
- **BR-004** Mỗi tool tiêu credits theo bảng §6.2. `echo` = 1 credit (demo).
- **BR-005** Không cho thực thi tool nếu `balance < cost(tool)` → `402`.
- **BR-006** Mọi biến động credits PHẢI ghi 1 dòng `credits_ledger` (delta dương=grant, âm=spend) với `reason` + `ref` (event.id/tool).
- **BR-007** Balance = `SUM(delta)` trên `credits_ledger` của user (single source of truth — KHÔNG có cột balance riêng để tránh lệch). Cho phép cache balance ở `subscriptions.credits_balance` nhưng phải cập nhật atomic cùng batch với ledger; nếu lệch, ledger thắng.
- **BR-008** Deduct + ledger insert phải atomic (`db.batch([...])`). Nếu balance đọc ra ≥ cost nhưng batch fail → không trừ.
- **BR-009** Race condition: 2 request đồng thời — dùng pattern conditional update `UPDATE subscriptions SET credits_balance = credits_balance - :cost WHERE user_id=:id AND credits_balance >= :cost` (kiểm `changes()===1`); chỉ khi thành công mới insert ledger trong cùng batch. Nếu `changes()===0` → `402`.
- **BR-010** Webhook idempotent theo `stripe_event_id` (UNIQUE) → cùng event xử lý 1 lần.
- **BR-011** `stripe_customer_id` duy nhất 1-1 với user (UNIQUE).
- **BR-012** Session hết hạn sau 7 ngày (`session.expiresIn`), refresh khi còn 1 ngày (`updateAge`).
- **BR-013** Guard: route group `(dashboard)/*` yêu cầu `locals.user`; chưa auth → redirect `/auth/login`.
- **BR-014** [Phase 1 scope] credits là **monthly pool dùng chung mọi tool**, KHÔNG enforce "uses/day per tool" như pricing page mô tả. Pricing page giữ nguyên text; mapping daily-per-tool là nợ kỹ thuật ghi rõ cho Phase sau.
- **BR-015** OAuth Google: nút hiển thị nhưng Phase 1 chưa nối → bấm vào hiện toast "Coming soon" (KHÔNG gọi backend).

---

## 6. Data Description — Credits pricing (đề xuất)

### 6.1 Plan → monthly credits (đề xuất, PM duyệt)

Suy ra từ pricing: gói cao gấp ~4x quota daily → giữ tỉ lệ tương tự, quy đổi sang pool tháng.

| Plan | Giá/tháng (monthly) | Monthly credits đề xuất | Lý do |
|---|---|---|---|
| Free | $0 | **30** | ~10 actions thử nghiệm. |
| Side Hustle | $7.99 | **750** | ~25/day × 30. |
| Business | $12.99 | **3,000** | ~100/day × 30, gói "popular". |
| Enterprise | $49.99 | **9,000** | ~300/day × 30. |

> Đề xuất, KHÔNG phải con số chốt — PM điều chỉnh trong `planConfig.ts`. Tất cả nằm 1 chỗ để đổi dễ.

### 6.2 Credits-per-tool (đề xuất nội bộ)

| Tool | Cost (credits) | Ghi chú |
|---|---|---|
| `echo` (demo Phase 1) | 1 | chỉ để test chain |
| tag/title/keyword generator (Phase 2) | 1 | LLM ngắn |
| description generator (Phase 2) | 2 | LLM dài hơn |
| rankhero-ai chat (Phase 2) | 2/tin nhắn | streaming |
| listing-analyzer / shop-analyzer (Phase 3) | 3 | gọi Etsy API + estimation |
| rank-check / niche-finder (Phase 3) | 2 | |

Bảng đặt trong `planConfig.ts` (`TOOL_COSTS`), service đọc từ đó.

### 6.3 Stripe price mapping

8 price IDs (3 plan × 2 period + free không cần) qua env placeholder:
```
STRIPE_PRICE_SIDE_MONTHLY, STRIPE_PRICE_SIDE_YEARLY,
STRIPE_PRICE_BUSINESS_MONTHLY, STRIPE_PRICE_BUSINESS_YEARLY,
STRIPE_PRICE_ENTERPRISE_MONTHLY, STRIPE_PRICE_ENTERPRISE_YEARLY
```
`planConfig.ts` map `(plan, period) → priceId` đọc từ `env`. Tên gói khớp pricing: `"Side Hustle" | "Business" | "Enterprise"` → slug `side | business | enterprise`.

---

## 7. D1 Schema (SQL chính xác)

### 7.1 Bảng Better Auth TỰ SINH (qua `better-auth migrate`/`generate` — KHÔNG tự viết tay)

Better Auth core (email/password) sinh 4 bảng: `user`, `session`, `account`, `verification`. **Quy trình:** chạy `npx @better-auth/cli generate` để xuất SQL → đưa vào `migrations/0001_better_auth.sql`. KHÔNG tự bịa cột; dùng output thực của CLI. Cấu trúc tham khảo (better-auth 1.6, sqlite):

```sql
-- DO NOT hand-edit; generated by @better-auth/cli. Reference only.
CREATE TABLE user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY, expiresAt DATE NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL,
  ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id)
);
CREATE TABLE account (
  id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id), accessToken TEXT, refreshToken TEXT,
  idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE,
  scope TEXT, password TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt DATE NOT NULL, createdAt DATE, updatedAt DATE
);
```

### 7.2 Bảng HeroRank TỰ TẠO — `migrations/0002_herorank.sql`

```sql
CREATE TABLE subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  plan               TEXT NOT NULL DEFAULT 'free',     -- free|side|business|enterprise
  status             TEXT NOT NULL DEFAULT 'active',   -- active|past_due|canceled
  period             TEXT,                             -- monthly|yearly|null(free)
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  current_period_end INTEGER,                          -- epoch seconds
  credits_balance    INTEGER NOT NULL DEFAULT 0,       -- cache; ledger là nguồn sự thật (BR-007)
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE credits_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,            -- + grant, - spend
  reason     TEXT NOT NULL,              -- 'grant:plan' | 'spend:tool' | 'grant:signup'
  ref        TEXT,                       -- tool name | stripe_event_id
  balance_after INTEGER NOT NULL,        -- snapshot để audit
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ledger_user ON credits_ledger(user_id, created_at);

CREATE TABLE processed_stripe_events (
  event_id   TEXT PRIMARY KEY,           -- idempotency BR-010
  type       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

> Bảng Phase 2-4 (`keywords_cache`, `analyses`, `tracked_listings`, `connected_shops`) KHÔNG tạo ở Phase 1.

---

## 8. Better Auth config (`src/lib/server/auth.ts`)

```
betterAuth({
  database: kyselyAdapter(new Kysely({ dialect: new D1Dialect({ database: env.DB }) }), { type: 'sqlite' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60*60*24*7, updateAge: 60*60*24 },
  trustedOrigins: [PUBLIC_ORIGIN],
  plugins: [sveltekitCookies(getRequestEvent)],
  databaseHooks: { user: { create: { after: (user) => creditsService.grantPlanCredits(user.id, 'free') } } },
  // socialProviders.google → Phase sau
})
```

- **Factory pattern:** `env.DB` chỉ có trong request context trên Workers → `auth` phải khởi tạo lazy per-request hoặc qua `getRequestEvent().platform.env`. Eng A xử lý: `createAuth(env)` factory, cache theo env.
- **Expose session cho cả 2 phía:**
  - SvelteKit `load`/guard: đọc `event.locals.user` (set trong `hooks.server.ts`).
  - Hono: middleware `requireAuth` gọi `auth.api.getSession({ headers: c.req.raw.headers })` (cùng cookie) → set `c.set('user', ...)`.

---

## 9. API Contract — Phase 1

| Method | Path | Auth | Body / Query | Response | Owner |
|---|---|---|---|---|---|
| * | `/api/auth/*` | — | (Better Auth) | sign-up/in/out, get-session | Eng A |
| POST | `/api/billing/checkout` | ✓ | `{ plan: 'side'\|'business'\|'enterprise', period: 'monthly'\|'yearly' }` | `{ url }` | Eng B |
| POST | `/api/billing/webhook` | sig | Stripe event (raw body) | `200 {received:true}` / `400` | Eng B |
| GET | `/api/me` | ✓ | — | `{ user, subscription:{plan,status,period}, credits:{balance} }` | Eng C |
| GET | `/api/credits` | ✓ | — | `{ balance, ledger: [...last 20] }` | Eng C |
| POST | `/api/tools/echo` | ✓ + credits | `{ text }` | `{ result, creditsRemaining }` / `402` | Eng C |

- Webhook **phải** đọc raw body trước khi parse (signature verify) → Hono route dùng `c.req.text()`, KHÔNG `c.req.json()`.
- Tất cả lỗi theo shape `{ error: CODE, message }`. Codes: `UNAUTHORIZED(401)`, `INSUFFICIENT_CREDITS(402)`, `VALIDATION(400)`, `INTERNAL(500)`.

---

## 10. FE Wiring

| File | Thay đổi | Owner |
|---|---|---|
| `src/lib/auth-client.ts` (mới) | `createAuthClient` từ `better-auth/svelte`; export `signIn,signUp,signOut,useSession`. | Eng A |
| `src/routes/auth/login/+page.svelte` | `handleSubmit` → `authClient.signIn.email`; lỗi → hiện message; success → `goto('/dashboard')`. Nút Google → toast "Coming soon" (BR-015). | Eng B |
| `src/routes/auth/signup/+page.svelte` | validate confirm khớp; `authClient.signUp.email`; success → `/dashboard`. | Eng B |
| `src/routes/pricing/+page.svelte` | nút "Get {plan}" + period toggle → nếu chưa login `goto('/auth/signup')`; nếu login `POST /api/billing/checkout` → redirect `url`. | Eng C |
| `src/lib/components/layout/Header.svelte` | thay "HR"/"Account" hardcode bằng `data.user.name/email` + hiển thị `credits.balance` (badge cạnh Upgrade); Sign Out → `authClient.signOut()` + `goto('/auth/login')`. | Eng C |
| `src/routes/(dashboard)/+layout.server.ts` (mới) | load: nếu `!locals.user` → `redirect(302,'/auth/login')`; trả `{ user, subscription, credits }` (BR-013). | Eng A |
| `src/routes/(dashboard)/+layout.svelte` | nhận `data` từ load, truyền xuống `Header`. | Eng A (sở hữu file layout) |
| `src/app.d.ts` | khai báo `App.Locals.{user,session}` + `App.Platform.Env` (D1/KV bindings). | Eng A |
| `src/hooks.server.ts` (mới) | getSession → set locals → `svelteKitHandler`. | Eng A |

> **Lưu ý chồng file FE:** `Header.svelte` cần `data.credits` từ `(dashboard)/+layout.server.ts` (Eng A) qua `+layout.svelte` (Eng A) → props. Eng A định nghĩa shape `data`, Eng C chỉ đọc props trong Header. Hợp đồng props chốt ở §11.

---

## 11. Ownership — 3 Engineers, KHÔNG trùng file

**Eng A — Foundation & Auth (chạy TRƯỚC, block B & C):**
- `wrangler.jsonc`, `src/app.d.ts`, `src/hooks.server.ts`
- `src/lib/server/auth.ts`, `src/lib/auth-client.ts`
- `src/lib/server/db/` (schema), `migrations/0001_better_auth.sql`, `migrations/0002_herorank.sql`
- `src/lib/server/api/app.ts` (khung Hono + mount, để sẵn router stubs), `src/routes/api/[...path]/+server.ts`
- `src/lib/server/api/middleware/requireAuth.ts`, `middleware/withDb.ts`
- `src/routes/(dashboard)/+layout.server.ts`, `src/routes/(dashboard)/+layout.svelte`
- **`package.json`** — DUY NHẤT Eng A sửa. B & C liệt kê deps cần trong report, A gom.
- **Hợp đồng giao cho B/C:** `Env` type, `getDb(c)`, `getUser(c)`, shape `data` của dashboard load, danh sách deps.

**Eng B — Billing & Auth FE:**
- `src/lib/server/services/billingService.ts`, `planConfig.ts`
- `src/lib/server/repositories/subscriptionRepo.ts`
- `src/lib/server/api/routes/billing.ts` (checkout + webhook)
- `src/routes/auth/login/+page.svelte`, `src/routes/auth/signup/+page.svelte`
- Stripe client wrapper `src/lib/server/stripe.ts`

**Eng C — Credits, Me, Tools & Dashboard FE:**
- `src/lib/server/services/creditsService.ts`
- `src/lib/server/repositories/creditsRepo.ts`
- `src/lib/server/api/middleware/requireCredits.ts`
- `src/lib/server/api/routes/me.ts`, `routes/credits.ts`, `routes/tools.ts`
- `src/lib/components/layout/Header.svelte`, `src/routes/pricing/+page.svelte`
- Unit tests credits: `src/lib/server/services/creditsService.test.ts`

**Thứ tự phụ thuộc:**
1. **Eng A trước** — package.json + Env types + auth + Hono khung + middleware base + migrations. B/C không build được nếu thiếu.
2. **B & C song song** sau khi A xong contract. B (billing service) và C (credits service) độc lập file.
3. `creditsService.grantPlanCredits` (Eng C) được billing webhook (Eng B) gọi → **interface chốt ở §11 contract**: `grantPlanCredits(userId, plan)` + `spendCredits(userId, tool)`. B import type, không sửa file C.
4. `databaseHooks` trong `auth.ts` (Eng A) gọi `creditsService.grantPlanCredits` (Eng C) → A import từ C; C giao interface trước.

> Không file nào có 2 chủ. `planConfig.ts` (Eng B) được C đọc (TOOL_COSTS) → C import, không sửa. Nếu cả 2 cần sửa planConfig → tách `toolCosts.ts` (C) khỏi `planConfig.ts` (B). **Đề xuất tách sẵn:** `planConfig.ts` (plans/prices, Eng B) + `toolCosts.ts` (Eng C).

---

## 12. Test Plan (QA)

### 12.1 Unit (vitest) — bắt buộc cho credits
- `creditsService.test.ts` với **fake in-memory repo** (không cần D1):
  - grant plan → balance đúng theo `PLAN_CREDITS`.
  - spend < balance → trừ đúng, ledger có dòng delta âm + reason+ref.
  - spend > balance → throw/return `INSUFFICIENT_CREDITS`, balance không đổi.
  - signup grant → free = 30.
  - idempotent grant cùng `stripe_event_id` → chỉ cộng 1 lần.
  - balance = SUM(ledger) (BR-007) — property test vài chuỗi thao tác.
- Cần `vitest` + script `"test": "vitest run"` (Eng A thêm vào package.json).

### 12.2 Static
- `npm run build` pass (adapter-cloudflare).
- `npm run check` (svelte-check) 0 error — gồm `app.d.ts` Locals/Platform types.

### 12.3 Integration smoke — `wrangler dev` + D1 local
1. `wrangler d1 migrations apply DB --local` chạy 2 migration không lỗi.
2. `wrangler dev` (hoặc `vite dev` qua platformProxy) khởi động.
3. `POST /api/auth/sign-up/email` → 200, có cookie; bảng `user`+`subscriptions(free)` có dòng; ledger có `grant:signup` +30.
4. `GET /api/me` (cookie) → `{user, subscription:{plan:'free'}, credits:{balance:30}}`.
5. `POST /api/tools/echo {text:'hi'}` ×30 → trừ tới 0; lần 31 → `402 INSUFFICIENT_CREDITS`.
6. `POST /api/billing/checkout {plan:'business',period:'monthly'}` → trả `url` Stripe test (cần STRIPE_SECRET_KEY test placeholder; nếu rỗng → kỳ vọng lỗi cấu hình rõ ràng, KHÔNG crash).
7. `POST /api/billing/webhook` với payload `checkout.session.completed` ký bằng test secret (Stripe CLI `stripe listen`/`trigger` hoặc fixture) → subscription='business', ledger +3000; gửi lại cùng event → KHÔNG cộng lần 2 (idempotency).
8. Chưa cookie gọi `/api/me` → 401. Vào `/dashboard` chưa login → redirect `/auth/login`.

> Vì không có Stripe key thật: bước 6-7 dùng test mode key placeholder + Stripe CLI fixtures; nếu env không có key, QA xác nhận lỗi được handle graceful (502/500 có message), không phải uncaught exception.

---

## 13. Technical Constraints & Risks

| Rủi ro | Giảm thiểu |
|---|---|
| Stripe SDK dùng Node `http` → crash Workers | `Stripe(key, { httpClient: Stripe.createFetchHttpClient() })`; webhook verify dùng `constructEventAsync` (Web Crypto). Eng B note trong stripe.ts. |
| `env.DB` chỉ có trong request scope → `auth` không thể là module-level singleton | Factory `createAuth(env)` per-request, cache theo env ref (Eng A). |
| Routing tranh chấp `/api/auth` vs catch-all | base path khác nhau; verify bằng smoke test #3 vs #4. |
| Race double-spend | conditional UPDATE + `changes()` check + batch atomic (BR-009). |
| Webhook double-grant | `processed_stripe_events` UNIQUE (BR-010). |
| Better Auth schema drift nếu tự viết tay | bắt buộc dùng `@better-auth/cli generate`, không bịa cột. |
| `kysely` + CamelCasePlugin xung đột | KHÔNG dùng CamelCasePlugin cho instance của Better Auth (per research discussion #7487). |
| `db.batch()` không phải transaction đầy đủ (D1) | batch là atomic all-or-nothing — đủ cho deduct+ledger; KHÔNG dựa vào read-then-write across statements, dùng conditional UPDATE. |
| Pricing "uses/day per tool" ≠ monthly pool | BR-014: ghi rõ nợ kỹ thuật; không hứa daily-per-tool Phase 1. |

---

## 14. Assumptions

- **A1** Phase 1 chấp nhận monthly credit pool thay vì daily-per-tool (cần PM xác nhận — đây là khác biệt với text pricing page).
- **A2** Con số credits §6.1/§6.2 là đề xuất, PM chốt giá trị cuối trong `planConfig.ts`/`toolCosts.ts`.
- **A3** Email verification TẮT ở Phase 1 (`autoSignIn`, không gửi email) — không có email provider trong môi trường.
- **A4** Forgot password (link `#` trong login) chưa làm Phase 1.
- **A5** Free tier credits không reset hàng tháng ở Phase 1 (chưa có cron); chỉ cấp 1 lần lúc signup. Reset theo chu kỳ = Phase sau.
- **A6** Yearly billing tạo 6 Stripe prices; nếu PM chưa tạo prices thật trên Stripe test dashboard, dùng placeholder env và smoke test #6 chỉ kiểm flow code, không kiểm Stripe thật.
- **A7** KV binding khai trong `wrangler.jsonc` để sẵn cho Phase 2 (session/cache) nhưng Phase 1 chưa dùng (session ở D1 qua Better Auth).
