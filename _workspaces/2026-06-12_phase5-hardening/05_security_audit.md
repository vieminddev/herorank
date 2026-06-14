# 05 — Security Audit (Phase 5, pre-launch) — Task #28

> Security Auditor, 2026-06-13. Branch `migrate-sveltekit`. Scope: read-only audit of
> `src/` cho soft/closed-beta launch. Nguồn: 01_ba_spec.md (nhóm Security S1–S11) +
> 00_pm_decisions.md (soft beta, mock Etsy, Cloudflare-native obs).
>
> Phương pháp: audit thủ công code thật (skill `security-review` là diff-based, không phù hợp
> cho full-surface pre-launch audit → audit thủ công toàn bộ 10 bề mặt theo brief).

---

## 0. Tóm tắt điều hành (Go/No-Go)

**Verdict: GO cho soft/closed beta** — với điều kiện sửa **1 P0-blocker** (F-01) trước khi mời
user, và theo dõi 3 finding High. Codebase hardening Phase 5 đã ở mức khá tốt: rate limit,
security headers, CSP, CORS same-origin, webhook signature, OAuth PKCE/state one-shot, token
AES-GCM at-rest, atomic credit spend, multi-tenancy scoping đều hiện diện và đúng về tổng thể.

Lý do KHÔNG phải no-go: bề mặt có rủi ro cao nhất (billing webhook, auth, token-at-rest,
multi-tenancy) đều an toàn. Finding P0 là một **lỗ hổng double-charge/double-grant tiềm tàng do
comment sai về cơ chế idempotency** — không phải lỗ hổng đang bị khai thác active, nhưng vi phạm
một bất biến tài chính (financial invariant) nên phải chặn.

### Đếm theo severity
| Severity | Count |
|---|---|
| Critical | 0 |
| High | 3 (F-01 P0-blocker, F-02, F-03) |
| Medium | 5 |
| Low | 4 |
| Info | 4 |

### Danh sách P0-launch-blocker
- **F-01 (High)** — Credit ledger KHÔNG có UNIQUE constraint trên `ref`; `spend()` không dedup
  theo `ref` → double-spend khả thi khi job re-run sau khi status bị reset, dù comment trong
  `consume.ts` khẳng định "ledger dedupes on ref" (SAI). Bất biến tài chính bị vi phạm.

> Các finding High còn lại (F-02 rate-limit fail-open + IP-spoof; F-03 CSP report-only) được
> chấp nhận cho soft beta (PM: closed beta, user tin cậy nhỏ) nhưng PHẢI fix trước public launch.

---

## 1. Bảng findings theo severity

### CRITICAL
*(không có)*

### HIGH

| ID | Bề mặt | File:line | Mô tả | Khai thác | Fix đề xuất | P0? |
|---|---|---|---|---|---|---|
| **F-01** | Credits / idempotency | `repositories/creditsRepo.ts:123-163`, `migrations/0002_herorank.sql:17-25`, `jobs/consume.ts:104-134` | `credits_ledger` KHÔNG có UNIQUE index trên `(user_id, ref)`. `spend()` chỉ chạy conditional UPDATE `WHERE credits_balance >= cost` + INSERT ledger — **không hề kiểm tra `hasLedgerRef`**. Chỉ `grant()` mới dedup theo ref. Comment trong `consume.ts:108-111` ("the credits ledger dedupes on ref, so the re-run is a no-op") là **SAI sự thật** cho đường spend. | Nếu một deep-analysis job đã `done` (đã charge 8 credits) bị **reset status** (manual requeue, migration, ops script, hoặc bug ghi đè payload) rồi `processDeepAnalysisJob` chạy lại: early-return chỉ chặn khi status đang là `done`/`failed`. Nếu status không phải done/failed (vd reset về `running`/`queued`), spend chạy LẦN 2 với cùng `ref:job:{id}` → **charge kép**. Tương tự, `requireCredits` dùng `ref: tool` (hằng số tên tool) cho mọi lần spend nên ref hoàn toàn vô nghĩa cho dedup ở đường tool thường. | Thêm migration: `CREATE UNIQUE INDEX idx_ledger_ref ON credits_ledger(user_id, ref) WHERE ref IS NOT NULL;` VÀ trong `spend()` bắt lỗi UNIQUE violation → trả `{ok:false}` (đã charge rồi) thay vì charge lại. HOẶC: trong `spend()`, thêm guard `hasLedgerRef` khi ref là per-job (job:*). Lưu ý: ref hằng-số `tool` ở `requireCredits` KHÔNG được unique-hóa (sẽ chặn lần spend thứ 2 cùng tool) — cần đổi `requireCredits` sang ref duy nhất/request (vd `req:{requestId}`) trước, rồi mới bật unique index. | **CÓ — P0** |
| **F-02** | Rate limiting | `api/middleware/rateLimit.ts:89-129,131-138`, `hooks.server.ts:88-91` | (a) **Fail-open**: mọi lỗi KV → `checkRateLimit` trả `allowed:true` (dòng 125-128). KV outage = rate-limit biến mất hoàn toàn (kể cả auth brute-force). (b) **IP spoof**: `clientIp()` đọc `x-forwarded-for` (dòng 132-137). Trên Cloudflare, `cf-connecting-ip` là tin cậy và được ưu tiên — TỐT — nhưng fallback `x-forwarded-for` do client kiểm soát. Nếu Worker chạy sau một proxy khác hoặc bị gọi trực tiếp (không qua CF edge), kẻ tấn công đặt `x-forwarded-for` tùy ý → mỗi request một "IP" → bypass per-IP limit hoàn toàn. | Brute-force auth: gửi kèm `X-Forwarded-For: <random>` mỗi lần → mỗi lần là IP mới → bucket `auth` (10/15min/IP) vô hiệu. Hoặc trigger KV lỗi để fail-open. | (a) Cho bucket `auth` → **fail-closed** (KV lỗi thì chặn / hoặc đếm in-isolate fallback). (b) Trên CF chỉ tin `cf-connecting-ip`; CHỈ dùng `x-forwarded-for` khi không có header CF. Tài liệu hóa rằng app phải luôn ở sau CF edge (không expose origin trực tiếp). | Không (chấp nhận cho closed beta; **fix trước public**) |
| **F-03** | Security headers / CSP | `hooks.server.ts:50-63` | CSP đang ở chế độ **`Content-Security-Policy-Report-Only`** (dòng 53) — KHÔNG enforce. Ngoài ra `script-src` cho phép `'unsafe-inline'` (cần cho SvelteKit hydration) → ngay cả khi enforce, XSS injected script vẫn chạy được. | XSS payload (nếu lọt qua sanitize) sẽ KHÔNG bị CSP chặn vì (a) report-only không block, (b) unsafe-inline cho phép inline script. CSP hiện chỉ là cảnh báo, không phải lớp phòng thủ. | Sau "clean report window", chuyển sang `Content-Security-Policy` (enforce). Thay `'unsafe-inline'` script-src bằng nonce-based CSP (SvelteKit hỗ trợ `csp` trong svelte.config). HSTS/X-Frame/nosniff đã đúng. | Không (defense-in-depth; XSS chính đã chặn ở sanitize — fix trước public) |

### MEDIUM

| ID | Bề mặt | File:line | Mô tả | Khai thác | Fix | P0? |
|---|---|---|---|---|---|---|
| **F-04** | DLQ idempotency | `jobs/dlq.ts:52-55` | `handleDLQ` gọi `jobs.update(jobId, {status:'failed'})` **vô điều kiện**, không kiểm tra status hiện tại. | Race hiếm: job hoàn tất `done` (đã charge) ngay trước khi DLQ message (từ retry trước đó) tới → DLQ ghi đè status thành `failed`, user thấy "failed" dù đã trừ tiền + có kết quả. Không double-charge (chỉ ghi đè trạng thái) nhưng gây nhầm lẫn + có thể coi là "charge nhưng báo fail". | Trong `handleDLQ` đọc job trước; nếu đã `done` → skip update, chỉ log. (Cùng pattern early-return của `consume.ts`.) | Không |
| **F-05** | Auth cookie hardening | `auth.ts:33-67` | Không có khối `advanced.defaultCookieAttributes` / `useSecureCookies` tường minh. Dựa hoàn toàn vào default của Better Auth 1.6 (httpOnly=true, sameSite=lax, secure=auto theo https). | Trong production (https) default an toàn. Nhưng `secure` phụ thuộc baseURL được suy ra từ request origin — nếu một request nội bộ tới qua http (vd health check, proxy lỗi cấu hình) có thể set cookie không-secure. Rủi ro thấp nhưng không tường minh. | Thêm `advanced: { useSecureCookies: true, defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: true } }` cho production. Cân nhắc `sameSite:'strict'` cho session nếu không cần cross-site nav. | Không |
| **F-06** | Webhook idempotency window | `services/billingService.ts:290-293`, `migrations/0002:29-33` | `markEventProcessed(event.id)` ghi vào `processed_stripe_events` (PK event_id) như cổng idempotency, NHƯNG nó được gọi **trước** khi xử lý và "first writer wins" — nếu handler ném lỗi SAU khi mark đã ghi, route trả 500 → Stripe retry → lần retry bị `markEventProcessed` chặn (trả false) → **event KHÔNG bao giờ được xử lý lại** (mất grant credits). | Lỗi tạm thời (D1 blip) giữa mark và grant → credits của user cho chu kỳ đó bị mất vĩnh viễn; retry của Stripe bị no-op. | Mark sau khi xử lý thành công, HOẶC mark trong cùng transaction/batch với mutation, HOẶC dùng grant ref (`invoice:{id}`) làm nguồn idempotency thật (đã có) và bỏ mark-first. Grant đã idempotent theo invoice id nên double-grant không xảy ra; vấn đề là **mất grant**. | Không |
| **F-07** | Input validation — chat depth | `services/prompts/chat.ts:13-23` | `messages` cap 40 items × 4000 chars = ~160KB/request có thể đẩy vào LLM. Không có cap tổng độ dài hội thoại. Các tool khác (title/tag/desc) cần xác nhận có maxLength trên field tự do. | DoS chi phí: spam 40×4000 ký tự → token cost cao. Rate-limit `llm` (30/h/user) giảm thiểu nhưng vẫn tốn. | Thêm cap tổng ký tự (vd Σcontent ≤ 24KB) trong zod `.superRefine`. | Không |
| **F-08** | Prompt injection | `services/prompts/chat.ts:26-43`, `llm-tools.ts:256` | System prompt được prepend server-side (tốt — client chỉ gửi `user`/`assistant`, role enum chặn `system`). Tuy nhiên không có lớp chống prompt-injection trong nội dung user (user có thể "ignore previous instructions"). | User có thể lái model ra ngoài phạm vi Etsy, hoặc trích system prompt. Tác động thấp (không có tool-calling, không có data nhạy cảm trong prompt, output chỉ về tới chính user đó). | Chấp nhận cho beta. Cân nhắc thêm guard câu cuối system prompt + output filter nếu mở rộng. | Không |

### LOW

| ID | Bề mặt | File:line | Mô tả | Fix | P0? |
|---|---|---|---|---|---|
| **F-09** | OAuth state TTL prune | `connectedShopRepo.ts:115-118`, `oauth.ts` | `oauth_states` được prune qua `pruneStates` nhưng không thấy nó được gọi trong cron/route nào (chỉ `takeState` xóa one-shot). State chưa-dùng (user bỏ giữa chừng) tích tụ. | Gọi `pruneStates` trong cron weekly hoặc trong `/etsy/start`. Rủi ro thấp (chỉ rác D1). | Không |
| **F-10** | clientIp 'unknown' bucket | `rateLimit.ts:136` | Khi không có header IP → identity = `ip:unknown`. Mọi request thiếu header chia chung 1 bucket → có thể (a) DoS lẫn nhau hoặc (b) né limit nếu attacker tạo điều kiện thiếu header. | Trên CF luôn có `cf-connecting-ip`, nên thực tế hiếm. Cân nhắc fail-closed cho `unknown` ở bucket auth. | Không |
| **F-11** | Error stack trong log | `observability/log.ts:157-171` | `logError` ghi `error_stack` đầy đủ. Stack của ta không phải PII, nhưng nếu một lỗi bao bọc giá trị nhạy cảm trong message (vd lỗi từ Stripe/Etsy chứa token), nó lọt log. Redact chỉ áp lên KEY của context, KHÔNG áp lên error_message/stack. | Đảm bảo các service đã map lỗi thành message an toàn (llmService/etsyOAuth đã làm — không đính kèm raw body/token). Cân nhắc redact cả error_message theo regex token. | Không |
| **F-12** | CORS host header trust | `cors.ts:40` | So sánh dùng `c.req.header('host')` (client-controlled) làm reqHost khi không suy ra được từ URL. Host header có thể giả mạo. | Vì chỉ dùng để so khớp same-origin (origin cũng client-set), tác động thấp — CSRF thật được Better Auth + cookie sameSite chặn. Ưu tiên `new URL(c.req.url).host`. | Không |

### INFO

| ID | Bề mặt | Ghi chú |
|---|---|---|
| **F-13** | Secrets | grep `sk_live_/sk_test_/whsec_/ghp_/AKIA/fc-` trên `src/` → **0 hit**. `.dev.vars` được gitignore (`.gitignore:24-25`), KHÔNG tracked trong git (`git ls-files` chỉ có `.env.example`). Không hardcoded secret. Server secret không lọt client bundle (tất cả qua `env`/`platform.env`, services là `$lib/server/*`). ĐẠT. |
| **F-14** | SQL injection | Toàn bộ D1 dùng `prepare().bind(?)` parameterized — creditsRepo, connectedShopRepo, analysesJobStore, analysesStore, jobsStore. KHÔNG có string-interpolation user input vào SQL. ĐẠT (S8). |
| **F-15** | XSS / {@html} | Chỉ **1** occurrence `{@html}` (`rankhero-ai/+page.svelte:132`) qua `renderContent`→`sanitize.ts:renderBold` (escape-first rồi mới `**bold**`→`<strong>`). Đúng thứ tự, an toàn. ĐẠT (S7 non-regression). |
| **F-16** | SSRF (LLM/Etsy fetch) | Base URL của Etsy (`openapi.etsy.com`) và LLM (`vtoken.viemind.ai`) là HẰNG SỐ/env, KHÔNG nhận URL từ user. listingId coerce `Number()` (chỉ chữ số → vào path an toàn); shopName qua `findShops` (URLSearchParams encode). KHÔNG có SSRF. ĐẠT. |

---

## 2. Đánh giá theo từng bề mặt brief

| # | Bề mặt | Kết luận |
|---|---|---|
| 1 | **Auth** (auth.ts, hooks.server.ts) | Session 7d, password ≥8, requireAuth forward raw headers. Cookie flags dựa default Better Auth (an toàn ở prod https) — F-05 khuyến nghị tường minh hóa. Auth brute-force rate-limit có (F-02 caveat fail-open/IP-spoof). KHÔNG có auth bypass. |
| 2 | **Billing/webhook** | Signature verify async (`constructEventAsync`) ✓. Grant chỉ trên `invoice.paid` cycle-anchor, idempotent theo invoice id ✓. `subscription.updated` KHÔNG grant ✓ (chống double-grant). Body size cap 256KB ✓. Plan/amount lấy từ price id authoritative (không trust metadata mù) ✓. F-06: rủi ro MẤT grant (không phải double-grant) do mark-first. KHÔNG có double-grant credits. |
| 3 | **Credits** | Atomic conditional spend race-safe ✓; charge-on-success (no charge on fail) ✓; pre-check + atomic re-check chống overspend ✓; negative balance bị guard `WHERE >= cost` ✓. **F-01**: thiếu ref-dedup ở spend → double-spend nếu status reset (P0). |
| 4 | **OAuth Etsy** | state one-shot + ownership check (`user_id !== user.id`) ✓; PKCE S256 ✓; token AES-256-GCM at-rest, IV ngẫu nhiên/message, key qua SHA-256(secret) ✓; redirect_uri từ config (không user) ✓; KHÔNG log token (stripUrl, comment cấm) ✓. F-09 (prune) low. Read-only scopes ✓. |
| 5 | **Rate limiting** | KV sliding-window, bucket llm/general/auth ✓. **F-02**: fail-open + x-forwarded-for spoof (High, chấp nhận closed beta). F-10 low. KV key namespaced `rl:` (không injection — identity là userId/IP, không phải input tùy ý). |
| 6 | **Input/injection** | zod phủ tốt; SQL parameterized (F-14 ✓); XSS escaped (F-15 ✓); SSRF không có (F-16 ✓); prompt injection low (F-08); F-07 chat length cap medium. |
| 7 | **Secrets** | F-13 ✓ sạch hoàn toàn. |
| 8 | **Headers/CORS** | HSTS/X-Frame DENY/nosniff/Referrer/Permissions ✓. CSP report-only + unsafe-inline (F-03 High). CORS same-origin, webhook exempt ✓ (F-12 low host-trust). |
| 9 | **Multi-tenancy** | tracked_listings/analyses/connected_shops/credits đều scope `WHERE user_id = ?`. Job poll dùng `get(userId, id)` owner-scoped ✓; `getById` chỉ nội bộ consumer. rank_history GLOBAL theo thiết kế (PM). KHÔNG có IDOR. |
| 10 | **Workers-specific** | DLQ consumer đã wired (worker.ts route theo `batch.queue`, wrangler có dead_letter_queue + consumer) ✓. F-04 (DLQ ghi đè status) medium. Queue message không ký nhưng nội bộ CF (không external tamper surface). env binding optional an toàn. |

---

## 3. Khuyến nghị thứ tự khắc phục

1. **TRƯỚC beta (P0):** F-01 — thêm unique-ref dedup cho spend (đổi `requireCredits` ref sang
   per-request trước, rồi unique index + bắt lỗi violation). 1 migration + 2 file.
2. **Trước public launch (High):** F-02 (fail-closed auth bucket + chỉ tin cf-connecting-ip),
   F-03 (enforce CSP + nonce).
3. **Sớm (Medium):** F-04 (DLQ status guard), F-06 (webhook mark-after-success), F-05 (cookie
   tường minh), F-07 (chat length cap).
4. **Khi tiện (Low/Info):** F-09–F-12.

---

## 4. Go/No-Go cuối cùng

**GO cho soft/closed beta** sau khi sửa F-01 (P0). Các High còn lại (F-02, F-03) được PM-context
(closed beta, user tin cậy nhỏ, sau CF edge) cho phép defer NHƯNG là **hard gate cho public
launch**. Không có Critical, không có auth bypass, không có IDOR, không có secret leak, không có
SQLi/XSS/SSRF đang mở. Bề mặt tài chính (billing/credits) an toàn ngoại trừ F-01.
