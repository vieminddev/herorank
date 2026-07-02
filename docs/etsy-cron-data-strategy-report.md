# Báo cáo: Chiến lược dữ liệu cron cho phân tích chiến lược Etsy

> Lập bởi vai trò "chuyên gia dữ liệu", 2026-06-22. Mọi con số trong báo cáo lấy từ **gọi API thật**
> (Etsy Open API v3, public api-key) — không phải giả định. Mục tiêu: quyết định **trường dữ liệu nào
> đáng cron** để làm nguồn cho: phát hiện xu hướng, tìm ý tưởng kinh doanh (whitespace), định giá,
> phân tích "cái gì đang bán".

## 1. Khung tư duy: STOCK vs FLOW

Mọi trường dữ liệu thuộc 1 trong 2 loại — quyết định nó có đáng cron không:

- **STOCK** (mức tại 1 thời điểm): title, tags, materials, review_average… Giá trị nằm ngay ở 1 lần
  đọc. **KHÔNG cần cron** trừ khi muốn theo dõi *thay đổi* của 1 đối thủ cụ thể.
- **FLOW** (vận tốc — chỉ hiện ra khi lấy hiệu hai mốc thời gian): doanh số/tuần, traffic/tuần, số
  listing mới/tuần, mức xói giá… **Giá trị CHỈ tồn tại nếu có chuỗi thời gian → BẮT BUỘC cron.**

> Quy tắc: cron để biến **STOCK → FLOW**. Cái gì đáng cron = cái mà *sự thay đổi theo thời gian* trả
> lời được câu hỏi chiến lược.

Câu hỏi chiến lược → tín hiệu cần:

| Câu hỏi kinh doanh | Tín hiệu cần (FLOW) |
|---|---|
| Cái gì đang **lên**? (xu hướng) | demand velocity, sales velocity |
| **Ý tưởng tốt** ở đâu? (whitespace) | demand cao ÷ (supply × tốc độ đối thủ mới vào) |
| Thị trường nào **đang bão hoà**? (tránh) | new-listings/tuần ↑, giá ↓ |
| Cái gì **đang thực sự bán**? | Δ transaction_sold_count |
| Thuộc tính/phong cách nào **thắng**? | phân phối attribute của top listing theo thời gian |
| **Định giá** thế nào? | phân phối giá theo thời gian |

## 2. Phát hiện thực nghiệm then chốt (đã gọi API xác minh)

### 2.1 ⭐ `transaction_sold_count` — DOANH SỐ THẬT, công khai trên mọi shop
Gọi `GET /shops/{id}` trả về (giá trị thật đã probe):

| Shop | sold | reviews | active | review-rate thật (reviews/sold) |
|---|---|---|---|---|
| phenixdigital | **100.995** | 9.314 | 55 | 9,2% |
| CaliberForLife | 3.913 | 711 | 86 | 18,2% |
| WanderingStarCrafts | 1.716 | 355 | 652 | 20,7% |
| crackinchina | 19.977 | 3.642 | 440 | 18,2% |
| (shop mới) | 0–13 | 0–2 | 1–36 | — |

**Ý nghĩa:** đây là số bán **lũy kế trọn đời, THẬT** (không ước lượng). Cron snapshot hàng tuần →
**Δsold/tuần = doanh số thật mỗi tuần**. Đây là nâng cấp lớn nhất: biến nền tảng từ "ước lượng sales
qua review" thành "ĐO sales" cho tập shop theo dõi. Đồng thời `sold ÷ reviews` cho **review-rate thật
để calibrate** mô hình ước lượng (hiện đang đoán ~vài %; thực tế đo được 9–21%, khác nhau theo ngành).

### 2.2 Search trả về phân phối đầy đủ (1 call = nhiều tín hiệu)
`GET /listings/active?keywords=...&limit=100` cho "personalized necklace" (thật):
- `count` = **468.118** (cung/độ bão hoà)
- price $: 16,50 / **32,00** / 250,00 (min/median/max → định vị giá)
- views: 0 / **560** / 494.979 (traffic; sum 904k)
- faves: 0 / 34 / 20.582
- has_variations: **88%** (chuẩn productization của ngành)

### 2.3 Tốc độ listing mới đo được (saturation speed)
`sort_on=created&desc`, 100 listing mới nhất "soy candle": **100/100 tạo trong 24h** → thị trường
nạp **>100 listing mới/ngày**. Đo được tốc độ đối thủ mới vào = tốc độ bão hoà.

### 2.4 Phân phối thuộc tính đo được (xu hướng sản phẩm)
Top 25 "soy candle": when_made = made_to_order 14, vintage-ranges 11; who_made = i_did 16/25;
personalizable 4/25. → theo dõi theo thời gian thấy **dịch chuyển phong cách** (vd cá nhân hoá tăng).

## 3. Mô hình cron đề xuất — 2 "nhịp" (grain)

### Nhịp A — KEYWORD pulse (hàng tuần, mỗi seed keyword)
Từ **1–2 call** (`findActiveListings` score-sort + created-sort):

| Trường lưu | Nguồn | Loại | Trả lời câu hỏi |
|---|---|---|---|
| `market_count` | search.count | STOCK→Δ | mức + tốc độ tăng cung |
| `new_listings_7d` | created-sort sample | **FLOW** | tốc độ bão hoà / đối thủ mới |
| `agg_views`, `median_views` | Σ/median views top-N | **FLOW** | demand/traffic thật |
| `agg_faves` | Σ num_favorers | FLOW | engagement |
| `price_p25/median/p75` | phân vị giá top-N | **FLOW** | định vị + xói giá |
| `has_variations_rate` | % có biến thể | STOCK | chuẩn productization |
| `whenmade/whomade_mix` | phân phối | STOCK→Δ | dịch chuyển phong cách |

→ **Whitespace score** = `demand_velocity ÷ (market_count × new_listings_7d)` — ý tưởng tốt = cầu lên,
cung ít, ít đối thủ mới vào.

### Nhịp B — SHOP pulse (hàng tuần, tập shop có giới hạn) ⭐
Từ **1 call** `getShop`/shop, cho: top 10–20 shop mỗi seed category (khám phá ở Nhịp A) + mọi shop
user theo dõi:

| Trường lưu | Loại | Trả lời câu hỏi |
|---|---|---|
| `transaction_sold_count` | **FLOW⭐** | **doanh số THẬT/tuần** (Δ) |
| `review_count` | FLOW | review velocity (đối chiếu) |
| `listing_active_count` | FLOW | shop mở rộng catalog nhanh? |
| `num_favorers` | FLOW | tăng follower |
| `review_average` | STOCK | xu hướng chất lượng |

→ Bảng xếp hạng **"cái gì đang bán chạy NHẤT lúc này"** (theo Δsold, không phải ước lượng) +
phát hiện **shop đang tăng tốc** + **calibrate review-rate** bằng ground truth.

## 4. Giá trị chiến lược mỗi nhịp mở ra

1. **Xu hướng thật**: demand_velocity (views Δ) + sales_velocity (sold Δ) → "đang lên/xuống" có số liệu.
2. **Ý tưởng kinh doanh**: whitespace score xếp hạng keyword theo cơ hội (cầu cao, cung thấp, ít kẻ mới).
3. **Cái gì đang bán**: Δsold của tập shop → sản phẩm/ngách đang tăng tốc bán.
4. **Định giá**: chuỗi price-percentile → biết nên định giá ở đâu, cảnh báo khi ngành xói giá.
5. **Sản phẩm thắng**: dịch chuyển phân phối attribute/when_made → bắt sóng phong cách sớm.
6. **Calibrate**: sold/reviews thật → sửa mô hình ước lượng cho mọi tool khác chính xác hơn.

## 5. Chi phí & lưu trữ (rất rẻ)

**API calls/tuần** (gói hiện tại 5 RPS / 5000 RPD):
- Nhịp A: ~2 call × N keyword. 113 kw → ~226.
- Nhịp B: 1 call × M shop. Giới hạn ~200–400 shop → ~300.
- **Tổng ~500 call/tuần** → ~71/ngày khấu hao. Cách rất xa trần 5000 RPD.

**Lưu trữ:** cả 2 nhịp là weekly, hàng-trăm dòng/tuần → vài chục nghìn dòng/năm. **Không đáng kể**
(nhỏ hơn rank_history nhiều bậc). Áp retention 104 tuần là đủ.

## 6. Giới hạn trung thực (xác nhận từ spec)
- `transaction_sold_count` là **lũy kế trọn đời**, không tách theo sản phẩm → Δ cho sales/tuần CẢ SHOP,
  không phải từng listing. Quy về listing vẫn cần phân bổ (ước lượng).
- `views` cũng lũy kế trọn đời → phải snapshot mới ra velocity.
- Không có search-volume keyword, không có "trending toàn sàn" → vẫn phải tự dựng từ seed + cron.
- Etsy có thể đổi field bất kỳ lúc nào → giữ ingest chịu lỗi (field thiếu = NULL, không vỡ).

## 7. Khuyến nghị triển khai (thứ tự giá trị)

| Ưu tiên | Việc | Lý do |
|---|---|---|
| **1** | **Nhịp B: cron snapshot `transaction_sold_count`** cho seed shops + user-tracked | Doanh số THẬT — đòn bẩy lớn nhất, đổi chất nền tảng |
| **2** | Calibrate review-rate bằng sold/reviews thật | Sửa mọi ước lượng sales hiện có |
| **3** | Nhịp A mở rộng: thêm price-percentile + new_listings_7d vào snapshot keyword | Whitespace + định giá |
| **4** | Whitespace score + bảng "đang bán chạy" (UI) | Biến data thành sản phẩm người dùng |
| **5** | Theo dõi phân phối attribute/when_made | Bắt sóng phong cách |

> Hiện tại cron mới lưu `demand_score` + (vừa thêm) `agg_views`. Báo cáo này đề xuất bổ sung **Nhịp B
> (shop sales velocity)** và mở rộng **Nhịp A** thành snapshot đa-trường. transaction_sold_count là
> mỏ vàng chưa khai thác — nên ưu tiên số 1.
