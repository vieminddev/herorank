# Feature Spec: Phase 5 — Production Hardening + Launch

> BA, 2026-06-13. Branch `migrate-sveltekit`. Chốt chặn trước khi launch production.
> Nguồn: backend-architecture.md (tech-debt #1–5), etsy-data-strategy.md, 05_qa_verify Phase 1–4, 04_engineer_* concerns, wrangler.jsonc, hooks.server.ts, app.ts.

---

## 1. Overview

**Mục tiêu:** Đưa HeroRank từ "feature-complete + QA pass" lên "production-ready". Phase 1–4 đã implement đầy đủ chức năng (auth+billing+credits, 5 LLM tools, 7 Etsy data tools, jobs+OAuth+calibration, Workers mode) nhưng đang chạy ở mức MVP correctness — chưa có rate limiting, security headers, observability, hay quy trình deploy production. Phase 5 đóng các khoảng trống đó.

**Scope:** 7 nhóm — Security hardening, Accessibility, Observability, Reliability, Correctness/data, Launch readiness, Test coverage. Mỗi item có mã ID, file liên quan, mức ưu tiên (P0/P1/P2), cách verify.

**Quan trọng về điều phối:** rất nhiều item P0 đụng cùng các file dùng chung (`src/lib/server/api/app.ts`, `src/hooks.server.ts`, `wrangler.jsonc`, `src/lib/server/services/billingService.ts`). Cần serialize chặt chẽ — xem §Ownership.

---

## 2. Current State (hiện trạng đã audit)

| Khía cạnh | Hiện trạng |
|---|---|
| Rate limiting | **KHÔNG có.** `app.ts` chỉ có `withDb` + onError + notFound. Không middleware giới hạn. |
| Security headers | **KHÔNG có.** Không CSP/HSTS/X-Frame-Options/X-Content-Type-Options ở `hooks.server.ts` hay `app.ts`. |
| CORS | **KHÔNG khai báo** — same-origin mặc định (FE+API cùng worker), nhưng chưa có policy tường minh chặn cross-origin. |
| Webhook credits | Grant trên `customer.subscription.updated` keyed by `event.id` (billingService.ts:177). Tech-debt #1: chưa "mỗi chu kỳ 1 lần". |
| Structured logging | **KHÔNG có.** Chỉ `console.error/warn` rải rác (app.ts:65, queue.ts:39/54). Không request-id, user-id, latency. |
| Error tracking | **KHÔNG có** Sentry/equivalent. `observability.enabled: true` trong wrangler (Cloudflare native logs only). |
| Job/queue monitoring | DLQ `herorank-analysis-dlq` được **đặt tên nhưng KHÔNG có consumer** → message rơi vào DLQ là "im lặng". Cron/queue không emit metric success/fail/duration. |
| Etsy quota | `usageCounter` + `ETSY_CRON_CAP=2000` có đếm in-process, nhưng **không có dashboard/alert** khi gần trần 10k/ngày. |
| Taxonomy node-id | Seeds dùng `taxonomyId: 1199` (fixture) + `null` cho hầu hết (seeds.ts). Real category mapping = **mock-only**, blocked-on-key (engineer H §issues, engineer F §concerns). |
| Credits race | Atomic conditional spend (Phase 1) tái dùng ở Phase 4 deduct-on-success + `paymentFailed` flag. Cần audit lại path mới. |
| a11y | **23 warnings** (label-without-for, href="#") qua 10 file (tech-debt #4 ghi 19 — đã tăng nhẹ). |
| @opentelemetry workaround | `vite.config.ts` externalize + devDep (tech-debt #2, QA Phase 1 Fix 2). |
| BETTER_AUTH_URL | `.dev.vars` hardcode port wrangler local (tech-debt #3). Production chưa set. |
| e2e test | **KHÔNG có** e2e thật. Chỉ 160 unit/integration + wrangler smoke thủ công. Nhiều path là mock-only. |
| {@html} XSS | Đã fix (Phase 2, `renderBold` escape-first). Cần **verify** không hồi quy. |
| SQL injection | Parameterized (QA spot-check Phase 1 5b). Cần spot-audit toàn diện. |

---

## 3. Backlog theo nhóm

### Nhóm 1 — Security Hardening

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| S1 | **Webhook grant theo `invoice.paid`** (tech-debt #1). Chuyển grant credits từ `customer.subscription.updated` → handler `invoice.paid` (event `billing_reason: subscription_cycle` / `subscription_create`). Đảm bảo "mỗi chu kỳ 1 lần". `subscription.updated` chỉ sync plan/status/period (KHÔNG grant). Idempotency vẫn theo `event.id` + ref. | `services/billingService.ts`, `repositories/subscriptionRepo.ts`, `routes/billing.ts` | **P0** | Unit test: `invoice.paid` cycle → grant; `subscription.updated` mid-cycle plan change → KHÔNG grant. Stripe CLI `stripe trigger invoice.paid`. |
| S2 | **Rate limiting per-user + per-IP** cho `/api/*`. Cơ chế đề xuất: **KV-based sliding window** (key = `rl:{ip}` và `rl:{userId}:{bucket}`). Bucket riêng cho: (a) LLM tools (tốn tiền) — limit chặt per-user, (b) auth endpoints `/api/auth/sign-in|sign-up` — chống brute force per-IP, (c) general `/api/*` per-IP. Trả 429 `{error:RATE_LIMITED, retryAfter}`. | **app.ts** (middleware mount), `api/middleware/rateLimit.ts` (mới), `hooks.server.ts` (auth path không qua Hono — cần middleware riêng hoặc edge check) | **P0** | Test: vượt limit → 429 + `Retry-After`; auth brute force per-IP chặn; KV TTL đúng. Load test xác nhận limit chính xác. |
| S3 | **Security headers** (CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy). Áp ở `hooks.server.ts` `resolve` transformPageChunk/response headers để phủ CẢ trang SvelteKit lẫn `/api/*`. CSP cần whitelist gateway LLM + Stripe JS + self. | **hooks.server.ts** | **P0** | curl -I kiểm header; CSP report-only trước → enforce. securityheaders.com grade A. |
| S4 | **CORS policy review.** Xác nhận `/api/*` same-origin-only (reject cross-origin trừ webhook Stripe). Webhook `/api/billing/webhook` không cần CORS (server→server). | **app.ts** | **P1** | Test cross-origin fetch bị chặn; webhook vẫn nhận. |
| S5 | **Secrets production.** (a) `BETTER_AUTH_URL` (tech-debt #3): set đúng domain production HOẶC để trống cho auto-resolve (auth.ts `resolveBaseURL`). (b) Document đầy đủ wrangler secrets vs `.dev.vars`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LLM_API_KEY`, `OAUTH_TOKEN_KEY`, `ETSY_API_KEY`, `ETSY_OAUTH_*`, price IDs. (c) Quy trình rotate `OAUTH_TOKEN_KEY` (token đã mã hóa bằng key cũ → cần migration plan nếu đổi). | `.dev.vars`, `.env.example`, deploy checklist (§6), `auth.ts` | **P0** | Checklist secrets đầy đủ; smoke production auth/billing/oauth pass với secrets thật. |
| S6 | **Input validation gaps audit.** Mọi tool endpoint đã có zod (Phase 2/3). Audit: chat `messages` length cap (đã có 1..40), Etsy listing/shop ID bounds, webhook body size limit, OAuth `state`/`redirect` validation. | `routes/*.ts`, `prompts/*.ts` | **P1** | Fuzz oversized/malformed input → 400 sạch, không 500/crash. |
| S7 | **XSS verify (non-regression).** `{@html}` chỉ qua `renderBold` (escape-first) ở rankhero-ai. Verify không có `{@html}` mới sau Phase 2. | `routes/(dashboard)/tools/.../+page.svelte`, `lib/sanitize.ts` | **P0** | grep `{@html}` toàn FE → chỉ 1 occurrence qua renderContent; test XSS payload trong chat. |
| S8 | **SQL injection spot-audit.** Toàn bộ repo D1: parameterized `?` bind, không string-interp user input. Audit path mới Phase 4 (jobsStore, connectedShopRepo, calibration). | `repositories/*.ts`, `services/**/jobsStore.ts`, `connectedShopRepo.ts` | **P1** | grep template-literal trong SQL có biến user → 0; manual review. |
| S9 | **Webhook signature + OAuth state/PKCE verify (non-regression).** Stripe `constructEventAsync` verify (Phase 1 OK). OAuth state one-shot + PKCE S256 (Phase 4 OK). Verify không hồi quy + thêm test signature-replay. | `services/stripe.ts`, `services/oauth/etsyOAuth.ts`, `connectedShopRepo.ts` | **P1** | Test: chữ ký sai→400; state reuse→reject; PKCE mismatch→reject. |
| S10 | **Credits race condition audit (path mới Phase 4).** Atomic conditional spend OK ở Phase 1. Audit: (a) deduct-on-success trong queue consumer (`consume.ts`), (b) `paymentFailed` flag khi credit race sau khi job xong, (c) inline `waitUntil` fallback path. Đảm bảo không double-charge / không charge khi fail. | `jobs/consume.ts`, `jobs/queue.ts`, `routes/jobs.ts`, `services/creditsService.ts` | **P0** | Test concurrent deduct cùng user; job-success + balance=0 race → paymentFailed đúng; retry queue không double-charge. |
| S11 | **Chạy skill security-review / security-auditor** như 1 task độc lập quét toàn codebase trước launch. | toàn repo | **P1** | Report findings → triage P0/P1 trước go-live. |

### Nhóm 2 — Accessibility

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| A1 | **Fix `label-without-for`** (~14 warnings). Gắn `for={id}` + `id` trên input tương ứng, hoặc bọc input trong `<label>`. | signup, login (3 mỗi file), listing-analyzer (3), tag-generator/rank-check/shop-analyzer (2 mỗi), buyer-check/dashboard/video-generator (1) | **P1** | `npm run check` → 0 a11y warning. |
| A2 | **Fix `href="#"`** (forgot-password link, nav placeholders, landing `+page.svelte` ×5). Thay bằng `<button>` cho action, hoặc href thật, hoặc `role`/`aria`. | `auth/login` (forgot-password), `+page.svelte` (landing) | **P1** | `npm run check` → 0; keyboard-nav OK. |
| A3 | **Sweep a11y tổng** sau A1/A2: alt-text ảnh, focus-visible, contrast (nếu phát sinh). | toàn FE | **P2** | axe-core scan clean trên trang chính. |

> Cách fix hàng loạt: 2 nhóm warning đồng nhất (label/href) → 1 engineer FE sửa tuần tự theo file, mỗi file độc lập, low-risk. Gom thành 1 task.

### Nhóm 3 — Observability

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| O1 | **Structured logging.** Middleware log mỗi request: `request_id` (gen uuid), `user_id`, `path`, `tool`, `credits_delta`, `latency_ms`, `status`. JSON line ra `console` (Cloudflare Logs ingest). Strip PII/secret. | **app.ts** (middleware), `api/middleware/logger.ts` (mới) | **P1** | Log line có đủ field; không leak token/email; latency hợp lý. |
| O2 | **Error tracking.** Quyết định stack: **(a)** Sentry (`@sentry/cloudflare` — hỗ trợ Workers), hay **(b)** Cloudflare native (Workers Logs + Logpush + Tail Workers). Bắt unhandled error ở `app.onError` + queue/cron catch → gửi context. → **Câu hỏi PM (Q1).** | `app.ts`, `jobs/queue.ts`, `jobs/scheduled.ts`, `worker.ts` | **P1** | Lỗi cố ý xuất hiện trên dashboard chọn; có stack + request_id. |
| O3 | **Cron/queue job monitoring.** Mỗi cron branch + queue message: log/metric `job`, `result` (success/fail/deferred), `duration_ms`, `items_processed`. Alert khi cron fail liên tục hoặc DLQ có message. | `jobs/scheduled.ts`, `jobs/queue.ts`, `jobs/consume.ts` | **P1** | Trigger cron → metric ghi; fail → alert. |
| O4 | **Etsy API quota dashboard/alert.** Track calls/ngày (usageCounter hiện in-process, mất khi isolate recycle) → persist daily counter (KV/D1) + alert khi đạt ~80% của 10k/ngày. | `services/etsy/usageCounter.ts`, KV/D1 daily key, cron | **P1** | Counter persist qua isolate; alert fire ở ngưỡng. |

### Nhóm 4 — Reliability

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| R1 | **@opentelemetry workaround review** (tech-debt #2). Kiểm tra better-auth version hiện tại; nếu đã ship `@opentelemetry/api` đúng optional peer → gỡ workaround vite.config. Nếu chưa → document rõ + giữ. | `vite.config.ts`, `package.json` | **P2** | Build+wrangler dev pass sau khi gỡ (nếu gỡ được); auth không crash. |
| R2 | **Graceful degradation khi LLM/Etsy gateway down.** LLM: đã có 502/503/504 typed (Phase 2). Etsy: verify fallback khi gateway timeout/5xx → friendly error + 0 credits. Thêm circuit-breaker nhẹ (optional). | `services/llmService.ts`, `services/etsy/client.ts`, `routes/etsy-tools.ts` | **P1** | Mock gateway 5xx/timeout → tool trả friendly error, balance unchanged. |
| R3 | **Queue DLQ xử lý + alert.** Hiện DLQ `herorank-analysis-dlq` đặt tên nhưng **KHÔNG có consumer** → message chết im lặng + user job kẹt `running`. Thêm: (a) DLQ consumer mark job `failed` + (đã deduct-on-success nên không charge) + notify, (b) alert khi DLQ nhận message. | **wrangler.jsonc** (thêm DLQ consumer), `jobs/queue.ts` hoặc handler mới, `jobs/analysesJobStore.ts` | **P0** | Force message fail 3 lần → vào DLQ → consumer mark job failed + alert; user thấy "failed" không kẹt "running". |
| R4 | **Idempotency audit toàn bộ webhook/job.** Webhook: `markEventProcessed` (OK). Job: deep-analysis enqueue idempotent? Cron rank-track 24h guard (OK). OAuth callback state one-shot (OK). Verify queue retry không tạo job trùng / không double-process. | `billingService.ts`, `jobs/consume.ts`, `routes/jobs.ts`, `rankTrack.ts` | **P1** | Re-deliver mọi event/message → no-op; double enqueue → 1 result. |
| R5 | **Timeout review.** LLM có AbortController timeout (Phase 2). Verify: Etsy fetch timeout, queue job tổng timeout (tránh chạm Workers CPU limit), cron job timeout. Document Workers limit (CPU 30s/50ms, subrequest cap). | `services/llmService.ts`, `services/etsy/client.ts`, `jobs/consume.ts` | **P1** | Mỗi external call có timeout; job dài không treo isolate. |

### Nhóm 5 — Correctness / Data

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| C1 | **Taxonomy node-id thật → category Etsy.** Hiện seeds dùng fixture `taxonomyId: 1199` + `null` cho hầu hết. Real listing→taxonomy mapping = mock-only (engineer H). **BLOCKED-ON-KEY** cho data thật, NHƯNG seam đã sẵn (`getSellerTaxonomyNodes` + weekly cron taxonomy refresh). Làm được ngay với seam: resolver `listingTaxonomy` thật (đọc `taxonomy_id` từ listing API) thay mock injection. | `services/etsy/refresh.ts`, `services/oauth/calibrationJob.ts` (deps.listingTaxonomy), `services/etsy/client.ts` | **P1** (seam ngay) / **blocked-on-key** (data thật) | Với key thật: listing trả `taxonomy_id` đúng → calibration aggregate per real category. Không key: mock path giữ nguyên. |
| C2 | **Estimation calibration accuracy review.** Verify `MIN_SAMPLE=50` gate, resolution order (calibration override config khi confident, fallback config khi sparse). Review hệ số category có hợp lý không. **Phụ thuộc OAuth connected shops thật** → một phần blocked-on-key. | `services/calibration/reviewRateProvider.ts`, `calibrationJob.ts`, `services/etsy/config.ts` | **P2** | Test resolution order; với data thật review accuracy estimate vs known sales. |
| C3 | **Honesty labels audit.** Mọi số ước lượng PHẢI có badge "estimated". QA Phase 3 đã xác nhận. Audit non-regression: không có field bịa (`views`, `searches`, `percentile`); best-sellers/etsy-trends honest empty trước cron. | `routes/(dashboard)/tools/etsy/*/+page.svelte`, `routes/etsy-tools.ts` | **P0** | grep mọi response estimate có `estimated:true`; FE render badge; không số bịa. |

### Nhóm 6 — Launch Readiness

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| L1 | **Production deploy checklist.** (a) Tạo Cloudflare account + Workers Static-Assets, (b) custom domain + DNS, (c) D1 production DB + apply migrations 0001–0004, (d) KV namespace thật (thay placeholder id `0000...`), (e) Queue `herorank-analysis` + DLQ setup, (f) Cron Triggers active, (g) tất cả secrets (S5). | **wrangler.jsonc** (real IDs), deploy doc | **P0** | `wrangler deploy` thành công; mọi binding resolve; migrations applied. |
| L2 | **Smoke test production.** Sau deploy: signup→credits=30, 1 LLM tool, 1 Etsy tool, checkout (test mode), webhook, OAuth connect (mock cho tới khi có key), cron trigger thủ công. | production env | **P0** | Tất cả smoke pass trên domain thật. |
| L3 | **Rollback plan.** Document: `wrangler rollback` (previous deployment), D1 migration rollback strategy (forward-only? backup-restore?), feature-flag tắt nhanh tool lỗi. | deploy doc | **P0** | Rollback drill 1 lần trên staging. |
| L4 | **Backup D1.** Quy trình `wrangler d1 export` định kỳ (cron hoặc manual pre-deploy). D1 Time Travel (30 ngày) document. | deploy doc, cron (optional) | **P1** | Export chạy được; restore drill. |
| L5 | **Env var checklist đầy đủ.** Bảng mọi env: tên, bắt buộc/optional, secret/public, nguồn (wrangler secret vs vars vs .dev.vars), giá trị production. Đối chiếu `env.ts` schema. | `.env.example`, `src/lib/server/env.ts`, deploy doc | **P0** | Mọi var trong env.ts có entry; production set đủ; thiếu → graceful (đã có cho LLM/Stripe). |

### Nhóm 7 — Test Coverage Gaps

| ID | Item | File liên quan | Ưu tiên | Verify |
|---|---|---|---|---|
| T1 | **E2E thật** (chưa có). Playwright qua wrangler dev: signup→login→dashboard, chạy 1 LLM tool + 1 Etsy tool (mock gateway), checkout flow (Stripe test). Phủ path auth+credits+tool thật qua Hono handler (hiện chỉ unit + smoke thủ công). | `tests/e2e/` (mới), `playwright.config.ts` | **P1** | E2E suite pass CI; cover happy path + 401/402/400. |
| T2 | **Integration test với mock gateway/Etsy đầy đủ hơn.** Hiện nhiều path mock-only chưa có integration qua route layer (engineer D §3, F §concerns). Thêm: chat SSE deduct qua route thật, queue consumer end-to-end, OAuth callback. | `tests/integration/` (mới) | **P1** | Route-level test qua mock gateway; deduct chính xác. |
| T3 | **Load test cơ bản.** Verify rate limit (S2) đúng dưới tải, xác định throughput/latency baseline, D1/KV không nghẽn. → **Câu hỏi PM (Q2): có cần không?** | k6/artillery script (mới) | **P2** | Baseline RPS/latency; rate limit chính xác dưới tải. |

---

## 4. Bảng phân loại P0 / P1 / P2

### P0 — Launch Blocker (KHÔNG launch nếu thiếu)
| ID | Item | Nhóm |
|---|---|---|
| S1 | Webhook grant → invoice.paid | Security |
| S2 | Rate limiting per-user + per-IP | Security |
| S3 | Security headers (CSP/HSTS/...) | Security |
| S5 | Secrets production (BETTER_AUTH_URL + đầy đủ) | Security |
| S7 | XSS verify non-regression | Security |
| S10 | Credits race audit (path Phase 4) | Security |
| R3 | Queue DLQ consumer + alert | Reliability |
| C3 | Honesty labels audit | Correctness |
| L1 | Production deploy checklist | Launch |
| L2 | Smoke test production | Launch |
| L3 | Rollback plan | Launch |
| L5 | Env var checklist đầy đủ | Launch |

### P1 — Nên có (nên xong trước/ngay sau launch)
| ID | Item | Nhóm |
|---|---|---|
| S4 | CORS policy review | Security |
| S6 | Input validation gaps | Security |
| S8 | SQL injection spot-audit | Security |
| S9 | Webhook sig + OAuth state/PKCE verify | Security |
| S11 | Chạy security-review skill | Security |
| A1 | Fix label-without-for | a11y |
| A2 | Fix href="#" | a11y |
| O1 | Structured logging | Observability |
| O2 | Error tracking (chọn stack) | Observability |
| O3 | Cron/queue monitoring | Observability |
| O4 | Etsy quota dashboard/alert | Observability |
| R2 | Graceful degradation | Reliability |
| R4 | Idempotency audit | Reliability |
| R5 | Timeout review | Reliability |
| C1 | Taxonomy resolver (seam — phần data blocked-on-key) | Correctness |
| L4 | Backup D1 | Launch |
| T1 | E2E thật | Test |
| T2 | Integration test đầy đủ | Test |

### P2 — Sau launch
| ID | Item | Nhóm |
|---|---|---|
| A3 | a11y sweep tổng | a11y |
| R1 | @opentelemetry workaround review | Reliability |
| C2 | Calibration accuracy review (blocked-on-key phần lớn) | Correctness |
| T3 | Load test cơ bản | Test |

---

## 5. Ownership đề xuất (nếu implement)

> **Cảnh báo điều phối:** S1, S2, S3, S4, O1, R3, L1, L5 đụng 4 file dùng chung: `app.ts`, `hooks.server.ts`, `wrangler.jsonc`, `billingService.ts`. KHÔNG để 2 engineer sửa cùng file song song. Serialize theo thứ tự dưới.

**Đề xuất 3 engineer + 1 QA:**

- **Engineer SEC (Security/Billing)** — sở hữu `billingService.ts`, `subscriptionRepo.ts`, `routes/billing.ts`, `services/stripe.ts`, audit credits race + OAuth/PKCE.
  - S1 (webhook invoice.paid), S9, S10, S6, S8.
  - **Độc lập về file** với INFRA phần lớn (trừ không đụng app.ts).

- **Engineer INFRA (Middleware/Observability/Reliability)** — sở hữu `app.ts`, `hooks.server.ts`, các middleware mới, `wrangler.jsonc`, `jobs/queue.ts`.
  - **Thứ tự bắt buộc trên app.ts/hooks.server.ts** (1 engineer, tuần tự): S3 (headers, hooks) → S2 (rate limit, app.ts) → S4 (CORS, app.ts) → O1 (logger, app.ts).
  - wrangler.jsonc: R3 (DLQ consumer) + L1 (real IDs) — phối với DevOps/PM cho IDs thật.
  - O2, O3, O4, R2, R4, R5.

- **Engineer FE (a11y + honesty + E2E)** — sở hữu các `+page.svelte`.
  - A1, A2, A3 (a11y — độc lập file, low risk).
  - C3 (honesty labels — FE render).
  - T1 (E2E Playwright), hỗ trợ T2.

- **QA** — S7 (XSS verify), S11 (security-review skill), L2 (smoke production), L3 (rollback drill), L4 (backup drill), T2 (integration), tổng verify P0 trước go-live.

- **Blocked-on-Etsy-key (chờ key, không assign cứng):** C1 (data thật), C2 (calibration accuracy thật). Làm phần seam ngay; phần data đánh dấu chờ key.

**Thứ tự wave đề xuất:**
1. Wave A (song song): SEC làm S1/S9/S10 · INFRA làm S3→S2 trên app.ts/hooks · FE làm A1/A2/C3.
2. Wave B: INFRA làm S4/O1/R3/wrangler · SEC làm S6/S8 · FE làm T1.
3. Wave C: Observability còn lại (O2/O3/O4) · QA security-review + integration.
4. Wave D (launch): L1/L5 (IDs+secrets) → L2 smoke → L3 rollback drill → go-live.

---

## 6. Câu hỏi mở cho PM

1. **Observability stack (O2):** Sentry (`@sentry/cloudflare`, có cost + thêm dep) hay Cloudflare native (Workers Logs + Logpush + Tail Worker, zero extra dep nhưng query yếu hơn)? → Quyết định này chi phối O1/O2/O3.
2. **Load test (T3):** Có cần load test trước launch không, hay chấp nhận baseline + monitor sau launch? Nếu soft launch thì có thể defer.
3. **Scope launch:** Soft launch / closed beta (mời giới hạn user) hay public launch? → Ảnh hưởng mức độ chặt của S2 (rate limit), T3, và quyết định P0 nào có thể nới thành P1.
4. **Blocked-on-Etsy-key:** Launch khi CHƯA có Etsy API key thật (chạy mock data + honesty labels) hay chờ key? Nếu launch trước key: C1/C2 data thật defer; cần messaging rõ "estimated/mock" cho user. Nếu chờ key: thêm timeline xin duyệt Etsy app (research cảnh báo Etsy từng từ chối SEO tool).
5. **Stripe live keys + price IDs:** Đã có Stripe account production + 6 price IDs (side/business/enterprise × monthly/yearly) chưa? L1/L2 phụ thuộc.
6. **Cloudflare account + custom domain:** Đã có chưa? `database_id`/KV id hiện là placeholder `0000...` — cần account thật để tạo resource.
7. **Rate limit thresholds:** Limit cụ thể mỗi bucket (LLM tools/giờ, auth attempts/IP, general /api req/phút) — PM quyết theo gói pricing hay BA đề xuất default rồi PM duyệt?
8. **@opentelemetry (R1):** Cho phép thử nâng better-auth version để gỡ workaround (rủi ro regression auth), hay giữ nguyên cho launch và defer?

---

## 7. Assumptions

- A1: Workers Static-Assets mode (wrangler.jsonc hiện tại) là deploy target cuối — không quay lại Pages.
- A2: KV khả dụng cho rate limit sliding window (eventual consistency chấp nhận được cho rate limit; nếu cần strict → Durable Objects, nhưng tăng phức tạp — đề xuất KV cho v1).
- A3: Launch có thể chạy với Etsy mock data + honesty labels nếu chưa có key (cần PM xác nhận Q4).
- A4: Better Auth tự xử lý rate limit riêng cho auth ở mức nào đó — cần verify; nếu không, S2 phủ luôn auth path (lưu ý auth path đi qua `svelteKitHandler` chứ KHÔNG qua Hono `app.ts`, nên rate limit auth phải đặt ở `hooks.server.ts` hoặc edge, KHÔNG ở Hono middleware).
- A5: Credits không claw-back khi downgrade/cancel (spec §4.4 Phase 1) — giữ nguyên ở Phase 5.
- A6: DLQ consumer cần thêm vào wrangler.jsonc như một consumer mới của `herorank-analysis-dlq` — đây là cấu hình mới, chưa tồn tại.

---

## 8. Technical Constraints & Risks

- **Auth path không qua Hono:** `/api/auth/*` được `svelteKitHandler` nuốt ở `hooks.server.ts` TRƯỚC khi tới Hono `app.ts`. Rate limit + security cho auth endpoints PHẢI đặt ở hooks layer, không phải Hono middleware. (Risk cho S2/S3.)
- **Shared-file contention:** app.ts/hooks.server.ts/wrangler.jsonc là điểm nghẽn — nhiều item P0 hội tụ. Sai thứ tự = merge conflict + regression. (Đã serialize ở §5.)
- **usageCounter in-process:** Etsy quota counter hiện mất state khi isolate recycle → O4 cần persist (KV/D1) để đếm chính xác calls/ngày.
- **Workers limits:** CPU time, subrequest cap (50/1000), queue message size. Job dài (deep analysis paginate 20 pages) phải nằm trong giới hạn — R5 review.
- **Etsy app approval:** research (etsy-data-strategy §rủi ro) cảnh báo Etsy từng từ chối SEO/AI tool. Real-key path (C1/C2) gắn rủi ro pháp lý/duyệt — không phải chỉ kỹ thuật.
- **CSP và Svelte/Stripe:** CSP nghiêm có thể chặn inline script SvelteKit hydration / Stripe.js. Cần report-only trước, whitelist cẩn thận (S3).
