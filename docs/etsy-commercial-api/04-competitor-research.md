# Cách incumbents vận hành hợp lệ — nghiên cứu tham khảo

Câu hỏi cốt lõi: nếu ToS cấm analytics "unless authorised in writing", vì sao
eRank/Marmalead/Alura tồn tại? Trả lời: **App Purpose Commercial của họ đã được duyệt**
(= văn bản cho phép), và họ lấy dữ liệu thị trường qua **API hợp lệ**, không scrape HTML.

## Cách lấy dữ liệu (điểm quan trọng nhất)
- **Marmalead** — *"pulls keyword data straight from Etsy's **search API**"*: dùng endpoint
  **public listing-search** (API-key, không cần OAuth của user) rồi tổng hợp thành "search volume".
- **eRank & Alura** — *"work from **estimates**"*: signal gián tiếp, listing performance, ước lượng.
- **Shop của user** — cả 3 lấy qua **OAuth** khi user connect shop (đọc listing/traffic/sales của
  chính họ).

→ **Trùng khớp cách VieRank làm**: `findActiveListings` (public search) + `transaction_sold_count`
(public field) + estimation. Đây là **API dùng hợp lệ**, KHÔNG phải "scraping the Etsy Site" —
điều khoản cấm nhắm vào **đọc HTML etsy.com bằng bot/extension**, không phải gọi API search.

## Hệ thống tier (xác nhận từ Etsy help + dev)
- **Personal**: đọc/ghi ≤5 shop qua OAuth, **không được charge tiền**. Dễ duyệt.
- **Commercial**: app "general-purpose" phục vụ **mọi seller**, được charge. Review theo 3 tiêu chí:
  1. App + homepage tuân thủ API ToS
  2. Tuân thủ caching policy
  3. Phân biệt rõ với Etsy
  → VieRank đã đạt cả 3.

## Thực tế duyệt (từ dev thực chiến)
- Danh nghĩa **24–48h**; thực tế **2–3 tuần**, có case **20+ ngày**; support Etsy chậm/thất thường.
- Reject phổ biến vì: tên app chứa "etsy", khai "3rd-party access", mô tả mơ hồ, nghi circumvent checkout.
- Mẹo: xin **Personal trước** rồi upgrade Commercial.

## Định vị của incumbents với Etsy
- eRank: *"uses the Etsy API but is **not endorsed or certified** by Etsy, Inc."* — là API user hợp
  lệ, **không** phải "official partner". VieRank cùng định vị (disclaimer đã có).

## Nguồn
- Etsy API Terms of Use — https://www.etsy.com/legal/api/
- What is Etsy's API? (Help Center) — https://help.etsy.com/hc/en-us/articles/360025870013-What-is-Etsy-s-API
- etsy/open-api Discussion #1060 (registering new app) — https://github.com/etsy/open-api/discussions/1060
- The no.1 mistake when making an Etsy app application (Medium) — https://medium.com/@anastasia.bizyayeva/the-no-1-mistake-to-avoid-when-making-an-etsy-app-application-99245998c62b
- eRank vs Marmalead vs Alura (data sources) — https://stablecommerce.ai/blog/erank-vs-marmalead-vs-alura
- First: Connect Your Shop to eRank — https://help.erank.com/blog/how-do-i-connect-my-etsy-shop-to-erank/
