# Engineer DOCS — Phase 5 Report (Task #27)

> Technical Writer, 2026-06-13. Branch `migrate-sveltekit`.

---

## Docs đã viết

| File | Mô tả |
|---|---|
| `docs/deployment.md` | L1 deploy checklist + L5 env vars + L3 rollback + L4 backup + Stripe setup + Soft beta |
| `docs/observability.md` | Cloudflare native stack: log schema, Workers Logs, Analytics Engine queries, quota alert, DLQ monitoring |
| `docs/backend-architecture.md` | Cập nhật tech-debt #1–5 Phase 5 status (DONE/KEEP/ACTION REQUIRED) + trỏ deployment.md |

---

## Env / Binding checklist tóm tắt

### Bindings (wrangler.jsonc — cần real IDs)

| Binding | Hiện trạng | Action |
|---|---|---|
| `DB` (D1) | `database_id: "00000000..."` — placeholder | `wrangler d1 create herorank` → điền UUID thật |
| `KV` | `id: "000000..."` — placeholder | `wrangler kv namespace create KV` → điền ID thật |
| `ANALYTICS` | **Chưa có trong wrangler.jsonc** | Thêm `analytics_engine_datasets` binding (xem deployment.md Bước 6) |
| `ANALYSIS_QUEUE` | Đã có trong wrangler.jsonc (producers) | Tạo queue `herorank-analysis` trên Cloudflare |
| DLQ consumer | Đã có trong wrangler.jsonc (Phase 5 R3) | Tạo queue `herorank-analysis-dlq` trên Cloudflare |

### Secrets (wrangler secret put) — BLOCKED-ON-USER

| Secret | Status |
|---|---|
| `BETTER_AUTH_SECRET` | Tự sinh: `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | Blocked — cần Stripe account production |
| `STRIPE_WEBHOOK_SECRET` | Blocked — cần tạo webhook endpoint Stripe |
| `LLM_API_KEY` | Blocked — cần account gateway vtoken.viemind.ai |
| `OAUTH_TOKEN_KEY` | Tự sinh: `openssl rand -base64 32` |
| `ETSY_API_KEY` / `ETSY_API_SECRET` | Blocked — cần Etsy developer app duyệt |
| `ETSY_OAUTH_CLIENT_ID` / `ETSY_OAUTH_CLIENT_SECRET` | Blocked — cần Etsy key (soft beta: bỏ qua) |

### Plain vars (wrangler.jsonc [vars]) — cần điền

| Var | Blocked-on |
|---|---|
| `BETTER_AUTH_URL` | Tên domain production |
| `LLM_MODEL` | Model name từ gateway owner |
| 6 `STRIPE_PRICE_*` | Tạo Stripe products + prices |
| `ETSY_OAUTH_REDIRECT_URI` | Domain production (có thể set ngay khi có domain) |

---

## Còn thiếu — cần user cung cấp khi deploy

### Cần có trước deploy production

1. **Cloudflare account** — chưa có (placeholder IDs trong wrangler.jsonc)
2. **Custom domain** — chưa có
3. **Stripe account production** — chưa có live keys + price IDs
4. **Gateway vtoken.viemind.ai API key** — cần liên hệ owner
5. **LLM model name** — cần xác nhận với gateway owner

### Soft beta có thể bỏ qua (optional)

6. **Etsy developer app** — bỏ qua cho soft beta (mock provider). Cần khi swap sang data thật.
7. **Etsy OAuth credentials** — bỏ qua cho soft beta.

### Chưa implement — cần engineer

8. **Invite/whitelist mechanism** (nếu muốn closed beta thực sự) — chưa có code, chỉ ghi chú trong deployment.md.
9. **ANALYTICS binding** chưa có trong wrangler.jsonc — cần thêm 3 dòng (deployment.md Bước 6). INFRA-EDGE/INFRA-JOBS cần binding này để Analytics Engine sink hoạt động.
10. **`wrangler.jsonc [vars]` section** chưa có — cần thêm block `"vars": {...}` với BETTER_AUTH_URL, LLM_*, ETSY_*, STRIPE_PRICE_*, RATE_LIMIT_* trước deploy.

---

## Self-Review findings

- `env.ts`: đọc trực tiếp file, liệt kê đúng 100% keys (DB, KV, ANALYTICS, ASSETS, BETTER_AUTH_SECRET, BETTER_AUTH_URL, STRIPE_*, LLM_*, ETSY_*, ANALYSIS_QUEUE, ETSY_OAUTH_*, OAUTH_TOKEN_KEY, RATE_LIMIT_*) — OK
- `wrangler.jsonc`: bindings đúng (DB, KV, ANALYSIS_QUEUE, crons, DLQ consumer Phase 5) — OK; ANALYTICS chưa có — ghi chú đầy đủ
- Migrations 0001–0004: liệt kê đúng tên tables, thứ tự apply — OK
- Wrangler CLI syntax 2026: `wrangler d1 create/execute/export/time-travel`, `wrangler kv namespace create`, `wrangler queues create`, `wrangler secret put`, `wrangler rollback`, `wrangler deployments list`, `wrangler tail` — verified với wrangler docs
- Tech-debt #1–5: trạng thái DONE/KEEP/ACTION REQUIRED ghi đúng theo spec + PM decisions — OK
- logEvent/logError schema: lấy trực tiếp từ 02_contract_edge.md §1 — OK, không bịa
- Stripe price IDs: 6 IDs (side/business/enterprise × monthly/yearly) khớp env.ts — OK
- Không chạm code (chỉ docs/) — OK

## Skills read

- Không có SKILL-ROUTING.md tại `/home/admin/huanspace/.claude/skills/SKILL-ROUTING.md` (file does not exist)
- Đọc tất cả source files theo task: 01_ba_spec.md, 00_pm_decisions.md, backend-architecture.md, etsy-data-strategy.md, wrangler.jsonc, env.ts, .env.example, migrations/0001–0004, 02_contract_edge.md

## Concerns / risks

- **ANALYTICS binding thiếu trong wrangler.jsonc** — INFRA-EDGE contract §6 ghi rõ "Action for whoever owns wrangler.jsonc (NOT INFRA-EDGE)". Cần INFRA-JOBS hoặc engineer L1 thêm vào. Deployment.md ghi hướng dẫn cụ thể.
- **`wrangler.jsonc [vars]` section chưa tồn tại** — hiện tại file không có block `vars`. Cần thêm trước deploy để plain vars (LLM_MODEL, BETTER_AUTH_URL, price IDs...) có hiệu lực. Deployment.md có snippet đầy đủ.
- **Invite/whitelist beta**: nếu PM muốn closed beta thực sự (không phải chỉ rate-limit), cần engineer implement — chưa có code.
- **`OAUTH_TOKEN_KEY` rotation risk**: ghi rõ trong deployment.md. Key này cần lưu cẩn thận vì rotate = mọi connected shop cần reconnect.
- **D1 Time Travel syntax**: lệnh `--timestamp` với `date -d` (GNU date) có thể không chạy trên macOS (dùng `gdate` hoặc thay bằng timestamp cố định). Ghi chú trong deployment.md.
