# Backend Architecture

> Chốt ngày 2026-06-12. Nghiên cứu gốc: `_workspaces/2026-06-12_etsy-data-research/`

## Stack

**Hono nhúng trong SvelteKit** (phương án B), chạy trên Cloudflare Workers — một deploy unit duy nhất.

```
src/routes/api/[...path]/+server.ts   → delegate toàn bộ /api/* cho app Hono
src/lib/server/api/                   → app Hono: routes, middleware, zod schemas
src/lib/server/services/              → business logic thuần TS (KHÔNG phụ thuộc Hono)
src/lib/server/repositories/          → tầng data theo repository pattern (interface + D1 impl)
```

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| API framework | Hono (mounted trong SvelteKit) | routing, middleware chain, RPC type-safe cho FE |
| Database | Cloudflare D1 (SQLite) | users, subscriptions, credits, cache keyword/analyses |
| Cache | Workers KV | kết quả phân tích share giữa các user, session |
| Job queue | Cloudflare Queues | shop analysis dài, refresh data |
| Cron | Cloudflare Cron Triggers | refresh trends/best-sellers, rank tracking định kỳ |
| Storage | R2 | ảnh/video generated |
| Auth | Better Auth (adapter Hono, D1) | email/password + OAuth |
| Billing | Stripe | 3 gói theo trang pricing, webhook → subscriptions |
| LLM | Gateway `https://vtoken.viemind.ai/v1` | OpenAI-compatible; cấu hình qua env `LLM_BASE_URL` + `LLM_API_KEY` |

### Nguyên tắc chống lock-in

- Business logic tách khỏi Hono handler → sau này nhấc nguyên app Hono ra Worker riêng (phương án C) không phải viết lại.
- Repository pattern cho DB → khi D1 chạm trần (10GB, single-region) nâng cấp Postgres (Neon + Hyperdrive) chỉ thay adapter.

## Middleware chain chuẩn cho mọi tool endpoint

```
auth → check credits → zod validate → service (LLM / Etsy data) → trừ credits → log
```

## Hệ thống credits

Mỗi gói (theo pricing page) cấp credits/tháng. Mỗi lần generate/analyze trừ credits theo bảng giá nội bộ. Ghi `credits_ledger` mọi biến động.

## Data model tối thiểu (D1)

`users` · `sessions` · `subscriptions` (stripe_customer_id, plan, status) · `credits_ledger` (user_id, tool, delta, reason) · `keywords_cache` (keyword, demand_score, competition, cached_at) · `analyses` (user_id, type, input, result_json, status) · `tracked_listings` (rank-check theo dõi qua cron) · `connected_shops` (OAuth Etsy own-shop)

## Lộ trình

1. **Phase 1:** Hono skeleton + Better Auth + Stripe + credits system → wire vào login/signup/pricing có sẵn
2. **Phase 2:** 5 tool LLM (title/description/tag/keyword generator + RankHero AI chat, streaming) qua gateway vtoken
3. **Phase 3:** Etsy API v3 (đăng ký app) + estimation engine + shared cache → 7 tool data
4. **Phase 4:** rank tracking cron + Queues; trends/best-sellers refresh hàng ngày; video-generator (dịch vụ render ngoài) cuối cùng

Chi tiết nguồn dữ liệu Etsy: xem [etsy-data-strategy.md](./etsy-data-strategy.md).

## Tech debt — xử lý ở Phase 5 (hardening)

> Cập nhật Phase 5 (2026-06-13): đánh dấu trạng thái từng item.
> Xem hướng dẫn deploy + secrets đầy đủ: [docs/deployment.md](./deployment.md).

| # | Vấn đề | Quyết định (PM, 2026-06-12) | Trạng thái Phase 5 |
|---|---|---|---|
| 1 | Webhook `customer.subscription.updated` grant credits mỗi lần plan đổi giữa chu kỳ (idempotent theo event.id nhưng chưa đúng "mỗi chu kỳ 1 lần") | Chuyển sang grant theo `invoice.paid` ở Phase 5 | **DONE (S1)** — handler chuyển sang `invoice.paid` (`billing_reason: subscription_cycle/subscription_create`). `subscription.updated` chỉ sync plan/status, KHÔNG grant. Idempotency giữ theo `event.id`. |
| 2 | Workaround `@opentelemetry/api` externalize trong vite.config (better-auth 1.6 dynamic import bị Vite stub) | Xem lại khi nâng version better-auth | **KEEP — workaround giữ nguyên (R1, P2).** Lý do: nâng better-auth version giữa launch window có rủi ro regression auth (critical path). Defer sang sau launch khi có staging env để test. Ghi rõ trong `vite.config.ts`. Nếu better-auth ship `@opentelemetry/api` đúng optional peer dependency → revisit và gỡ externalize. |
| 3 | `BETTER_AUTH_URL` phụ thuộc origin — `.dev.vars` dùng port wrangler local | Khi deploy production: set đúng domain hoặc để trống cho auto-resolve | **ACTION REQUIRED (S5)** — Set `BETTER_AUTH_URL=https://herorank.com` trong `wrangler.jsonc [vars]` trước khi deploy. Xem [docs/deployment.md → L5](./deployment.md#l5--env-var-checklist-đầy-đủ). |
| 4 | 19 warnings a11y từ FE port 1:1 (label/href="#") | Fix toàn bộ ở Phase 5 | **DONE (A1/A2)** — `label-without-for` và `href="#"` fixed. `npm run check` → 0 a11y warnings. |
| 5 | Sanitize `{@html}` trong RankHero AI chat (XSS vector port từ bản React) | Fix trong Phase 2 khi wire LLM thật | **DONE (Phase 2, S7 verified)** — `{@html}` chỉ qua `renderBold` (escape-first trong `lib/sanitize.ts`). Non-regression audit Phase 5: grep `{@html}` → 1 occurrence duy nhất qua renderContent. |

## Security findings (audit Phase 5, 2026-06-13)

Nguồn: `_workspaces/2026-06-12_phase5-hardening/05_security_audit.md` (16 findings: 0 Critical, 3 High, 5 Medium, 4 Low, 4 Info). Verdict: **GO cho soft/closed beta** sau khi fix F-01.

| ID | Severity | Vấn đề | Trạng thái |
|---|---|---|---|
| F-01 | High (P0) | `credits_ledger` không unique trên `ref` + `spend()` không dedup → double-charge khi job done chạy lại | **DONE** — migration `0005` partial unique index `(user_id, ref)`, `requireCredits`/chat ref per-request, `spend()` idempotent (ON CONFLICT no-op). 250 tests, double-charge confirmed chặn. |
| F-02 | High | Rate limit fail-open khi KV lỗi + `x-forwarded-for` spoofable | **DEFER → hard gate trước PUBLIC launch.** Closed beta chạy sau Cloudflare edge (CF set `cf-connecting-ip` không spoof được). Trước public: dùng `cf-connecting-ip`, cân nhắc fail-closed cho auth bucket. |
| F-03 | High | CSP `report-only` + `script-src 'unsafe-inline'` → chưa phải lớp chặn XSS thật | **DEFER → hard gate trước PUBLIC launch.** Sau report-window: bỏ `unsafe-inline` (nonce/hash cho SvelteKit hydration), flip sang enforce. |
| F-04 | Medium | DLQ consumer ghi đè status `done` vô điều kiện | Follow-up — chỉ mark `failed` nếu chưa `done`. |
| F-05 | Medium | Cookie flags dựa default Better Auth | Follow-up — tường minh hóa `httpOnly/secure/sameSite` cho prod. |
| F-06 | Medium | Webhook mark-first có thể MẤT grant nếu D1 blip giữa mark và grant | Follow-up — đổi thứ tự grant-then-mark hoặc transaction. |

> F-02/F-03 là **điều kiện bắt buộc trước public launch**, được chấp nhận defer cho closed beta (sau CF edge, user mời giới hạn). F-04/F-05/F-06 + 4 Low là follow-up sau launch.
