# HeroRank — Observability Guide

> Phase 5 (O1/O2/O3/O4), 2026-06-13. Branch `migrate-sveltekit`.
> Stack: Cloudflare native — Workers Logs + Analytics Engine. Không Sentry (PM decision, 00_pm_decisions.md).

---

## 1. Logging schema (structured JSON)

Mọi log đều đi qua `src/lib/server/observability/log.ts` (INFRA-EDGE contract, 02_contract_edge.md §1).
Hai sinks mỗi lần gọi: JSON line ra `console` (Workers Logs) + optional Analytics Engine metric.

### `logEvent(level, fields, analytics?)`

```ts
logEvent('info', {
  event: 'request',
  request_id: 'uuid-v4',
  user_id: 'user_abc123',      // id ONLY — không bao giờ email (PII)
  path: '/api/tools/tag-generator',
  tool: 'tag-generator',
  credits_delta: -2,
  latency_ms: 340,
  status: 200,
}, env.ANALYTICS);
```

### `logError(err, context?)`

```ts
logError(err, {
  event: 'job_failed',
  request_id: reqId,
  tool: 'deep-analysis',
  user_id: userId,
  ANALYTICS: env.ANALYTICS,   // ANALYTICS field bị strip khỏi log body tự động
});
```

### Tên event chuẩn

| `event` | Khi nào |
|---|---|
| `request` | Mỗi HTTP request (logger middleware) |
| `job` | Mỗi queue message xử lý xong |
| `job_failed` | Queue message fail (trước khi vào DLQ) |
| `dlq` | DLQ consumer nhận message |
| `cron` | Mỗi cron branch chạy xong |
| `unhandled_error` | `app.onError` catch |
| `etsy_quota` | Khi Etsy daily counter đạt ngưỡng |

### PII redaction (tự động)

Keys chứa `email`, `token`, `password`, `secret`, `authorization`, `cookie`, `apikey`, `api_key`, `body`
bị thay bằng `[redacted]` tự động. Không cần thêm logic nếu không thêm field mới chứa PII.

---

## 2. Xem Workers Logs (Cloudflare Dashboard)

**Real-time:**
```
Cloudflare Dashboard → Workers & Pages → herorank → Logs → Real-time Logs
```

**Sau khi phát sinh (Workers Logs):**
```
Dashboard → Workers & Pages → herorank → Logs → (chọn time range)
```

**Qua CLI (wrangler tail):**
```bash
# Stream logs real-time từ terminal
wrangler tail herorank

# Filter theo status 500+
wrangler tail herorank --status error

# Filter theo log level
wrangler tail herorank --search "\"level\":\"error\""
```

---

## 3. Analytics Engine — queries cơ bản

Analytics Engine dataset: `herorank_events` (binding `ANALYTICS` trong wrangler.jsonc).

Query qua Cloudflare GraphQL API hoặc Dashboard:

```
Dashboard → Analytics → Analytics Engine → herorank_events
```

### Queries mẫu

**Requests theo tool (24h qua):**
```sql
SELECT blob2 AS tool, COUNT() AS requests
FROM herorank_events
WHERE timestamp > NOW() - INTERVAL '1' DAY
  AND blob1 = 'request'
GROUP BY tool
ORDER BY requests DESC
```

**Error rate theo path:**
```sql
SELECT blob3 AS path, COUNT() AS errors
FROM herorank_events
WHERE timestamp > NOW() - INTERVAL '1' HOUR
  AND blob1 IN ('job_failed', 'dlq', 'unhandled_error')
GROUP BY path
ORDER BY errors DESC
```

**Credits consumed (theo user, 24h):**
```sql
SELECT blob2 AS user_id, SUM(double1) AS credits_spent
FROM herorank_events
WHERE timestamp > NOW() - INTERVAL '1' DAY
  AND double1 < 0
GROUP BY user_id
```

> Mapping blobs/doubles: `blob1=event`, `blob2=tool/user_id` (tùy context), `blob3=path`,
> `double1=credits_delta`, `double2=latency_ms`, `double3=status`.
> Xem `observability/log.ts` để biết mapping chính xác khi INFRA-EDGE implement.

---

## 4. Etsy API quota monitoring (O4)

Counter daily được persist trong D1 (`etsy_api_usage` table, migration 0003):

```sql
-- Quota hôm nay
SELECT day, count FROM etsy_api_usage WHERE day = date('now');
```

Ngưỡng alert: **80% của ETSY_DAILY_CAP** (default 8000 → alert ở 6400 calls/ngày).

**Cách monitor:**
```bash
# Check quota hôm nay
wrangler d1 execute herorank --remote \
  --command "SELECT day, count FROM etsy_api_usage WHERE day = date('now');"
```

**Alert khi gần trần (O4):** khi `count >= 0.8 * ETSY_DAILY_CAP`, `logError` emit event `etsy_quota`
với `level: 'warn'`. Workers Logs sẽ ghi nhận. Nếu cần alert proactive: setup Cloudflare
Notifications (Workers Logs → alert rule on pattern `etsy_quota`) hoặc query Analytics Engine định kỳ.

---

## 5. Cron + Queue monitoring (O3)

### Cron jobs

Mỗi cron branch log khi xong:
```ts
logEvent('info', {
  event: 'cron',
  tool: 'rank-track',       // hoặc 'taxonomy-refresh', 'trends-refresh', etc.
  status: 0,                // 0 = success
  latency_ms: duration,
  items_processed: n,
}, env.ANALYTICS);
```

Verify cron chạy:
```bash
# Stream logs và trigger cron thủ công
wrangler tail herorank &
wrangler triggers run herorank --cron "0 1 * * 0"  # taxonomy refresh
```

### Queue consumer

Mỗi message xử lý xong emit `event: 'job'` (success) hoặc `event: 'job_failed'` (fail trước DLQ).

### DLQ alert (R3)

DLQ consumer (`herorank-analysis-dlq`) emit `logError` với `event: 'dlq'` khi nhận message.
Job state chuyển sang `failed` trong D1 `analyses` table → user thấy "failed" thay vì stuck "running".

Monitor DLQ:
```bash
# Xem log DLQ gần đây
wrangler tail herorank --search "\"event\":\"dlq\""

# Count DLQ events trong Analytics Engine
# SELECT COUNT() FROM herorank_events WHERE blob1 = 'dlq' AND timestamp > NOW() - INTERVAL '1' DAY
```

**Setup Cloudflare Queue alert** (nếu muốn push notification):
```
Dashboard → Queues → herorank-analysis-dlq → Configure → (chưa có built-in alert UI)
→ Workaround: dùng wrangler tail filter + external alerting (PagerDuty, Slack webhook via Tail Worker)
```

---

## 6. Checklist observability sau deploy

```
[ ] wrangler tail herorank → logs chạy được
[ ] ANALYTICS binding hoạt động → Analytics Engine có data
[ ] Trigger 1 LLM tool → xem log request_id + credits_delta trong Workers Logs
[ ] Trigger cron thủ công → xem event: 'cron' trong logs
[ ] Force job fail → xem DLQ consumer mark job 'failed' + event: 'dlq'
[ ] Query etsy_api_usage → count tăng đúng
[ ] Verify không có PII (email/token) trong logs
```
