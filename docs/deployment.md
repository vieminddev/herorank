# HeroRank — Deployment Guide

> Phase 5, 2026-06-13. Branch `migrate-sveltekit`.
> Mục tiêu: đưa HeroRank từ local dev lên Cloudflare Workers production (Workers Static-Assets mode).
> Phần lớn bước dưới đây **blocked-on-user-infra** (Cloudflare account, domain, Stripe live) —
> đọc hướng dẫn trước, chuẩn bị account/key, rồi chạy lệnh theo thứ tự.

---

## Mục lục

1. [L1 — Production Deploy Checklist](#l1--production-deploy-checklist)
2. [L5 — Env Var Checklist đầy đủ](#l5--env-var-checklist-đầy-đủ)
3. [Stripe Setup](#stripe-setup)
4. [Soft Beta Launch](#soft-beta-launch)
5. [L3 — Rollback Plan](#l3--rollback-plan)
6. [L4 — Backup D1](#l4--backup-d1)

---

## L1 — Production Deploy Checklist

> **Trước khi bắt đầu:** cài wrangler CLI (`npm install -g wrangler`) và đăng nhập:
> ```bash
> wrangler login
> ```

### Bước 1 — Tạo Cloudflare account + xác minh domain

1. Đăng ký tài khoản tại [dash.cloudflare.com](https://dash.cloudflare.com) (Workers & Pages plan — Free hoặc Paid).
2. Thêm custom domain vào Cloudflare DNS (e.g. `herorank.com`). Copy 2 nameserver Cloudflare, trỏ ở registrar.
3. Đợi propagation (thường <30 phút). Verify: `dig NS herorank.com` thấy nameserver Cloudflare.

### Bước 2 — Tạo D1 database production

```bash
# Tạo database (tên phải khớp wrangler.jsonc → "herorank")
wrangler d1 create herorank
```

Output trả về `database_id` dạng UUID. **Điền vào `wrangler.jsonc`:**

```jsonc
// wrangler.jsonc → d1_databases
{
  "binding": "DB",
  "database_name": "herorank",
  "database_id": "<UUID-từ-output-trên>",   // <-- thay "00000000-0000-0000-0000-000000000000"
  "migrations_dir": "migrations"
}
```

### Bước 3 — Apply migrations 0001–0004

```bash
# Apply tất cả 4 migrations lên database PRODUCTION (không phải --local)
wrangler d1 migrations apply herorank --remote

# Verify
wrangler d1 execute herorank --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Kết quả mong đợi: `account`, `analyses`, `calibration_factors`, `connected_shops`, `credits_ledger`,
`etsy_api_usage`, `keywords_cache`, `oauth_states`, `processed_stripe_events`, `rank_history`,
`session`, `subscriptions`, `tracked_listings`, `user`, `verification`.

### Bước 4 — Tạo KV namespace production

```bash
wrangler kv namespace create KV
```

Output trả về `id`. **Điền vào `wrangler.jsonc`:**

```jsonc
// wrangler.jsonc → kv_namespaces
{
  "binding": "KV",
  "id": "<KV-namespace-id-từ-output>"   // <-- thay "00000000000000000000000000000000"
}
```

> KV namespace phục vụ cả session cache lẫn rate-limit sliding window (INFRA-EDGE, S2).
> Không cần tạo namespace riêng cho rate limit.

### Bước 5 — Tạo Queues

```bash
# Queue chính
wrangler queues create herorank-analysis

# Dead Letter Queue
wrangler queues create herorank-analysis-dlq
```

Queues đã được khai báo đầy đủ trong `wrangler.jsonc` (producers + consumers + DLQ consumer Phase 5 R3).
Không cần sửa file — chỉ cần queue tồn tại trên Cloudflare account.

Verify queue tồn tại:
```bash
wrangler queues list
```

### Bước 6 — Thêm Analytics Engine binding (ANALYTICS)

Thêm vào `wrangler.jsonc` (sau `kv_namespaces`, trước `triggers`):

```jsonc
"analytics_engine_datasets": [
  { "binding": "ANALYTICS", "dataset": "herorank_events" }
],
```

> Dataset `herorank_events` tự tạo khi Worker ghi lần đầu — không cần provision trước.
> Nếu bỏ qua bước này: observability vẫn hoạt động (chỉ mất phần Analytics Engine queryable metrics;
> JSON console logs vẫn ghi đầy đủ vào Workers Logs).

### Bước 7 — Cron Triggers

Cron đã khai báo trong `wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/30 * * * *", "0 1 * * 0", "0 2 * * 0", "0 3 * * 0", "0 4 * * 0"]
}
```

Không cần bước thêm — triggers tự activate khi `wrangler deploy`.
Verify sau deploy:
```bash
# Trong Cloudflare Dashboard → Workers → herorank → Triggers → Cron Triggers
# Hoặc trigger thủ công:
wrangler triggers run herorank --cron "*/30 * * * *"
```

### Bước 8 — Set tất cả secrets (xem L5 bên dưới)

```bash
# Lần lượt cho từng secret bắt buộc (xem bảng L5):
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put LLM_API_KEY
wrangler secret put OAUTH_TOKEN_KEY
# Stripe price IDs (plain vars, không phải secret — dùng wrangler vars hoặc wrangler.jsonc [vars])
# Xem L5 để phân biệt secret vs var
```

### Bước 9 — Custom domain + DNS

Sau `wrangler deploy`:

```bash
# Thêm custom domain cho Worker (thay herorank.com bằng domain thật)
wrangler deploy --route "herorank.com/*"
```

Hoặc trong Dashboard: Workers → herorank → Settings → Domains & Routes → Add Custom Domain.

DNS record tự tạo (type CNAME về Worker). SSL tự cấp qua Cloudflare.

### Bước 10 — Deploy

```bash
# Build + deploy
npm run build
wrangler deploy
```

Verify:
```bash
wrangler deployments list
# Kiểm tra deployment mới nhất
```

### Bước 11 — Smoke test production

Sau deploy thành công (xem L2 spec trong `01_ba_spec.md`):

1. Signup → credits = 30 (grant signup)
2. Chạy 1 LLM tool (title generator) → credits giảm
3. Chạy 1 Etsy tool (listing-analyzer — mock data nếu chưa có key)
4. Checkout Stripe test mode → webhook nhận → subscription active
5. OAuth connect mock (nếu chưa có Etsy key)
6. Trigger cron thủ công → verify Workers Logs

---

## L5 — Env Var Checklist đầy đủ

> Nguồn sự thật: `src/lib/server/env.ts`. Đối chiếu khớp 100% — không key nào bị bỏ sót.

### Bindings (wrangler.jsonc — KHÔNG phải secret/var)

| Binding | Type | Bắt buộc | Mô tả | Action |
|---|---|---|---|---|
| `DB` | D1Database | **Bắt buộc** | Primary datastore | `wrangler d1 create herorank` → điền `database_id` |
| `KV` | KVNamespace | **Bắt buộc** | Cache Etsy, session, rate-limit | `wrangler kv namespace create KV` → điền `id` |
| `ANALYTICS` | AnalyticsEngineDataset | Optional | Observability metrics sink | Thêm `analytics_engine_datasets` vào wrangler.jsonc (Bước 6) |
| `ASSETS` | Fetcher | Auto | Static assets (adapter-cloudflare) | Tự inject bởi Workers Static-Assets — không cần config |
| `ANALYSIS_QUEUE` | Queue | Optional* | Queue producer deep analysis | Queue `herorank-analysis` tạo Bước 5; binding đã có trong wrangler.jsonc |

> *`ANALYSIS_QUEUE` absent → fallback `waitUntil` inline (OK cho local dev). Production cần queue.

### Secrets (`wrangler secret put <KEY>`)

Secrets được inject lúc runtime — **không bao giờ commit vào code hay wrangler.jsonc**.

| Key | Bắt buộc | Nguồn production | Lệnh set |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | **Bắt buộc** | Tự sinh: `openssl rand -base64 32` | `wrangler secret put BETTER_AUTH_SECRET` |
| `STRIPE_SECRET_KEY` | **Bắt buộc** | Stripe Dashboard → Developers → API keys → Secret key (bắt đầu `sk_live_...`) | `wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | **Bắt buộc** | Stripe Dashboard → Webhooks → endpoint signing secret (bắt đầu `whsec_...`) | `wrangler secret put STRIPE_WEBHOOK_SECRET` |
| `LLM_API_KEY` | **Bắt buộc** | Gateway vtoken.viemind.ai → lấy API key từ account | `wrangler secret put LLM_API_KEY` |
| `OAUTH_TOKEN_KEY` | **Bắt buộc** nếu OAuth | Tự sinh: `openssl rand -base64 32` (AES-GCM 32-byte key) | `wrangler secret put OAUTH_TOKEN_KEY` |
| `ETSY_API_KEY` | Optional* | Etsy Developer Portal → App key | `wrangler secret put ETSY_API_KEY` |
| `ETSY_API_SECRET` | Optional* | Etsy Developer Portal → Shared secret | `wrangler secret put ETSY_API_SECRET` |
| `ETSY_OAUTH_CLIENT_ID` | Optional* | Etsy Developer Portal → App key (= ETSY_API_KEY cho OAuth) | `wrangler secret put ETSY_OAUTH_CLIENT_ID` |
| `ETSY_OAUTH_CLIENT_SECRET` | Optional* | Etsy Developer Portal → Shared secret | `wrangler secret put ETSY_OAUTH_CLIENT_SECRET` |

> *Optional = absent → mock provider hoạt động (soft beta). Xem [Soft Beta Launch](#soft-beta-launch).

**Cảnh báo `OAUTH_TOKEN_KEY`:** key này mã hóa OAuth tokens lưu trong D1. Nếu rotate key → tokens cũ
không giải mã được → mọi connected shop cần reconnect. Lên kế hoạch rotation cẩn thận; không thay
arbitrarily. Lưu backup key cũ ở chỗ an toàn trước khi rotate.

### Plain vars (`wrangler.jsonc [vars]` hoặc `.dev.vars`)

Vars không phải secret (không sensitive) — có thể khai báo trong `wrangler.jsonc` dưới key `vars`:

```jsonc
"vars": {
  "BETTER_AUTH_URL": "https://herorank.com",
  "LLM_BASE_URL": "https://vtoken.viemind.ai/v1",
  "LLM_MODEL": "gpt-4o-mini",
  "ETSY_DAILY_CAP": "8000",
  "ETSY_CRON_CAP": "2000",
  "ETSY_OAUTH_REDIRECT_URI": "https://herorank.com/api/connect/etsy/callback",
  "STRIPE_PRICE_SIDE_MONTHLY": "price_...",
  "STRIPE_PRICE_SIDE_YEARLY": "price_...",
  "STRIPE_PRICE_BUSINESS_MONTHLY": "price_...",
  "STRIPE_PRICE_BUSINESS_YEARLY": "price_...",
  "STRIPE_PRICE_ENTERPRISE_MONTHLY": "price_...",
  "STRIPE_PRICE_ENTERPRISE_YEARLY": "price_...",
  "RATE_LIMIT_LLM_PER_HOUR": "30",
  "RATE_LIMIT_GENERAL_PER_MIN": "120",
  "RATE_LIMIT_AUTH_PER_15MIN": "10"
}
```

| Key | Bắt buộc | Default/Ghi chú | Nguồn production |
|---|---|---|---|
| `BETTER_AUTH_URL` | Recommended | Falls back to request origin nếu absent. **Set domain thật** để tránh OAuth redirect sai. | `https://herorank.com` (domain thật) |
| `LLM_BASE_URL` | Optional | Default: `https://vtoken.viemind.ai/v1` | Khai báo tường minh |
| `LLM_MODEL` | Optional | Tên model OpenAI-compatible. Bắt buộc để LLM tools hoạt động. | Hỏi owner gateway vtoken |
| `ETSY_DAILY_CAP` | Optional | Default: 8000. Hard cap calls Etsy/ngày (< limit 10k). | `8000` |
| `ETSY_CRON_CAP` | Optional | Default: 2000. Sub-cap dành cho cron (không starve user requests). | `2000` |
| `ETSY_OAUTH_REDIRECT_URI` | Optional* | Phải khớp URL đăng ký trong Etsy app. | `https://herorank.com/api/connect/etsy/callback` |
| `STRIPE_PRICE_SIDE_MONTHLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `STRIPE_PRICE_SIDE_YEARLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `STRIPE_PRICE_BUSINESS_YEARLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `STRIPE_PRICE_ENTERPRISE_YEARLY` | Optional* | Xem [Stripe Setup](#stripe-setup). | Stripe Dashboard |
| `RATE_LIMIT_LLM_PER_HOUR` | Optional | Default: 30. Có thể nới cho beta khi traffic thấp. | `30` (soft beta) |
| `RATE_LIMIT_GENERAL_PER_MIN` | Optional | Default: 120. | `120` |
| `RATE_LIMIT_AUTH_PER_15MIN` | Optional | Default: 10. | `10` |

> *Price IDs required để checkout hoạt động. `ETSY_OAUTH_REDIRECT_URI` required khi Etsy key thật.

### Checklist tóm tắt trước deploy

```
[ ] database_id D1 thật → wrangler.jsonc
[ ] KV namespace id thật → wrangler.jsonc
[ ] analytics_engine_datasets ANALYTICS → wrangler.jsonc (optional nhưng nên có)
[ ] Queue herorank-analysis tạo xong
[ ] Queue herorank-analysis-dlq tạo xong
[ ] BETTER_AUTH_SECRET set (wrangler secret)
[ ] STRIPE_SECRET_KEY set (wrangler secret)
[ ] STRIPE_WEBHOOK_SECRET set (wrangler secret)
[ ] LLM_API_KEY set (wrangler secret)
[ ] OAUTH_TOKEN_KEY set (wrangler secret)
[ ] BETTER_AUTH_URL set (wrangler.jsonc vars)
[ ] LLM_BASE_URL + LLM_MODEL set (wrangler.jsonc vars)
[ ] 6 STRIPE_PRICE_* set (wrangler.jsonc vars — sau khi tạo Stripe products)
[ ] ETSY_OAUTH_REDIRECT_URI set (wrangler.jsonc vars — khi có Etsy key)
```

---

## Stripe Setup

### Tạo products và price IDs

Đăng nhập [dashboard.stripe.com](https://dashboard.stripe.com).

**Bước 1 — Test mode trước:**
Bật "Test mode" (toggle góc trên phải). Tạo products và prices ở test mode để smoke test.

**Bước 2 — Tạo 3 Products:**

| Product name | Internal description |
|---|---|
| HeroRank Side Hustle | Gói side cho individual sellers |
| HeroRank Business | Gói business cho growing shops |
| HeroRank Enterprise | Gói enterprise cho large operations |

Với mỗi product: Products → Add product → tạo 2 prices (monthly + yearly, recurring).

**Bước 3 — Kết quả: 6 Price IDs**

| Env key | Mô tả | Dạng ID |
|---|---|---|
| `STRIPE_PRICE_SIDE_MONTHLY` | Side - tháng | `price_1...` |
| `STRIPE_PRICE_SIDE_YEARLY` | Side - năm | `price_1...` |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | Business - tháng | `price_1...` |
| `STRIPE_PRICE_BUSINESS_YEARLY` | Business - năm | `price_1...` |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Enterprise - tháng | `price_1...` |
| `STRIPE_PRICE_ENTERPRISE_YEARLY` | Enterprise - năm | `price_1...` |

**Bước 4 — Tạo Webhook endpoint:**

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **Endpoint URL:** `https://herorank.com/api/billing/webhook`
- **Events cần subscribe:**
  - `invoice.paid` (S1 — grant credits đúng chu kỳ)
  - `customer.subscription.updated` (sync plan/status — KHÔNG grant credits)
  - `customer.subscription.deleted` (cancel)
  - `checkout.session.completed`
  - `payment_intent.payment_failed`

Copy **Signing secret** (`whsec_...`) → `wrangler secret put STRIPE_WEBHOOK_SECRET`.

**Bước 5 — Test mode smoke:**

```bash
# Dùng Stripe CLI để test webhook locally
stripe listen --forward-to localhost:8788/api/billing/webhook
stripe trigger invoice.paid
```

**Bước 6 — Chuyển sang Live mode:**

Khi sẵn sàng live: Dashboard → toggle off Test mode → lặp lại Bước 2-4 với live keys.
Live `STRIPE_SECRET_KEY` bắt đầu `sk_live_...` (khác với test `sk_test_...`).
Update tất cả env qua `wrangler secret put` với live values.

---

## Soft Beta Launch

> Theo quyết định PM (00_pm_decisions.md): launch trước với mock Etsy data + honesty labels,
> không chờ Etsy commercial key. Khi key được duyệt → swap nguồn, không đổi API.

### Trạng thái hiện tại (khi launch beta)

| Feature | Trạng thái beta | Ghi chú |
|---|---|---|
| 5 LLM tools | Hoạt động đầy đủ | LLM_API_KEY cần set |
| listing-analyzer | Mock data (Etsy API absent) | Badge "estimated" hiển thị |
| shop-analyzer | Mock data | Badge "estimated" hiển thị |
| rank-check | Mock data, label "estimated position" | Honesty label theo spec C3 |
| niche-finder | Mock data | Badge "estimated" |
| best-sellers | Trống trước khi cron chạy lần đầu (honest empty) | Đúng theo C3 |
| etsy-trends | Trống trước khi cron chạy | Đúng theo C3 |
| OAuth connected shops | Mock provider | ETSY_OAUTH_CLIENT_* absent → mock |
| buyer-check | "Shop/review reputation check" — API public | Hoạt động nếu có ETSY_API_KEY |

### Giới hạn beta users

Để giới hạn số lượng user trong beta:
- Option A (đơn giản): tạo invite code — check code ở middleware signup trước khi tạo account.
- Option B: whitelist email domain.
- Option C: Rate limit signup chặt hơn (`RATE_LIMIT_AUTH_PER_15MIN=5`).

> Cơ chế invite code chưa implement — cần tạo thêm nếu muốn closed beta thực sự.

### Messaging "estimated" cho user

Mọi số ước lượng phải có badge "estimated" (C3, đã verify). Không có số bịa:
- Không hiển thị views, searches, percentile (không có trong Etsy API)
- Sales estimate có nhãn rõ ràng
- Xem `docs/etsy-data-strategy.md` — lớp 2 estimation engine

### Swap Etsy key khi được duyệt

Khi Etsy commercial key được duyệt:

1. `wrangler secret put ETSY_API_KEY` (app key)
2. `wrangler secret put ETSY_API_SECRET` (shared secret)
3. `wrangler secret put ETSY_OAUTH_CLIENT_ID`
4. `wrangler secret put ETSY_OAUTH_CLIENT_SECRET`
5. Update `ETSY_OAUTH_REDIRECT_URI` trong wrangler.jsonc vars
6. `wrangler deploy` — không đổi API, seam đã sẵn

Chi tiết data strategy: [etsy-data-strategy.md](./etsy-data-strategy.md).

**Lưu ý khi nộp Etsy app:** mô tả use-case là "shop management / listing optimization helper",
KHÔNG nhắc AI/ML/analytics diện rộng (xem etsy-data-strategy.md §rủi ro).

---

## L3 — Rollback Plan

### Rollback Worker deployment

```bash
# Xem danh sách deployments
wrangler deployments list

# Rollback về deployment trước (ID lấy từ list trên)
wrangler rollback <deployment-id>

# Hoặc rollback về deployment liền trước (không cần ID)
wrangler rollback
```

Rollback Worker là instant (traffic re-routed trong vài giây). Không ảnh hưởng D1 data.

### D1 — Forward-only migrations

D1 migrations là **forward-only** — không có automatic rollback schema. Chiến lược:

1. **Backup trước mỗi migration** (xem L4 bên dưới).
2. Nếu migration mới gây lỗi: rollback Worker về version trước (không chạy migration mới).
3. Nếu cần undo schema change: viết migration mới (`0005_rollback_xyz.sql`) với `DROP`/`ALTER` ngược lại, áp sau khi đã verify an toàn.
4. D1 Time Travel (xem L4) cho phép restore database state đến bất kỳ thời điểm nào trong 30 ngày — dùng khi data bị corrupt.

**Không bao giờ:** sửa trực tiếp migration file đã apply vào production.

### Tắt nhanh tool lỗi (Feature flag qua env)

Nếu một tool cụ thể gây lỗi production, tắt nhanh không cần redeploy:

**Option 1 — Env var flag (instant, không redeploy):**

Thêm check trong route handler. Ví dụ nếu tool `deep-analysis` lỗi:
```bash
# Set env var qua wrangler (instant — không cần redeploy với wrangler vars)
# Lưu ý: wrangler secret/vars update cần redeploy để có hiệu lực trong runtime
# Cách nhanh nhất là rollback deployment
wrangler rollback
```

**Option 2 — Rate limit thắt chặt về 0 (giả tắt):**
```bash
# Thắt LLM limit về 0 → mọi LLM tool trả 429 ngay
# (Không lý tưởng vì vẫn tính là error; dùng chỉ khi rollback không khả thi)
```

**Option 3 — Rollback Worker** (luôn nên làm trước tiên — xem trên).

### Rollback drill

Thực hiện drill trên staging trước khi live:
1. Deploy version A → verify hoạt động.
2. Deploy version B (có lỗi giả).
3. `wrangler rollback` → verify quay về version A.
4. Đo thời gian: từ phát hiện lỗi đến traffic rollback xong.

---

## L4 — Backup D1

### Export thủ công (pre-deploy)

Luôn export database trước mỗi migration hoặc deploy quan trọng:

```bash
# Export toàn bộ database ra file SQL
wrangler d1 export herorank --remote --output backup-$(date +%Y%m%d-%H%M%S).sql

# Ví dụ output: backup-20260613-143000.sql
```

Lưu file backup ở nơi an toàn (không commit vào git — có PII).

### D1 Time Travel (Cloudflare built-in)

D1 tự động lưu snapshots trong **30 ngày**. Restore về bất kỳ timestamp nào:

```bash
# Xem trạng thái Time Travel hiện tại
wrangler d1 time-travel info herorank --remote

# Restore về timestamp cụ thể (ISO 8601)
wrangler d1 time-travel restore herorank --remote --timestamp "2026-06-13T10:00:00Z"

# Restore về 1 giờ trước
wrangler d1 time-travel restore herorank --remote --timestamp "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"
```

> **Quan trọng:** Time Travel restore ghi đè database hiện tại. Export backup trước khi restore.

### Restore drill (thực hiện định kỳ)

```bash
# 1. Export snapshot hiện tại
wrangler d1 export herorank --remote --output pre-drill-backup.sql

# 2. Verify Time Travel available
wrangler d1 time-travel info herorank --remote

# 3. Restore về 15 phút trước (drill)
wrangler d1 time-travel restore herorank --remote \
  --timestamp "$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"

# 4. Verify tables và row count
wrangler d1 execute herorank --remote \
  --command "SELECT COUNT(*) as cnt FROM 'user';"

# 5. Restore lại bản mới nhất từ backup nếu cần
# (Cloudflare Dashboard → D1 → herorank → Time Travel → chọn timestamp)
```

### Lịch export định kỳ (optional — cron ngoài)

Nếu muốn export tự động, dùng GitHub Actions hoặc cron job ngoài:

```yaml
# .github/workflows/d1-backup.yml (ví dụ)
on:
  schedule:
    - cron: '0 2 * * *'  # 2am UTC hàng ngày
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g wrangler
      - run: wrangler d1 export herorank --remote --output backup-$(date +%Y%m%d).sql
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      # Upload to R2 hoặc S3 để lưu trữ dài hạn
```
