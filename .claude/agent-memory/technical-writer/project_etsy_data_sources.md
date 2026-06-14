---
name: etsy-data-sources-research
description: Findings về nguồn dữ liệu Etsy ngoài API chính thống cho SaaS Etsy SEO tools — DataDome, Enterprise tier, sales estimation methods
metadata:
  type: project
---

Etsy không expose search volume qua bất kỳ API nào (Etsy team confirm trên GitHub). Tất cả "search volume" trong tools như eRank, Sale Samurai, Marmalead đều là ước lượng từ indirect signals (autocomplete frequency, listing count, views/favorites correlation).

**Why:** Quan trọng để không xây dựng feature marketing sai — tránh nói "real Etsy search volume" nếu dùng ước lượng.

**How to apply:** Khi viết docs/copy cho Etsy SEO SaaS, dùng ngôn ngữ "estimated search demand" thay vì "search volume" nếu không có data thực từ Etsy backend.

Key facts (2025–2026):
- Etsy dùng **DataDome** (xác nhận từ DataDome case study). Chi phí scraping thực tế cao hơn 3–10×.
- Etsy **Enterprise API Tier**: threshold 1M calls/ngày, giá max(15% revenue, $2/10K calls). eRank bị tác động tháng 8/2025.
- EverBee model: Etsy Official API OAuth + ML algorithm ước lượng từ views/favorites/listing age. ~80% accuracy (unaudited).
- DataForSEO và SerpApi **không có Etsy** — chỉ Google/Amazon/Bing.
- Firecrawl có guide scrape Etsy nhưng DataDome = 5× credit cost khi cần enhanced proxy.
- Oxylabs có dedicated Etsy endpoint: $0.40–$0.50/1K results, 29 fields (no sales data).

[[etsy-tos-risk]]
