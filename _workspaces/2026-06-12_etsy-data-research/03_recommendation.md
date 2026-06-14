# Đề xuất nguồn dữ liệu Etsy — tối ưu chi phí, giữ đủ tính năng

Ngày: 2026-06-12 · Tổng hợp từ 01_etsy_api_v3.md + 02_alternatives.md

## Phát hiện nền tảng

1. **Không ai có search volume thật của Etsy** — Etsy xác nhận không có API này. Mọi đối thủ (eRank, Sale Samurai, Marmalead) đều ƯỚC LƯỢNG. → Mình cũng ước lượng là hợp chuẩn ngành, không phải "kém hơn".
2. Etsy API v3: miễn phí, 10k req/ngày, có listing/shop/reviews/search/taxonomy public; KHÔNG có volume/sales/trends/best-seller/buyer. Duyệt commercial cho SEO tool có rủi ro (case Optimsy bị từ chối vì AI/ML use).
3. etsy.com chống bot bằng DataDome → scraping trực tiếp đắt (3-10× site thường) và vi phạm ToS.
4. Enterprise tier (>1M calls/ngày): max(15% revenue, $2/10k calls) — rủi ro khi scale, cần thiết kế cache từ đầu.

## Kiến trúc dữ liệu 4 lớp (chi phí MVP ~$0-50/tháng)

- **Lớp 1 — Etsy API v3 (FREE):** listing-analyzer, shop-analyzer, competition count, dữ liệu thô cho estimation. Đăng ký personal trước, nộp commercial sớm, KHÔNG nhắc AI/ML trong đơn.
- **Lớp 2 — Estimation engine (FREE, chạy trên data lớp 1):**
  - Demand score = Etsy autocomplete signals + Google Trends + (tùy chọn) Google volume
  - Sales estimate = review velocity × hệ số category (chuẩn ngành de facto — EverBee/Alura làm vậy)
  - Best-sellers = top review-velocity trong category · Trends = delta demand score theo tuần
  - Rank-check = findAllListingsActive sort=score (ghi rõ "estimated position")
- **Lớp 3 — Shared cache (D1/KV):** keyword TTL 7-30d, listing 24h, trends 7d. Cache dùng chung mọi user → chi phí cận biên/user → 0, đồng thời giữ usage dưới trần 10k/ngày và xa trần 1M enterprise.
- **Lớp 4 — OAuth user-connected shops (EverBee model):** seller connect shop → data thật (transactions own-shop, hợp pháp 100%) → calibrate hệ số estimation → data moat + network effect.

## Per-feature

| Feature | Nguồn | Chi phí |
|---|---|---|
| keyword/tag/title/desc gen | LLM (vtoken gateway) + lớp 2 | token LLM |
| listing-analyzer | API v3 đủ | $0 |
| shop-analyzer | API v3 + estimation | $0 |
| rank-check | API score sort (estimated) | $0 |
| niche-finder | count + demand score | $0 |
| best-sellers | review-velocity ranking | $0 |
| etsy-trends | demand delta + cron tuần | $0 |
| buyer-check | ⚠️ redefine → "review/shop reputation check" (buyer data không tồn tại ở mọi nguồn) | $0 |
| profit-calculator | client-side | $0 |

## Không khuyến nghị

- Scraping etsy.com diện rộng (DataDome + ToS + đắt: Oxylabs $99+, Bright Data $499+)
- DataForSEO/SerpApi (không hỗ trợ Etsy)
- Mua RapidAPI unofficial Etsy API (độ tin cậy thấp, vẫn là scraping hộ)

## Nâng cấp sau khi có doanh thu

Paid tier "verified rank check": SERP scrape chọn lọc qua Apify (~$3/1k) CHỈ cho user trả phí, cache 24h, quarantine thành service riêng (rủi ro pháp lý tách khỏi core).
