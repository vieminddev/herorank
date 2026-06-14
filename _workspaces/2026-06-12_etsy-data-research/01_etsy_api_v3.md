# Research Report: Etsy Open API v3 as a Data Source for an Etsy SEO Tools SaaS (RankHero clone)

**Date:** 2026-06-12
**Author:** Business Analyst
**Scope:** Đánh giá khả năng dùng Etsy Open API v3 làm nguồn dữ liệu cho các tính năng: rank-check, listing-analyzer, shop-analyzer, best-sellers, niche-finder, etsy-trends, buyer-check, keyword tools.

> **Lưu ý phương pháp:** Trang `developers.etsy.com/documentation/reference/` được render bằng JavaScript nên WebFetch không đọc được nội dung endpoint trực tiếp. Các xác nhận endpoint dưới đây lấy từ: (a) generated client docs phản chiếu OpenAPI spec của Etsy, (b) các trang essentials đọc được, (c) GitHub discussions chính thức của `etsy/open-api`. Mọi điểm đều có dẫn nguồn.

---

## 0. Kết luận nhanh (TL;DR)

- API v3 **miễn phí**, không có tier trả tiền. Rate limit mặc định: **10.000 requests/ngày, 10 queries/giây**.
- **Rủi ro pháp lý/chính sách lớn nhất:** Etsy đã **TỪ CHỐI thẳng** một SEO tool thật ("Optimsy") và tuyên bố không cho phép app dùng dữ liệu Etsy cho AI/ML/generative, analytics, scraping. SEO/analytics tool clone RankHero **rơi vào use-case mà Etsy đang chủ động chặn**.
- API **KHÔNG** cung cấp: search volume thật, sales/revenue của listing người khác, conversion, dữ liệu hành vi buyer, ranking/position thực tế trên trang search Etsy, "trending/best-seller" official.
- Endpoint search (`findAllListingsActive`) **không trả về thứ hạng search thật** của Etsy. `sort_on=score` có tồn tại nhưng từng có bug được báo cáo và **không phản ánh thuật toán xếp hạng search cá nhân hoá** mà Etsy dùng cho buyer.
- → Phần lớn tính năng RankHero **không thể** xây dựng đúng/đủ chỉ bằng API v3. Hầu hết coverage là **một phần** (proxy/ước lượng) hoặc **không có**.

---

## 1. Đăng ký app + quy trình duyệt

### Hai cấp truy cập
- **Personal access** (mặc định cho mọi app mới): đọc/ghi shop do chủ shop cấp qua OAuth scope. Giới hạn kết nối tối đa **5 shops**. Không cần duyệt thủ công để có keystring + shared secret.
- **Commercial access**: bắt buộc nếu app phục vụ **bất kỳ seller nào** (không chỉ shop của bạn) — chính là mô hình SaaS. **Phải nộp đơn và được Etsy duyệt.**

Nguồn: [App Registration / Access types – developers.etsy.com](https://developers.etsy.com/documentation/), [Rate Limits – developers.etsy.com](https://developers.etsy.com/documentation/essentials/rate-limits/)

### Tiêu chí duyệt commercial
Etsy review theo các tiêu chí: app + homepage phải tuân thủ **API Terms of Use**, phải tuân thủ **caching policy**, phải **phân biệt rõ với Etsy**, **không được lách API để lấy/đăng dữ liệu Etsy** (tức cấm scraping), app truy cập private member data phải dùng OAuth.

### Thời gian duyệt
- Không có SLA công bố. Developer báo cáo thời gian phản hồi từ **vài ngày (3–4 ngày)** đến **trên 1 tháng** tuỳ trường hợp, có ca chờ rất lâu.
- Nguồn: [Discussion #1278 – "please approve my app, requested > 1 month ago"](https://github.com/etsy/open-api/discussions/1278), [Discussion #1387](https://github.com/etsy/open-api/discussions/1387)

### ⚠️ Use-case "SEO/analytics tool" có bị cấm không? — CÓ rủi ro cao
- **Bằng chứng trực tiếp:** Etsy đã **từ chối** một SEO optimization tool tên **"Optimsy"** với lý do nguyên văn:
  > *"At this time we are not allowing these types of usage of our data. Specifically, apps that rely on AI generative content, like ChatGPT, other LLM tools, or machine learning tools."*
  Nguồn: [etsy/open-api Discussion #1387](https://github.com/etsy/open-api/discussions/1387)
- API Terms of Use cấm dùng API để **collect/scan/request nội dung Etsy cho mục đích analytics, machine learning, training AI models, licensing** trừ khi được Etsy cho phép bằng văn bản; cấm **automated systems/browser extensions để access/analyze/scrape** site, API hoặc dữ liệu Etsy (listings, shops, user profiles).
  Nguồn: [API Terms of Use – etsy.com/legal/api](https://www.etsy.com/legal/api/) (trang trả 403 cho fetch tự động; nội dung trên trích từ kết quả search index của chính trang này)

**Hệ quả:** Một SaaS SEO/analytics clone RankHero, đặc biệt nếu có gợi ý title/tag bằng AI, **đang nằm đúng vào nhóm use-case Etsy chủ động từ chối**. Đây là rủi ro chặn cấp commercial — không phải rủi ro kỹ thuật mà là rủi ro **được phép tồn tại hay không**.

---

## 2. Rate limits & chi phí

| Mục | Giá trị |
|---|---|
| Queries Per Day (QPD) mặc định | **10.000 / 24h** |
| Queries Per Second (QPS) mặc định | **10 / giây** |
| Cấu trúc | Áp dụng theo API Key (public auth) và theo OAuth token (private auth); chia thành 12 block 2 giờ |
| Chi phí | **Miễn phí** — không có thông tin về tier trả tiền/thương mại có phí |
| Nâng limit | Email `developer@etsy.com` kèm mô tả app + ước lượng QPD/QPS cần |

Nguồn: [Rate Limits – developers.etsy.com](https://developers.etsy.com/documentation/essentials/rate-limits/), [Rollout – Etsy API Essentials](https://rollout.com/integration-guides/etsy/api-essentials)

**Ý nghĩa cho SaaS:** 10.000 calls/ngày rất thấp cho mô hình phân tích nhiều shop/keyword. Một lần "shop-analyzer" toàn shop có thể tốn hàng chục–trăm calls (paginate listings + images + reviews). Niche-finder/best-seller scan category sẽ "đốt" quota cực nhanh. Cần xin nâng limit (không đảm bảo được duyệt) và buộc caching theo policy.

---

## 3. Endpoint quan trọng — cái nào CÓ, cái nào KHÔNG

### ✅ Có (xác nhận qua OpenAPI client docs)
| Endpoint (operationId) | Path | Dùng cho |
|---|---|---|
| `findAllListingsActive` | `GET /v3/application/listings/active` | Search listing active toàn Etsy theo `keywords`, `taxonomy_id`, `min/max_price`, `sort_on`, `sort_order` |
| `findAllActiveListingsByShop` | `GET /v3/application/shops/{shop_id}/listings/active` | Listing active của 1 shop |
| `getListingsByShop` | `GET /v3/application/shops/{shop_id}/listings` | Listing theo state của shop |
| `getListing` | `GET /v3/application/listings/{listing_id}` | Chi tiết 1 listing (title, description, price, tags qua includes) |
| `getListingsByListingIds` | batch nhiều listing | |
| `getListingProperties` | thuộc tính listing | |
| Listing images | `getListingImages` / `getListingImage` | Phân tích ảnh (số lượng, kích thước) |
| Reviews | `getReviewsByListing` (`/listings/{listing_id}/reviews`), `getReviewsByShop` | Đọc review **public** |
| `getShop`, `getShopByOwnerUserId`, `findShops` | thông tin shop public | |
| Taxonomy | `getSellerTaxonomyNodes`, `getBuyerTaxonomyNodes`, `getPropertiesByTaxonomyId` | Cây category để map ngách |

Nguồn: [ShopListingApi client doc (phản chiếu OpenAPI spec)](https://github.com/gordonturner/etsy-open-api-client/blob/main/docs/ShopListingApi.md), [gordonturner/etsy-open-api-client](https://github.com/gordonturner/etsy-open-api-client), [Reviews/Taxonomy – search index of developers.etsy.com/documentation/reference](https://developers.etsy.com/documentation/reference/)

### ❌ KHÔNG có (không tồn tại trong API v3)
- **Trending listings / trending keywords** official — không có endpoint trending. (v2 cũ có `findAllTrendingListings`; **đã bị bỏ trong v3**.)
- **Best sellers theo category** — không có endpoint ranking best-seller/top sales.
- **Search volume / keyword volume / competition score** — không tồn tại bất kỳ endpoint nào trả về volume hay độ cạnh tranh keyword.
- **Search rank / position thực tế** — `findAllListingsActive` **không trả về vị trí xếp hạng** trong kết quả search thật của Etsy.
- **Sales/revenue/units sold của listing người khác** — không có. `transactions_r` chỉ áp dụng cho shop tự cấp quyền (xem mục 5).
- **Conversion rate, views, traffic, favorites-over-time của listing người khác** — không có (Etsy Stats chỉ trong dashboard seller, không expose qua API public).
- **Buyer behavior / buyer profile / buyer history** — không có endpoint đọc dữ liệu hành vi hay đánh giá độ tin cậy của buyer.

### ⚠️ Về `findAllListingsActive` và "ranking"
- `sort_on` documented enum: **`created`, `price`, `updated`, `score`**. `sort_order`: asc/desc.
- `sort_on=score` là proxy "relevancy" gần nhất, **NHƯNG**:
  - Có bug lịch sử được báo cáo: *"findAllListingActive not returning correct results for sort_on=score"* ([Google Group etsy-api-v2](https://groups.google.com/g/etsy-api-v2/c/c5K1YsvlqH0)).
  - Quan trọng hơn: kết quả này **KHÔNG phải** thứ hạng mà buyer thật thấy. Etsy search trên site là **cá nhân hoá** (theo location, lịch sử, "context-specific ranking", CSR/quality score, ad placement). API không tái tạo được thuật toán này.
- → Rank-check qua API chỉ cho **thứ hạng gần đúng/giả lập theo score**, không phải vị trí thật trên etsy.com.

---

## 4. Dữ liệu KHÔNG THỂ lấy từ API (nêu rõ)

| Dữ liệu | Có qua API v3? | Ghi chú |
|---|---|---|
| Search volume thật của keyword | ❌ Không | Không tồn tại endpoint nào. Buộc phải tự ước lượng (proxy) hoặc dùng nguồn ngoài. |
| Vị trí search thật trên etsy.com | ❌ Không | Search cá nhân hoá; API chỉ có `sort_on=score` gần đúng, không phản ánh ranking thật. |
| Sales / revenue / units sold của listing người khác | ❌ Không | `transactions_r` chỉ cho shop tự cấp OAuth. Không cross-shop. |
| Conversion rate / views / traffic / favorites theo thời gian | ❌ Không | Chỉ trong Etsy Shop Stats (seller dashboard), không expose API public. |
| Buyer behavior / độ tin cậy / lịch sử buyer | ❌ Không | Không có endpoint buyer-check. |
| Competition score keyword | ❌ Không | Chỉ tự suy ra từ số listing trả về cho keyword (proxy thô). |
| Best-seller ranking / trending | ❌ Không | Không có endpoint. |

**Estimated sales (số bán "ước lượng") mà các tool như RankHero/eRank/Marmalead hiển thị KHÔNG đến từ API official** — chúng thường suy ra từ review count, transaction count public của shop, ngày tạo, hoặc scraping. Scraping bị Terms of Use cấm rõ ràng.

---

## 5. OAuth: dữ liệu own-shop (cần token chủ shop) vs public (chỉ cần API key)

### Chỉ cần API key (public, keystring)
- Search listing active toàn Etsy (`findAllListingsActive`)
- Chi tiết listing active public (`getListing`, images, properties)
- Shop public info (`getShop`, `findShops`)
- **Reviews public** (`getReviewsByListing`, `getReviewsByShop`)
- Taxonomy

> API key bắt buộc trên **mọi** request, kể cả endpoint public.

### Bắt buộc OAuth 2.0 token của chủ shop (own-shop, không cross-shop)
| Scope | Dữ liệu |
|---|---|
| `listings_r` | Đọc listing inactive/expired (của chính shop) |
| `transactions_r` | **Sales/purchase data** — chỉ của shop đã cấp quyền |
| `shops_r` | Chi tiết shop riêng tư |
| `listings_w`, `listings_d`, `shops_w`, `transactions_w` | Ghi/sửa/xoá (của chính shop) |

**Điểm mấu chốt:** Dữ liệu sales/transaction **chỉ truy cập được cho shop tự đăng nhập cấp OAuth** — **không có cách hợp lệ nào lấy sales của shop đối thủ**. Đây là rào cản gốc khiến best-sellers / niche-finder / "estimated sales" của shop khác không khả thi qua API.

Nguồn: [Authentication / OAuth scopes – developers.etsy.com](https://developers.etsy.com/documentation/essentials/authentication/)

---

## 6. Bảng tổng kết: mỗi tính năng API v3 đáp ứng bao nhiêu

| Tính năng | Mức đáp ứng | Lý do / nguồn dữ liệu khả dụng | Thiếu gì |
|---|---|---|---|
| **rank-check** (vị trí listing theo keyword) | ⚠️ Một phần (thấp) | `findAllListingsActive?keywords=&sort_on=score` cho thứ tự gần đúng | Không phải ranking thật trên etsy.com (cá nhân hoá, ads, CSR); `score` từng có bug |
| **listing-analyzer** (title/tags/photos/reviews) | ✅ Đủ (cho listing public) | `getListing` (+tags qua includes), `getListingImages`, `getReviewsByListing` | Không có views/conversion/sales của listing đó |
| **shop-analyzer** (toàn shop) | ⚠️ Một phần | `getShop`, `findAllActiveListingsByShop`, `getReviewsByShop` cho dữ liệu public | Không có sales/revenue/traffic của shop người khác |
| **best-sellers** (top bán chạy theo category) | ❌ Không | Không endpoint best-seller; không lấy được units sold cross-shop | Toàn bộ tín hiệu sales của shop khác |
| **niche-finder** (demand cao / cạnh tranh thấp) | ⚠️ Một phần (rất thô) | "Cạnh tranh" ≈ số listing trả về cho keyword/taxonomy | "Demand" (search volume) hoàn toàn không có |
| **etsy-trends** (keyword/sản phẩm trending) | ❌ Không | Không có endpoint trending (v2 có, v3 bỏ) | Toàn bộ dữ liệu trend |
| **buyer-check** (hành vi/đánh giá buyer) | ❌ Không | Không có endpoint buyer | Toàn bộ dữ liệu buyer |
| **keyword tools** (search volume + competition) | ⚠️ Một phần (chỉ competition thô) | Competition ước lượng từ result count | Search volume thật hoàn toàn không có |

**Quy đổi nhanh:** Đủ: 1/8 · Một phần: 4/8 · Không: 3/8. Và **toàn bộ** đều phụ thuộc vào việc Etsy **chấp thuận commercial access cho một SEO/analytics app** — điều mà có bằng chứng Etsy đang từ chối.

---

## 7. Rủi ro & khuyến nghị (cho PM)

**Rủi ro chặn (blocking):**
1. **Chính sách:** Etsy chủ động từ chối SEO/analytics/AI tool (case Optimsy). Commercial access có thể bị từ chối → SaaS không có quyền phục vụ seller khác.
2. **Dữ liệu lõi thiếu:** search volume, sales cross-shop, ranking thật, trends, buyer — đây đều là **giá trị bán hàng cốt lõi** của RankHero, và API **không cung cấp**.
3. **Scraping bị cấm:** giải pháp "bù" bằng scraping etsy.com vi phạm Terms → rủi ro pháp lý + ban API key.
4. **Quota thấp:** 10k/ngày không đủ cho scan diện rộng; nâng limit không đảm bảo.

**Hướng đi cần PM quyết (trade-offs):**
- **A. Bám API official, định vị lại sản phẩm:** chỉ làm các tính năng API hỗ trợ (listing-analyzer own-shop, audit title/tag theo best practices, đọc review). Bỏ/giảm rank-check, best-seller, trends, buyer-check. → Hợp pháp, nhưng **không còn là RankHero clone đầy đủ**.
- **B. Mô hình "connect your own shop" (OAuth own-shop):** seller tự cấp quyền → có sales/transaction CỦA HỌ → làm analytics riêng cho từng shop hợp pháp. Mất khả năng so sánh đối thủ/best-seller.
- **C. Dùng nguồn dữ liệu bên thứ 3 / dữ liệu tự thu thập ngoài API:** rủi ro cao về Terms và pháp lý; cần đánh giá riêng (ngoài phạm vi báo cáo này).
- **D. Mua/license dữ liệu từ provider chuyên (eRank/Marmalead-style data) thay vì tự lấy:** cần research riêng về tính khả dụng & chi phí.

**Khuyến nghị BA:** Đừng cam kết clone đủ RankHero trên nền API v3. Nên **research bổ sung** về (1) cách các tool hiện tại (eRank, Marmalead, Alura) thực sự lấy search volume/sales — nhiều khả năng từ dữ liệu độc quyền/panel chứ không phải API official; (2) tính khả thi pháp lý của từng nguồn thay thế. Đây là yếu tố quyết định go/no-go sản phẩm, nên giải quyết **trước** khi thiết kế tính năng.

---

## Nguồn (links)
- [Etsy Open API v3 – Documentation home](https://developers.etsy.com/documentation/)
- [Rate Limits](https://developers.etsy.com/documentation/essentials/rate-limits/)
- [Authentication / OAuth scopes](https://developers.etsy.com/documentation/essentials/authentication/)
- [API Reference (JS-rendered)](https://developers.etsy.com/documentation/reference/)
- [API Terms of Use](https://www.etsy.com/legal/api/)
- [GitHub etsy/open-api Discussion #1387 – SEO tool "Optimsy" bị từ chối](https://github.com/etsy/open-api/discussions/1387)
- [GitHub etsy/open-api Discussion #1278 – approval chờ > 1 tháng](https://github.com/etsy/open-api/discussions/1278)
- [OpenAPI client doc – ShopListing endpoints](https://github.com/gordonturner/etsy-open-api-client/blob/main/docs/ShopListingApi.md)
- [Bug report: findAllListingActive sort_on=score sai kết quả](https://groups.google.com/g/etsy-api-v2/c/c5K1YsvlqH0)
- [Rollout – Etsy API Essentials (rate limit numbers)](https://rollout.com/integration-guides/etsy/api-essentials)
