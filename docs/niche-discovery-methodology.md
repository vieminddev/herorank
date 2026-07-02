# Niche Discovery Methodology — mảng Gốm / Khuôn đúc gốm

**Mục tiêu:** dùng dữ liệu Etsy (kho `metric_series` của VieRank + Etsy public API) để tìm **ngách ít
cạnh tranh** trong vertical gốm — phủ **cả 2 nhánh**:
- **Nhánh A — Sản phẩm gốm đúc khuôn** (slip-cast finished): cốc, vase, planter, trinket dish, incense
  holder… bán thành phẩm.
- **Nhánh B — Khuôn (mold)**: slip-casting / plaster / silicone / press mold bán cho người làm gōm.

Tài liệu này là **spec phương pháp** — chốt công thức, ngưỡng, quy trình trước khi code/thu dữ liệu.
Người viết: phân tích như một data analyst. Cập nhật: 2026-07-02.

---

## 1. Dữ liệu sẵn có (đã verify từ prod `vierank-history.metric_series`)

**Keyword-level** (entity_type=`keyword`, granularity `week`, ~424 keyword):
| metric | ý nghĩa | vai trò trong niche-finding |
|---|---|---|
| `demand` | chỉ số cầu 0–100 (ước lượng) | Cầu (numerator) |
| `median_views` | view trung vị của listing trang 1 | **Attention thật/​listing** — cầu chưa được phục vụ |
| `result_count` | số listing đang bán cho keyword | **Cung / cạnh tranh thô** (denominator) |
| `new_listings` | listing mới/tuần (sample) | Tốc độ cung đổ vào = tốc độ bão hoà |
| `price_median` | giá trung vị (cents) | Khả năng kiếm lời |
| `whitespace` | điểm cơ hội 0–100 tính sẵn | Điểm nền (xem §3) |

**Shop-level** (entity_type=`shop`, ~1.200 shop): `sold_count`, `active_listings`, `num_favorers`,
`review_count` (day) + `reviews`, `review_rating` (month, history). → dùng đo **độ tập trung thị
trường** (mấy shop lớn có nuốt hết ngách không).

**Điểm mù dữ liệu hiện tại:** 424 keyword toàn **head-term 2 chữ** (ceramic mug, pottery bowl) — đều
bão hoà. Ngách ít cạnh tranh thật nằm ở **đuôi dài 3–5 chữ** (form × phong cách × chức năng) mà kho
chưa phủ. → §6 (seed strategy) khắc phục.

---

## 2. Nguyên lý: ngách tốt = 4 điều kiện ĐỒNG THỜI

```
Opportunity = Cầu_thực  ×  Lọt-trang-1-được  ×  Kiếm-lời-được  ×  Đang-tăng-trưởng
```
Một ngách chỉ đáng làm khi **cả bốn** đúng. Chỉ "cung thấp" là bẫy — cung thấp vì *không ai mua* thì
vô nghĩa. Chỉ "cầu cao" là bẫy — cầu cao nhưng 1,4 triệu đối thủ thì không lọt nổi trang 1.

**Quy luật lõi rút ra từ dữ liệu thật (2026-07-02):**
1. **Thang đặc tả (specificity ladder) — đòn bẩy rẻ nhất.** Cùng cái cốc: `ceramic mug` = 1.418.000
   đối thủ, `stoneware mug` = 54.081 (**giảm 26×**) mà cầu chỉ giảm nhẹ (66→38). ⇒ *Cùng sản phẩm,
   xuống thang từ vựng ít người dùng.*
2. **Mảng khuôn mỏng cung** (`ceramic mold` = 18k, thấp nhất cụm) nhưng cầu cũng thấp → nhánh B là
   ngách "ít đối thủ" thật, nhưng volume nhỏ; nhánh A (thành phẩm) mới là nơi có cầu lớn.
3. **View/listing cao + cung vừa = attention bị bỏ đói** (`resin molds` 451 views, `handmade
   ceramics` 465, `pottery tools` 333). Nhiều mắt nhìn, ít listing tốt phục vụ = nêm chèn.

---

## 3. `whitespace` hiện tại — dùng được nhưng điểm mù ở đâu

Công thức (src/lib/server/services/etsy/refresh.ts `whitespaceScore`):
```
whitespace = clamp₀₋₁₀₀( demandIndex − supplyPenalty − entryVelocityPenalty )
supplyPenalty        = 25 · log10(1+resultCount) / log10(1+200000)
entryVelocityPenalty = min(25, newListings7d · 2)
```
**Điểm mù cho niche-finding:**
- **Trần supplyPenalty = 25** ⇒ keyword 1,4 triệu đối thủ chỉ bị trừ ~25, vẫn được điểm cao nhờ
  demand → **thiên vị head-term**. (Vì thế `ceramic mug` ra whitespace 21 dù vô vọng với shop mới.)
- **Bỏ qua `median_views`** (attention thật/​listing) — chỉ dùng demandIndex trừu tượng.
- **Bỏ qua giá** → không biết ngách có kiếm lời được không.
- **Bỏ qua độ SÂU cạnh tranh** (tuổi listing trang 1, phân bố review, tập trung shop).
- **Bỏ qua đà** (demand tăng hay giảm qua các tuần).

⇒ Giữ `whitespace` làm **bộ lọc sơ cấp (coarse filter)**, nhưng chấm ngách bằng **Opportunity Score
v2** dưới đây.

---

## 4. Opportunity Score v2 (đề xuất)

Thang 0–100, cao = ngách càng ngon. Bốn hợp phần nhân trọng số (điều chỉnh sau khi hiệu chuẩn):

### 4.1 Demand (35%)
```
demand_norm = 0.5·norm(demand) + 0.5·norm(log(1+median_views))
```
Dùng `median_views` để bắt attention thật/​listing, không chỉ tin demandIndex.

### 4.2 Competition — thay penalty có trần bằng TỶ SỐ (35%)
```
DCR (Demand-per-Competitor) = median_views / log10(1 + result_count)
comp_norm = norm(DCR)                        # cao = ít đối thủ tương đối
```
Bỏ trần 25 → phân biệt được 50k vs 1,4M đối thủ (điều `whitespace` không làm). **Cộng** phạt tốc độ
cung: `− k·min(cap, new_listings)`.

### 4.3 Monetizability (15%)
```
money_norm = norm(price_median) clamp ở ngưỡng sàn lợi nhuận (vd ≥ $18 cho thành phẩm)
+ thưởng nếu độ phân tán giá (P75−P25) rộng  → có chỗ khác biệt & định giá cao
```

### 4.4 Momentum (15%)
```
mom = độ dốc hồi quy của demand (và/hoặc median_views) qua ≥3 tuần gần nhất
```
Dùng lịch sử tuần của `metric_series` + `forecast.ts`. Ngách đang lên > đang chết.

> **Ngưỡng phân loại nhanh (shortlist trước khi phân tích sâu §5):**
> `result_count` 2.000–60.000 **VÀ** `median_views` ≥ 40 **VÀ** `new_listings` ≤ 10 **VÀ**
> `price_median` ≥ ngưỡng lợi nhuận. (Trên 60k = quá đông cho shop mới; dưới 2k = có thể chết cầu.)

---

## 5. Phân tích ĐỘ SÂU cạnh tranh (cái `result_count` không nói)

Với mỗi keyword lọt shortlist, kéo **listing trang 1** (Etsy `findActiveListings` sort by relevance)
và đo — đây là phần quyết định "vào được hay không":

| Tín hiệu | Cách đo | Ngưỡng "vào được" |
|---|---|---|
| **Listing mới lọt trang 1** | % listing `created` < 90 ngày trong top 40 | ≥ 15% → cửa còn mở |
| **Review trang 1 thấp** | median review_count của top 40 | thấp (vd < 50) = dễ phá |
| **Tập trung shop** | HHI hoặc share của top-3 shop trong top 40 (dùng shop `sold_count`) | top-3 < ~50% = rải, vào được |
| **Khoảng trống thuộc tính** | top 40 THIẾU gì: personalization / size / màu / phong cách (signal attribute-gap có sẵn) | càng thiếu = nêm chèn của bạn |

Một ngách "cung vừa" nhưng trang 1 toàn shop già review nghìn + top-3 nuốt 80% ⇒ **loại**. Ngược lại
"cung hơi cao" mà 30% listing mới lọt + review thấp + rải shop ⇒ **giữ**.

---

## 6. Cây ngách & seed keyword (mở rộng đuôi dài)

Head-term đã bão hoà → phải sinh **tổ hợp đuôi dài** rồi mới chấm. Sinh theo ma trận, không liệt kê tay.

### Nhánh A — Sản phẩm gốm đúc khuôn  =  Form × Phong cách × (Chức năng/Dịp)
- **Form (moldable):** bud vase, bulb vase, planter, hanging planter, trinket dish, ring dish, ring
  holder, jewelry dish, incense holder, cone incense holder, oil burner, wax warmer, ornament, bell,
  figurine, spoon rest, soap dish, toothbrush holder, butter dish, creamer, sugar bowl, matcha bowl
  (chawan), espresso cup, cortado cup, berry bowl (colander), catchall tray, coaster, candle vessel,
  taper holder.
- **× Phong cách (điểm khác biệt thật):** wabi sabi, brutalist, cottagecore, mushroom, minimalist,
  scandinavian, japandi, japanese, retro 70s, coquette, checkerboard, scalloped, fluted, ribbed,
  organic modern, speckled, matte black, earth tone.
- **× Chức năng/Dịp:** propagation, self watering, drainage, matcha ceremony, gift for plant lover,
  housewarming gift, wedding favor, coffee lover gift.

_Ví dụ tổ hợp:_ `wabi sabi matcha bowl`, `mushroom planter ceramic`, `brutalist bud vase`,
`checkerboard trinket dish`, `fluted espresso cup`, `cone incense holder ceramic`.

### Nhánh B — Khuôn  =  Loại khuôn × Form đúc ra × (Ý định DIY)
- **Loại khuôn:** slip casting mold, plaster mold, silicone mold, press mold, hump mold, slump mold,
  sprig mold, drape mold, bisque mold, clay stamp, texture roller, texture mat, pottery stamp.
- **× Form đúc ra:** mug, bowl, planter, vase, dish, ornament, figurine, spoon rest, ring dish, bead.
- **× Ý định DIY:** for beginners, reusable, diy, small batch.

_Ví dụ:_ `slip casting mug mold`, `plaster planter mold`, `press mold leaf dish`,
`silicone bead mold pottery`, `sprig mold botanical`.

> **Chỉ tiêu thu:** sinh ~150–300 tổ hợp (ưu tiên A vì volume lớn), nạp vào discovery seed → cron thu
> `demand/median_views/result_count/new_listings/price_median/whitespace` hàng tuần. Sau 2–3 tuần đủ
> chuỗi để chấm Momentum (§4.4).

---

## 7. Quy trình 5 bước (pipeline)

1. **Sinh keyword** — dựng ma trận §6 → danh sách tổ hợp đuôi dài (cả A & B).
2. **Thu tuần (cron)** — nạp seed vào discovery; cron dual-write vào `metric_series`. *Lưu ý quota:
   pool đếm theo ngày-lịch UTC nhưng Etsy dùng rolling-window 24h → giữ tải dưới cap (HISTORY_DAILY
   _TARGET=7000), tránh scan burst lớn cùng lúc.*
3. **Lọc sơ cấp** — áp ngưỡng §4 (ngưỡng nhanh) + Opportunity Score v2 → shortlist ~20–40 keyword.
4. **Phân tích sâu** — với shortlist, kéo trang 1 + đo 4 tín hiệu §5 (listing mới / review / tập trung
   shop / attribute-gap). Loại ngách "cung vừa nhưng trang 1 bất khả xâm phạm".
5. **Ra quyết định** — xếp hạng cuối theo Opportunity × (điểm độ-sâu §5); xuất bảng: keyword, cầu,
   cung, giá, % listing mới, tập trung shop, khoảng trống thuộc tính, gợi ý nêm chèn.

---

## 8. Khoảng trống & việc cần làm (theo thứ tự)

- [ ] **Sinh + nạp seed đuôi dài** (§6) vào discovery — điều kiện tiên quyết; kho hiện chưa có đuôi dài.
- [ ] **Cài Opportunity Score v2** (§4) — hàm thuần TS cạnh `whitespaceScore`, unit-test bằng fixture.
- [ ] **Module phân tích độ sâu trang 1** (§5) — tái dùng `findActiveListings` + attribute-gap signal.
- [ ] **Tool/where hiển thị** — có thể gắn vào `/etsy-trends` (đã có) như một tab "Niche Finder", hoặc
      script one-off xuất CSV. Quyết định sau khi phương pháp chốt.
- [ ] **Hiệu chuẩn trọng số §4** — sau lứa dữ liệu đầu, so điểm với ngách đã biết để chỉnh 35/35/15/15.

## 9. Phụ lục — số thực đã chạy (cụm gốm, 2026-07-02)

| keyword | demand | supply | med_views | price | whitespace | ghi chú |
|---|---|---|---|---|---|---|
| resin molds | 71 | 113k | 451 | $7.95 | 31 | attention/listing rất cao |
| ceramic sculpture | 61 | 88k | 36 | $149 | 30 | giá cao |
| ceramic mold | 41 | **18k** | 25 | $29 | 11 | cung thấp nhất cụm (nhánh B) |
| stoneware plate | 39 | 34k | 12 | $36 | 14 | moat từ vựng "stoneware" |
| stoneware mug | 38 | 54k | 13 | $27 | 0 | vs ceramic mug 1,4M (26× ít hơn) |
| ceramic mug | 66 | **1.418k** | 64 | $27 | 21 | ví dụ head-term bão hoà — TRÁNH |

_Tất cả là head-term; giá trị thật của phương pháp lộ ra khi chấm trên tổ hợp đuôi dài §6._
