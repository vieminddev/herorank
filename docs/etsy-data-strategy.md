# Etsy Data Strategy

> Chốt ngày 2026-06-12 (ADR). Nghiên cứu gốc có dẫn nguồn: `_workspaces/2026-06-12_etsy-data-research/01_etsy_api_v3.md`, `02_alternatives.md`

## Bối cảnh — 4 sự thật từ research

1. **Không tồn tại Etsy search volume thật.** Etsy xác nhận không có API. Mọi đối thủ (eRank, Sale Samurai, Marmalead, EverBee) đều ước lượng bằng thuật toán → ước lượng là chuẩn ngành.
2. **Etsy API v3** miễn phí (10.000 req/ngày, 10 QPS), có: search listings, listing/shop public, reviews, taxonomy. Không có: volume, sales cross-shop, trending, best-seller, buyer data. Enterprise tier (>1M calls/ngày) thu max(15% revenue, $2/10k calls).
3. **etsy.com chống bot bằng DataDome** — scrape trực tiếp đắt gấp 3–10× và vi phạm ToS. Dịch vụ scrape Etsy: $99–499/tháng.
4. **Etsy từng từ chối duyệt commercial app cho SEO tool dùng AI/ML** (case Optimsy). Khi nộp đơn: mô tả use-case là "shop management/listing optimization helper", KHÔNG nhắc AI/ML/analytics diện rộng.

## Quyết định: kiến trúc dữ liệu 4 lớp

| Lớp | Nguồn | Chi phí | Dùng cho |
|---|---|---|---|
| 1 | **Etsy API v3 chính thống** | $0 | listing-analyzer, shop-analyzer, competition count, data thô cho lớp 2 |
| 2 | **Estimation engine** (chạy trên data lớp 1) | $0 | demand score (autocomplete + Google Trends), sales estimate (review velocity × hệ số category), best-sellers (top review-velocity), trends (delta demand/tuần), rank-check (`sort=score`, nhãn "estimated") |
| 3 | **Shared cache** D1/KV — keyword TTL 7–30d, listing 24h, trends 7d, dùng chung mọi user | $0 | chi phí cận biên/user → 0; giữ usage dưới rate limit và xa trần enterprise |
| 4 | **OAuth connected shops** — seller kết nối shop, lấy sales thật own-shop (hợp pháp) | $0 | calibrate hệ số estimation → data moat, càng nhiều user càng chính xác (mô hình EverBee) |

**Tổng chi phí data MVP: $0/tháng** (chỉ trả LLM tokens qua gateway).

## Mapping per-feature

| Feature | Nguồn | Ghi chú |
|---|---|---|
| title/description/tag/keyword generator, RankHero AI | LLM gateway + lớp 2 | |
| listing-analyzer | Lớp 1 | đủ qua API |
| shop-analyzer | Lớp 1 + 2 | sales là estimate |
| rank-check | Lớp 2 | "estimated position", upgrade path bên dưới |
| niche-finder | Lớp 2 | competition = result count, demand = demand score |
| best-sellers | Lớp 2 | review-velocity ranking |
| etsy-trends | Lớp 2 + cron tuần | |
| **buyer-check** | **REDEFINED** → "shop/review reputation check" | buyer data không tồn tại ở mọi nguồn; phân tích reviews qua API. UI giữ gần nguyên |
| profit-calculator | client-side | không cần BE |
| video-generator | dịch vụ render ngoài | phase cuối |

## Không làm

- ❌ Scraping etsy.com diện rộng (DataDome + ToS + $99–499/tháng)
- ❌ DataForSEO / SerpApi (không hỗ trợ Etsy)
- ❌ RapidAPI unofficial Etsy APIs (độ tin cậy thấp, vẫn là scraping hộ + rủi ro đứt nguồn)

## Upgrade path (sau khi có doanh thu)

**"Verified rank check"** cho gói trả phí cao: scrape SERP chọn lọc qua Apify (~$3/1k checks), cache 24h, quarantine thành service riêng để tách rủi ro ToS khỏi core product. Chỉ bật khi đã có legal review.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Etsy từ chối duyệt commercial app | Bắt đầu bằng personal tier khi dev; wording đơn cẩn thận; lớp 4 (OAuth own-shop) là use-case Etsy chấp nhận |
| Chạm rate limit 10k/ngày khi user tăng | Lớp 3 cache aggressive; xin nâng limit khi có usage thật |
| Enterprise tier 15% revenue khi scale lớn | Thiết kế cache-first từ đầu; theo dõi calls/ngày trong dashboard |
| Độ chính xác estimation bị chê | Nhãn "estimated" minh bạch; lớp 4 calibrate dần |
