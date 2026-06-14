# Etsy Data Sources Ngoài API Chính Thống: Research Report

*Generated: 2026-06-12 | Sources: 30+ | Confidence: Medium–High*
*Tác giả: Technical Writer Agent*

---

## Executive Summary

Không có "search volume API chính thống" nào của Etsy cho bên thứ ba. Tất cả các công cụ SEO Etsy đều sử dụng một hoặc nhiều trong các nguồn sau: (1) Etsy Official API (có tính phí Enterprise với khối lượng lớn), (2) scraping HTML qua proxy, (3) browser extension thu thập dữ liệu từ user, (4) thuật toán ước lượng từ tín hiệu gián tiếp. Etsy dùng **DataDome** làm anti-bot — đây là rào cản kỹ thuật quan trọng nhất. Etsy ToS cấm rõ ràng scraping và browser extension thu thập dữ liệu analytics.

---

## 1. Các Đối Thủ Làm Thế Nào

### 1.1 eRank

- **Data source**: Etsy Official API v3 + scraping nhiều marketplace (Amazon, eBay)
- **Tình trạng 2025**: Tháng 8/2025, eRank **buộc phải xóa gói Basic** do Etsy ra Enterprise Tier pricing mới — chứng tỏ eRank đã hoặc đang tiến gần ngưỡng 1M API calls/ngày
- **Keyword volume**: "Estimated" — không phải dữ liệu thực từ Etsy backend. eRank tự thừa nhận là ước lượng.
- **Giá**: Free / $5.99 / $9.99 / $29.99/tháng
- **Nguồn**: [eRank Plans](https://erank.com/plans), [eRank Help - Connect Shop](https://help.erank.com/blog/how-do-i-connect-my-etsy-shop-to-erank/)

### 1.2 EverBee

- **Data source**: Etsy Official API (read-only, kết nối qua OAuth) + thuật toán ML ước lượng sales
- **Cơ chế browser extension**: Extension hiện overlay trực tiếp trên trang Etsy search, hiển thị "Monthly Revenue" và "Total Sales" dưới mỗi listing. Nó kéo dữ liệu qua Etsy API (views, favorites, listing age, category) rồi dùng proprietary algorithm để tính estimated revenue.
- **Mô hình "crowdsourced"**: EverBee yêu cầu user **connect Etsy shop** — điều này có thể cho phép thu thập aggregated signals từ nhiều shop, nhưng EverBee không công khai cơ chế này. Khả năng cao là dùng views/favorites/reviews từ public API kết hợp với data từ các shop đã connect.
- **Độ chính xác sales estimate**: ~80–90% theo lời EverBee, nhưng không có third-party audit độc lập. Không tool nào có access backend sales thực sự.
- **Database**: 170M+ listings, 50M+ keywords
- **Giá**: Free (10 searches/tháng) / Growth $29/tháng / Business $99/tháng
- **Nguồn**: [EverBee Product Analytics](https://everbee.io/product-analytics/), [Chrome Web Store](https://chromewebstore.google.com/detail/everbee/oeicpkgdngoghobnbjngekclpcmpgpij), [EverBee Review - Traksource](https://traksource.com/everbee-review/)

> **Điểm quan trọng**: EverBee tuyên bố "connects to the official Etsy API to estimate monthly revenue" — đây là **ước lượng từ public signals**, không phải sales data thực. Etsy không expose sales figures qua API.

### 1.3 Alura

- **Data source**: Etsy Official API — verified Etsy App (848,000+ active users, "Verified Etsy App Status")
- **Sales estimate method**: "Sales numbers are estimates based on listing information from Etsy's API such as number of views, favorites, category, when the listing was created, and more"
- **Chrome extension**: Tích hợp vào Etsy workflow, access 60M+ listings
- **Giá**: Xem tại [Alura Pricing](https://www.alura.io/pricing) — không public rõ ràng trong search results
- **Nguồn**: [Alura.io](https://www.alura.io/), [Alura Etsy Integrations](https://www.alura.io/docs/article/optimizing-your-shop-with-etsy-integrations)

### 1.4 Sale Samurai

- **Data source**: Etsy Official API (disclaimer: "uses Etsy API but not endorsed by Etsy")
- **Search volume claim**: Marketing gọi là "Real Etsy Search Volume" nhưng không giải thích methodology. Etsy **không expose search volume qua API** (xác nhận bởi Etsy team trong [GitHub Discussion #1058](https://github.com/etsy/open-api/discussions/1058)). Khả năng cao là ước lượng từ số lượng search results hoặc autocomplete frequency.
- **Giá**: $9.99/tháng hoặc $99.99/năm
- **Nguồn**: [Sale Samurai](https://salesamurai.io/etsy-search-volume/), [Gold City Ventures Review](https://goldcityventures.com/sale-samurai-overview/)

### 1.5 Marmalead

- **Data source**: Etsy Official API — marketing tuyên bố "real Etsy search behavior", "genuine Etsy search volume"
- **Tiếp cận**: Focus vào trend-based insights, MarmaMeters, keyword forecasting 30 ngày
- **Lưu ý**: Không có browser extension. Không có direct sales estimates cho listing của người khác — chỉ focus keyword analytics.
- **Giá**: $19/tháng | $190/năm ($15.83/tháng) | $300 lifetime
- **Nguồn**: [Marmalead Pricing](https://marmalead.com/pricing/), [Marmalead Review - CraftyTrendy](https://craftytrendy.com/blog/marmalead-review/)

### Tổng kết: Nguồn "search volume" của các tool

> **Sự thật được xác nhận**: Etsy team trả lời trên GitHub rằng "There isn't an API for what you are looking for" khi developer hỏi về keyword search volume endpoint. Tất cả các con số "search volume" hiện tại đều là **ước lượng** — không tool nào có dữ liệu thực từ Etsy backend.

Các phương pháp ước lượng được dùng:
1. Autocomplete frequency (tần suất xuất hiện trong suggest)
2. Listing competition count (số kết quả search)
3. View/favorites/reviews correlation với sales
4. Aggregated signals từ user-connected shops

---

## 2. Scraping Qua Dịch Vụ Bên Thứ 3

### 2.1 Apify — Etsy Actors

Có **nhiều Etsy actor** trên Apify Store:

| Actor | Data | Pricing model | Cost/1K results |
|-------|------|---------------|-----------------|
| `automation-lab/etsy-scraper` | Listings, prices, reviews (20 fields) | Pay-per-event | $3.00 (Free tier) → $1.20 (Diamond) |
| `parseforge/etsy-scraper` | Shop profiles, sales metrics, 30 fields | Pay-per-event | Không public rõ |
| `bovi/etsy-listings` | "via Official API" — listings, prices, tags | Per run | Không public rõ |
| `glassventures/etsy-shop-scraper` | Shop data | Per run | Không public rõ |

**Lưu ý quan trọng về automation-lab actor**:
- Fee: $0.005/run + $0.003/product (Free tier) đến $0.0012/product (Diamond tier)
- 1,000 products = ~$3.00 (free) → $1.20 (top tier)
- 10,000 search-result pages/tháng (giả sử 64 results/page = 640,000 listings): ~$1,920 (free tier) → ~$768 (Diamond tier)
- **Không có sales metrics** trong các standard actors — chỉ có review count + bestseller badge làm proxy

**Apify platform pricing** (nền tảng):
- Free: $5 credits/tháng
- Starter: ~$49/tháng
- Scale: ~$499/tháng

**Nguồn**: [Apify - automation-lab/etsy-scraper](https://apify.com/automation-lab/etsy-scraper), [Apify Pricing](https://apify.com/pricing)

### 2.2 Firecrawl

- **Etsy support**: Có trang [official guide scraping Etsy](https://docs.firecrawl.dev/developer-guides/common-sites/etsy) — có thể scrape product listings, shop info, reviews, trending items
- **Cảnh báo**: Firecrawl document không đề cập DataDome handling cụ thể cho Etsy. Enhanced proxy (cần cho DataDome) = 5 credits/page thay vì 1 credit/page
- **Pricing**:

| Plan | Giá/tháng (annual) | Credits/tháng | Cost/1K pages (basic) | Cost/1K pages (enhanced) |
|------|--------------------|---------------|----------------------|--------------------------|
| Free | $0 | 1,000 | Free | N/A |
| Hobby | $16 | 5,000 | $3.20 | $16.00 |
| Standard | $83 | 100,000 | $0.83 | $4.15 |
| Growth | $333 | 500,000 | $0.67 | $3.33 |
| Scale | $599 | 1,000,000 | $0.60 | $2.99 |

- **10K pages/tháng ước tính**: Standard plan $83/tháng đủ dùng nếu không cần enhanced proxy. Nếu cần enhanced (DataDome): ~$41.50 chỉ cho Etsy pages trong gói Standard.
- **Nguồn**: [Firecrawl Pricing](https://www.firecrawl.dev/pricing), [Firecrawl Etsy Guide](https://docs.firecrawl.dev/developer-guides/common-sites/etsy)

### 2.3 Oxylabs — Etsy Scraper API

- **Có dedicated Etsy endpoint**: `oxylabs.io/products/scraper-api/ecommerce/etsy`
- **Data fields**: 29 fields — product pricing, title, images, seller info (name, URL, rating, star seller status), reviews, stock, categories
- **Anti-bot**: Pool 177M+ proxies, IP block + CAPTCHA handling tích hợp sẵn
- **Pricing**:

| Plan | Giá/tháng | Cost/1K results (basic) | Cost/1K results (JS rendering) |
|------|-----------|------------------------|-------------------------------|
| Micro | $49 | $0.50 | — |
| Starter | $99 | $0.45 | — |
| Advanced | $249 | $0.40 | — |
| Other (no JS) | — | $1.15 | — |
| With JS | — | — | $1.35 |

- **10K pages ước tính**: Starter plan $99 + usage → cần xác nhận quota. Với $0.45/1K × 10K pages = ~$4.50 trong plan.
- **Free trial**: 2,000 results miễn phí
- **Nguồn**: [Oxylabs Etsy Scraper](https://oxylabs.io/products/scraper-api/ecommerce/etsy)

### 2.4 ScraperAPI

- **Pricing**:
  - Hobby: $49/tháng → 100,000 credits
  - Startup: $149/tháng → 1M credits
  - Credits/request: 1 credit (basic HTML) → 5-10 credits (JS rendering) → 25 credits (premium domains như Amazon, Google)
  - Etsy có thể rơi vào tier "premium" tùy cấu hình
- **10K JS-rendered pages**: ~50,000–100,000 credits = Startup plan $149/tháng
- **Nguồn**: [ScraperAPI Pricing](https://www.scraperapi.com/pricing/)

### 2.5 Bright Data

- **Web Scraper API**: $1.50/1K records (pay-as-you-go) → $1.30/1K (Growth $499/mo) → $1.00/1K (Business $999/mo)
- **Residential proxies**: ~$6.90–$8/GB (mobile), cheaper for datacenter
- **10K pages ước tính**: $15 records cost + $499/mo plan minimum nếu dùng managed scraper
- **Nguồn**: [Bright Data Web Scraper Pricing](https://brightdata.com/pricing/web-scraper)

### 2.6 Zyte API

- **Pricing per 1K requests**:
  - HTTP (simple): $0.13–$1.27 (tùy tier)
  - Browser-rendered: $1.01–$16.08
  - Commitment plans: $100–$1000+/tháng với giảm giá
- **10K browser-rendered pages**: ~$10.10 base + minimum commit $100/tháng
- **Nguồn**: [Zyte API Pricing Docs](https://docs.zyte.com/zyte-api/pricing.html)

### Bảng chi phí scrape 10,000 search-result pages/tháng

| Dịch vụ | Chi phí ước tính/tháng | Ghi chú |
|---------|----------------------|---------|
| Apify (automation-lab actor) | $19–$30 + plan | ~$3/1K products, 10K pages × 64 results = 640K results = ~$768–$1920 |
| Firecrawl Standard | $83 | Đủ 100K credits, không cần enhanced mode |
| Firecrawl Standard (enhanced) | $83 + ~$415 overage | Nếu DataDome yêu cầu enhanced proxy |
| Oxylabs Starter | $99 | 10K pages = $4.50, nằm trong plan |
| ScraperAPI Startup | $149 | Tùy render complexity |
| Zyte (committed) | ~$100 min | ~$10 usage + commitment |
| Bright Data | $499 min | Expensive cho volume nhỏ |

**Khuyến nghị chi phí thấp nhất**: Zyte ($100/tháng) hoặc Oxylabs Starter ($99/tháng) cho 10K pages search results. Nếu DataDome blocking cao, chi phí tăng 5–10×.

---

## 3. Data API Bên Thứ Ba Bán Dữ Liệu Etsy

### 3.1 DataForSEO

- **Có Etsy không?**: **KHÔNG**. DataForSEO chỉ có Amazon Merchant API và Google Shopping Merchant API. Không có Etsy endpoint.
- **Có thể dùng gián tiếp**: SERP API cho Google Shopping ($0.0006–$0.002/query) để track Etsy listings xuất hiện trên Google Shopping
- **Nguồn**: [DataForSEO Pricing List](https://dataforseo.com/pricing-list)

### 3.2 SerpApi

- **Có Etsy engine không?**: **KHÔNG thấy trong results**. SerpApi hỗ trợ 80+ engines (Google, Bing, Baidu, Yandex, Amazon...) nhưng không có Etsy-specific engine
- **Pricing**: $75/tháng cho 5,000 searches ($10/1K) — khá đắt
- **Nguồn**: [SerpApi Pricing](https://serpapi.com/pricing)

### 3.3 RapidAPI Marketplace

- **Có các unofficial Etsy API**:
  - `airscarp/etsy-scraper` — có trên RapidAPI nhưng pricing không public qua fetch
  - `nguoithomo2030/etsy-product` — "cached and realtime data"
- **Đánh giá**: Các unofficial API trên RapidAPI thường không stable, provider có thể biến mất, không SLA. Không khuyến nghị cho production.
- **Nguồn**: [RapidAPI Etsy Scraper](https://rapidapi.com/airscarp-airscarp-default/api/etsy-scraper), [RapidAPI Etsy Product](https://rapidapi.com/nguoithomo2030-rllPRPCwI0v/api/etsy-product/pricing)

### 3.4 Keywords Everywhere

- **Etsy "search volume"**: Hiển thị **Google Keyword Planner data** (không phải Etsy data) dưới Etsy search bar. Công ty tự thừa nhận: "no tool has genuine Etsy search-volume data, including this one"
- **Dùng autocomplete**: Etsy autosuggest API để generate long-tail keywords, sau đó sort theo Google volume
- **Giá**: Credit-based, 100,000 credits = $10
- **Nguồn**: [Keywords Everywhere Etsy Tool](https://keywordseverywhere.com/etsy-search-volume.html)

### 3.5 Keyword Tool (keywordtool.io)

- **Có Etsy API**: Trang `docs.keywordtool.io/reference/keyword-suggestions-etsy` và `docs.keywordtool.io/reference/search-volume-etsy` — provide estimated search volume
- **Cơ chế**: Kéo từ Etsy autocomplete/suggest endpoint
- **Giá**: Cần xem trang pricing riêng — có free tier với giới hạn

---

## 4. Kỹ Thuật Ước Lượng Rẻ

### 4.1 Etsy Autocomplete Endpoint

- **Tồn tại không?**: Có — Etsy có internal suggest endpoint được nhiều tools dùng (Keywords Everywhere, Keyword Tool đều sử dụng)
- **Có public/free không?**: Etsy không document endpoint này trong Open API v3. Các tool dùng nó theo cách reverse-engineer từ browser traffic.
- **URL pattern**: Không được document chính thức. ScrapFly guide và các tool như Keywords Everywhere dùng endpoint tương tự `www.etsy.com/api/v3/ajax/bespoke/member/listings/search-suggestions` hoặc tương tự — cần tự reverse-engineer từ browser DevTools.
- **Rủi ro**: Endpoint có thể thay đổi, bị block, hoặc rate-limited. DataDome có thể detect automation.
- **Khả thi**: Có — nhiều tool đang làm. Chi phí: gần như miễn phí nếu chạy chậm với residential proxy rotation.

### 4.2 Đếm Search Results Làm Proxy Competition

- **Hoạt động**: Mọi tool đang làm điều này. URL pattern: `www.etsy.com/search?q=<keyword>` → parse số results ("Showing results for X items")
- **Giá trị**: Là proxy cho market saturation — "jewelry" (8M results) vs "custom pet portrait necklace" (1,200 results)
- **Chi phí**: Scrape HTML + đếm số trong response. ~$0.13–$1.35/1K pages với Zyte/Oxylabs
- **Rủi ro**: DataDome block. Scale lớn sẽ bị phát hiện. Cần residential proxy + random delays.

### 4.3 Google Trends / Google Keyword Planner

- **Google Trends**: Miễn phí, API unofficial. Có thể track relative demand cho "etsy + keyword" queries
- **Google Keyword Planner**: Requires Google Ads account. Cho data về external search demand (người tìm Etsy products qua Google), không phải internal Etsy search volume.
- **Keywords Everywhere cách tiếp cận**: Dùng Google data như proxy cho Etsy demand — honest approach nhưng không chính xác 100%
- **Độ chính xác**: Medium. Correlation giữa Google volume và Etsy search volume có thể cao cho nhiều categories, nhưng không 1:1.
- **Chi phí**: Miễn phí (Google Trends API) / $200 minimum ad spend (Google Ads cho Keyword Planner — thực tế free nếu có account)

### 4.4 Views/Favorites/Reviews Correlation (Sales Estimation)

- **Cách làm**: Etsy API public trả về `views`, `num_favorers`, `quantity_sold` (số sold kể từ listing created — đây là **public field!**). Nhiều tools kết hợp những field này với category benchmarks để estimate monthly sales.
- **`quantity_sold` note**: Etsy API có thể trả `num_favorers` và một số engagement metrics. Một số listing public hiển thị "X sales" — có thể scrape từ HTML.
- **Độ chính xác**: 70–90% theo các tool (không ai audit độc lập)
- **Chi phí**: Gần như free nếu dùng Official API + nhân tay với Python

---

## 5. Rủi Ro

### 5.1 Etsy ToS — Scraping

Etsy Terms of Use và API Terms of Use cấm **rõ ràng**:

> "You will not crawl, scrape, or spider any page of the Services or reverse engineering the source code"
> "You will not use or promote automated systems or browser extensions to access, analyze, or scrape the Etsy Site, including listings, shops, or user profiles, unless expressly authorized in writing by Etsy"
> "Collecting Etsy content for purposes of analytics, machine learning, training artificial intelligence models, licensing, or content removal unless expressly authorized"

**Hậu quả**: Breach of contract, API access termination, possible DMCA claims.

**Nguồn**: [Etsy API Terms](https://www.etsy.com/legal/api/), [Etsy Terms of Use](https://www.etsy.com/legal/terms-of-use/)

### 5.2 Etsy Enterprise API Tier — Tác động Thực Tế (2025–2026)

Etsy ra Enterprise Tier với pricing:
- **Trigger threshold**: Apps averaging **1M+ API calls/day**
- **Pricing**: Max(15% của app revenue từ Etsy, $2 per 10K calls)
- **Apps 3M calls/day** = ~$600/ngày = ~$18,000/tháng minimum
- **Thực tế**: eRank bị buộc phải retire gói Basic để kiểm soát API costs. Đây là rủi ro lớn khi scale.

**Nguồn**: [GitHub Discussion #1442](https://github.com/etsy/open-api/discussions/1442), [eRank Plans](https://erank.com/plans)

### 5.3 DataDome Anti-Bot Protection

- **Xác nhận**: Etsy dùng DataDome — từ [DataDome case study về Etsy](https://datadome.co/customers-stories/etsy-stops-unwanted-traffic-reduces-computing-costs-with-datadome-google/)
- **Mức độ bảo vệ**: Cao. DataDome 2025 đã thêm **intent-based detection** — phát hiện behavioral pattern, không chỉ fingerprint
- **DataDome stats**: 85,000+ customer-specific ML models. "Scrapers có thể chiếm ~1% computing costs của Etsy" — Etsy quote
- **Khả năng bypass**: Có thể với residential proxies + behavioral simulation, nhưng:
  - Chi phí tăng 5–10× so với unprotected sites
  - Không guaranteed — DataDome update liên tục
  - LLM crawler detection thêm vào 2025
- **Nguồn**: [ScrapFly - DataDome bypass](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping), [DataDome Etsy case study](https://datadome.co/customers-stories/etsy-stops-unwanted-traffic-reduces-computing-costs-with-datadome-google/)

### 5.4 Legal Precedent — Meta vs Bright Data (2024)

Courts ngày càng xét scraping dựa trên **contractual restrictions** chứ không chỉ public visibility. Meta vs Bright Data 2024: scraping content behind ToS restrictions có thể là breach of contract. Etsy ToS rất rõ ràng → rủi ro pháp lý thực sự.

### 5.5 Vụ Kiện/Enforcement Cụ Thể Với Etsy Tools

Không tìm thấy vụ kiện cụ thể của Etsy vs tool bên thứ 3 trong research này (kết quả DMCA search chỉ về seller copyright, không về scraping tools). Tuy nhiên, Etsy có thể terminate API access mà không cần kiện — đây là rủi ro thực tế hơn.

---

## Bảng So Sánh Tổng Hợp

| Nguồn | Dữ liệu có được | Giá ước tính/tháng | Rủi ro |
|-------|-----------------|-------------------|--------|
| **Etsy Official API (free tier)** | Listing details, shop info, orders (own shop), public listing metadata | $0 (< 1M calls/ngày) | ToS compliance; keyword volume KHÔNG có |
| **Etsy Enterprise API** | Như trên + priority access | $2/10K calls hoặc 15% revenue (whichever higher) | Commitment 1 năm; rất đắt ở scale |
| **Apify Etsy actors** | Listings, prices, reviews, shop profiles (no sales) | $50–200 cho 10K pages | ToS vi phạm; DataDome block risk; không có sales |
| **Firecrawl + Etsy guide** | HTML scrape: listing data, prices, reviews | $83/tháng (Standard, 100K pages) | DataDome = 5× credit cost; ToS risk |
| **Oxylabs Etsy Scraper API** | Listings (29 fields), prices, reviews, shop ratings | $99/tháng (Starter) | ToS risk; no sales/volume data |
| **Bright Data Web Scraper** | Listings, reviews (managed service) | $499/tháng min | Đắt; ToS risk |
| **Zyte API** | HTML/browser render; any Etsy page | $100/tháng commit | DataDome cost multiplier; ToS risk |
| **ScraperAPI** | HTML/JS render | $149/tháng (1M credits) | DataDome xử lý không chắc; ToS risk |
| **DataForSEO** | Google/Amazon/Bing; KHÔNG có Etsy | $50 min (pay-as-go) | N/A — không support Etsy |
| **SerpApi** | Google/Amazon/Bing; KHÔNG có Etsy engine | $75/tháng | N/A — không support Etsy |
| **RapidAPI unofficial Etsy APIs** | Listings, prices (unstable) | $20–100? (varies) | Unstable providers; ToS risk |
| **Keywords Everywhere** | Google-based "proxy" volume cho Etsy keywords | Credit-based, ~$10/100K credits | Không phải real Etsy volume |
| **Keyword Tool (keywordtool.io)** | Autocomplete suggestions, estimated volume | Freemium | Ước lượng, không chính xác |
| **Etsy Autocomplete scrape (DIY)** | Keyword suggestions (50–200/seed keyword) | ~$10–30 (residential proxy) | ToS vi phạm; DataDome detection |
| **Search result count proxy** | Competition level per keyword (listing count) | ~$20–99 (Oxylabs/Zyte) | ToS risk; DataDome |
| **Google Trends** | Relative demand trends (external, not Etsy-internal) | Miễn phí | Không phải Etsy-internal data; rougher proxy |

---

## Key Takeaways

1. **Không có nguồn nào cung cấp "real" Etsy search volume** — đây là sự thật được Etsy team confirm. Tất cả là ước lượng.

2. **EverBee model**: Kết hợp Etsy Official API (public listing data) + proprietary algorithm ước lượng sales từ views/favorites/listing age. Browser extension chỉ là delivery mechanism, không phải data collection method đặc biệt. Users connect shop để enable features, có thể cải thiện aggregate signal.

3. **Rào cản kỹ thuật chính**: DataDome — Etsy là một trong số ít e-commerce sites dùng DataDome chuyên nghiệp. Chi phí scraping thực tế cao hơn 3–10× so với unprotected sites.

4. **Rào cản kinh doanh chính**: Etsy Enterprise API Tier — khi scale đến 1M+ calls/ngày, phí API = 15% revenue hoặc $2/10K calls (whichever higher). eRank đã bị tác động trực tiếp tháng 8/2025.

5. **Approach khả thi cho startup**: Kết hợp (a) Etsy Official API cho listing data miễn phí, (b) Autocomplete endpoint scrape để build keyword suggestions, (c) Google Trends làm proxy demand, (d) Listing count làm competition proxy. Không tốn gì hoặc rất rẻ — nhưng vẫn vi phạm ToS về scraping.

6. **Approach an toàn nhất**: Dùng Etsy Official API + user-connected data model (như EverBee/Alura) — user authorize qua OAuth, app đọc data của user → không vi phạm ToS. Sales estimation từ public signals là gray area nhưng được chấp nhận de facto bởi Etsy (nhiều apps đang làm).

---

## Methodology

Searched 20+ queries. Fetched và analyzed 15+ source pages trực tiếp. Cross-referenced pricing từ official vendor pages. Confirmed DataDome + Etsy relationship từ DataDome case study. Confirmed no-search-volume-API từ Etsy GitHub official response.

**Độ tin cậy cao**: DataDome usage, Etsy Enterprise pricing, Etsy ToS text, Firecrawl/Oxylabs/Zyte pricing (fetched từ official pages)
**Độ tin cậy trung bình**: EverBee data collection mechanism (không public chi tiết), Apify parseforge pricing (không hiện rõ), keyword volume methodology của các tools
**Cần verify thêm**: RapidAPI unofficial API reliability và pricing, Keyword Tool pricing chi tiết, Alura pricing

---

## Sources

1. [eRank Plans & Pricing](https://erank.com/plans) — eRank plan details và note về API pricing change
2. [Etsy Open API Enterprise Tier Discussion #1442](https://github.com/etsy/open-api/discussions/1442) — Enterprise tier pricing details và community reactions
3. [Etsy Keyword Search Volume Discussion #1058](https://github.com/etsy/open-api/discussions/1058) — Etsy team confirms no search volume API
4. [EverBee Product Analytics](https://everbee.io/product-analytics/) — EverBee data methodology claims
5. [EverBee Review - Traksource](https://traksource.com/everbee-review/) — Pricing ($29/$99) và accuracy review
6. [EverBee Chrome Web Store](https://chromewebstore.google.com/detail/everbee/oeicpkgdngoghobnbjngekclpcmpgpij) — Extension info
7. [Alura.io](https://www.alura.io/) — Sales estimate methodology from Etsy API signals
8. [Sale Samurai Etsy Search Volume](https://salesamurai.io/etsy-search-volume/) — Pricing $9.99/mo, search volume claims
9. [Marmalead Pricing](https://marmalead.com/pricing/) — $19/mo, $190/yr, $300 lifetime
10. [Apify - automation-lab/etsy-scraper](https://apify.com/automation-lab/etsy-scraper) — Pay-per-event pricing table
11. [Apify - parseforge/etsy-scraper](https://apify.com/parseforge/etsy-scraper) — Shop profiles and sales metrics
12. [Firecrawl Pricing](https://www.firecrawl.dev/pricing) — Credit plans
13. [Firecrawl Etsy Guide](https://docs.firecrawl.dev/developer-guides/common-sites/etsy) — Etsy scraping documentation
14. [Oxylabs Etsy Scraper API](https://oxylabs.io/products/scraper-api/ecommerce/etsy) — $0.40–$0.50/1K results pricing
15. [Bright Data Web Scraper Pricing](https://brightdata.com/pricing/web-scraper) — $1.50/1K records, $499/mo plans
16. [Zyte API Pricing](https://docs.zyte.com/zyte-api/pricing.html) — $0.13–$16/1K requests
17. [ScraperAPI Pricing](https://www.scraperapi.com/pricing/) — $49/mo Hobby, $149/mo Startup
18. [DataForSEO Pricing List](https://dataforseo.com/pricing-list) — Confirms no Etsy support
19. [Keywords Everywhere Etsy Search Volume](https://keywordseverywhere.com/etsy-search-volume.html) — Uses Google data, not real Etsy volume
20. [DataDome Etsy Case Study](https://datadome.co/customers-stories/etsy-stops-unwanted-traffic-reduces-computing-costs-with-datadome-google/) — Confirms DataDome protection
21. [ScrapFly - How to Scrape Etsy](https://scrapfly.io/blog/posts/how-to-scrape-etsy-com-product-review-data) — CAPTCHA challenges confirmed
22. [ScrapFly - DataDome Bypass Guide](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping) — Intent-based detection in 2025
23. [Etsy API Terms of Use](https://www.etsy.com/legal/api/) — ToS prohibitions on scraping
24. [Gold City Ventures - Sale Samurai Review](https://goldcityventures.com/sale-samurai-overview/) — Tool overview
25. [RapidAPI Etsy Scraper](https://rapidapi.com/airscarp-airscarp-default/api/etsy-scraper) — Unofficial API
