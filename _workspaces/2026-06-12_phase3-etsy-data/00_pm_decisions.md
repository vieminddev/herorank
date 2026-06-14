# PM Decisions — Phase 2 + Phase 3 (chốt 2026-06-12)

## Phase 2 (LLM tools)
- Q1: LLM client = fetch thuần, không SDK openai
- Q2: chat streaming deduct credits SAU `[DONE]` (manual qua creditsService trong route, không dùng requireCredits cho SSE); mid-stream error = không trừ
- Q3: costs — title/tag/keyword=1, description=2, chat=2
- Q4: credits badge update bằng `invalidateAll()` phía FE — không sửa Header.svelte
- Q5: chat render bold-only: escape HTML trước, apply `**`→`<strong>` sau (file src/lib/sanitize.ts + test)
- Q6: Engineer C-role mount router vào routes/tools.ts
- Q7: env.ts thêm LLM_MODEL — giao Engineer D (kiêm thêm các key ETSY_* cho Phase 3, sửa 1 lần)

## Phase 3 (Etsy data)
- Q1 (USER): đơn Etsy commercial API ĐÃ NỘP, đang chờ duyệt → dev toàn bộ bằng mock EtsyClient + fixtures; cắm ETSY_API_KEY là chạy
- Q3: DEFER Google Trends — demandScore chỉ dùng review-velocity + favorites + result count
- Q7: BỎ field không có thật (listing views, shop percentile) — không bịa số
- Q9: đổi copy "Monthly Searches" → "Demand Index (est.)"
- Q11 (USER): tool đọc-cache (best-sellers, etsy-trends) = 1 credit; tool gọi API trực tiếp giữ theo spec
- Q14: quota cap 8000 calls/ngày tổng, cron sub-cap 2000

## Thực thi
2 phase chạy song song — Wave 1: D (LLM backend + env), F (Etsy backend + wrangler), E1 (FE Phase 2). Wave 2: G (estimation), E2 (FE Phase 3), C' (toolCosts + mount 2 routers). Wave 3: QA cả 2 phase.
