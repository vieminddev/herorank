# Báo cáo phân tích ngách — Gốm & Khuôn đúc gốm (Etsy)

**Ngày:** 02/07/2026 · **Nguồn dữ liệu:** Etsy Open API v3 (public listing/review/shop) · **Công cụ:** VieRank
**Phạm vi:** 354 tổ hợp từ khoá được quét; báo cáo tập trung 3 ngách lọt shortlist cao nhất.

---

## 1. Tóm tắt điều hành (TL;DR)

Ba ngách đều **cung thấp / cạnh tranh thấp**, nhưng khác nhau rõ về **độ bám trụ của người bán**. Sau khi
đo doanh số thật, thứ tự nên vào cho một shop mới:

| # | Ngách | Cung (listing) | Đối thủ lớn nhất (bán trọn đời) | Số shop ≥10k | Phán quyết |
|---|---|---|---|---|---|
| 🥇 | **slip casting bowl mold** (khuôn đổ rót tô) | 302 | **9.655** | **0** | ✅ **VÀO** — không ai bám trụ; shop mới leo top được |
| 🥈 | **mushroom planter** (chậu nấm) | 1.886 | 33.398 (shop tổng hợp) | 5 | ⚠️ Được — cần khác biệt + giành hiển thị |
| 🥉 | **plaster planter mold** (khuôn chậu thạch cao) | 1.171 | **127.209** | **16** | ❌ **TRÁNH** — xưởng công nghiệp thống trị |

**Khuyến nghị:** khởi đầu bằng **slip casting bowl mold**; mở hướng sản phẩm thành phẩm thứ hai bằng
**mushroom planter** (khác biệt bằng gốm thật thay vì nhựa PLA); bỏ **plaster planter mold**.

---

## 2. Phương pháp & lưu ý đọc số

- **Cung / cầu / giá / whitespace:** lấy từ Etsy search (`/listings/active`, mẫu top listing theo relevance).
- **Doanh số/tháng ước tính:** theo tốc độ review từng listing (reviews 90 ngày ÷ 3 ÷ tỷ lệ review của
  ngành) — **là ƯỚC LƯỢNG**, và **thấp hơn thực tế với hàng khuôn/dụng cụ** (người mua hiếm để lại review).
  Dùng để đọc **hình dạng phân bố**, không phải con số tuyệt đối.
- **Doanh số trọn đời (`transaction_sold_count`):** số **THẬT** Etsy công khai, nhưng là **toàn shop** (mọi
  sản phẩm, mọi thời gian) — đo **cỡ/độ kỳ cựu người bán**, không riêng ngách.
- **Độ tập trung shop KHÔNG lấy từ 1 trang search** (Etsy rải ~1 listing/shop → luôn trông "đều", là artifact);
  đo bằng phân bố doanh số ước tính + doanh số trọn đời.
- **Tuổi listing** dùng `original_creation_timestamp` (không dùng `created_timestamp` vì reset khi auto-renew).
- **HHI:** <1500 = rải, 1500–2500 = vừa, >2500 = đặc. **Gini:** 0 = đều, →1 = lệch mạnh.

---

## 3. Bảng so sánh tổng hợp

| Chỉ số | slip casting bowl mold | mushroom planter | plaster planter mold |
|---|---|---|---|
| Tổng listing (cung) | **302** | 1.886 | 1.171 |
| Chỉ số cầu (0–100) | 56 | 67 | 61 |
| View trung vị/listing | 570 | 181 | 468 |
| Giá trung vị | **$50** | $29 | $23 |
| Thang giá (P25–P75) | $35–$120 | $20–$42 | $12–$47 |
| Whitespace | 38 | 38 | 41 |
| Opportunity Score v2 | 42 | 34 | 39 |
| **Độ sâu trang 1** | | | |
| Tuổi listing trung vị | 261 ngày | 339 ngày | 462 ngày |
| % listing mới ≤90 ngày | 25% | 29% | 23% |
| % listing già ≥2 năm | **17%** (thấp) | 31% | **40%** (cao) |
| Phân tán view (p90/median) | 13.7× | **8.6×** (đều nhất) | 9.5× |
| Tag TB đối thủ (/13) | **10.8** (kém nhất) | 12.4 | 12.7 |
| % dùng đủ 13 tag | **65%** | 85% | 83% |
| % có cá nhân hoá | 10% | 6% | 13% |
| % có biến thể | **6%** | 25% | 42% |
| Vật liệu phổ biến | plaster, gypsum, clay | ceramic, **PLA (nhựa in 3D)** | **silicone**, plaster |
| **Tập trung doanh số (ước tính, top 40)** | | | |
| Top-1 / Top-3 listing | 37% / 73% | 33% / 71% | **57%** / 74% |
| HHI | 2333 (vừa) | 2109 (vừa) | **3573 (đặc)** |
| Gini | 0.90 | 0.89 | 0.91 |
| Shop mạnh nhất giữ | 50% | **33%** (rải nhất) | 57% |
| **Doanh số shop trọn đời (THẬT)** | | | |
| Số shop trang 1 | 29 | 40 | 40 |
| Trung vị bán trọn đời | 556 | 714 | **5.775** |
| Cao nhất | **9.655** | 33.398 | **127.209** |
| Shop lớn (≥10k) / nhỏ (<500) | **0 / 14** | 5 / 18 | **16 / 11** |

---

## 4. Chi tiết từng ngách

### 🥇 slip casting bowl mold (khuôn đổ rót làm tô/bát)
**Landscape:** 302 listing tổng — cung nhỏ nhất. Không shop nào bán quá 10k trọn đời; cao nhất chỉ 9.655,
trung vị 556; 14/29 shop nhỏ (<500). Listing già ≥2 năm chỉ 17% → cửa vào mở.

**Bằng chứng người mới thắng được:** `MoldifyStudio` đạt **8.983 sales chỉ trong 1,9 năm** (gần top),
và trùng khớp với shop bán chạy theo ước lượng review → ngách thưởng cho người mới làm tốt.

**Điểm yếu đối thủ (nêm chèn):**
- SEO kém nhất: TB **10.8/13 tag**, chỉ 65% dùng đủ → dùng đủ 13 tag là vượt trên long-tail.
- Chỉ **6% có biến thể**, 10% cá nhân hoá → thêm tuỳ chọn size/độ sâu khuôn + "custom".
- Giá cao ($50, P75 $120) → biên tốt.

**Rủi ro:** 1 shop giữ ~50% doanh số ước tính (nhóm bán chạy ~11 đơn/tháng); phần lớn listing (85%) gần
như không bán → thị trường nhỏ, cần kiên nhẫn.

### 🥈 mushroom planter (chậu trồng cây hình nấm)
**Landscape:** 1.886 listing; cầu tốt (67). Có 5 shop lớn (CraftIRL 33k, RosebudHomeGoods 28k, MatrBoomie
18k…) nhưng đều là **shop home-goods tổng hợp** — chậu nấm chỉ là một phần nhỏ catalog, nên con số trọn
đời KHÔNG phản ánh sức mạnh riêng ở ngách này. Doanh số rải nhất trong 3 (shop mạnh nhất chỉ 33%).

**Điểm yếu đối thủ (nêm chèn):**
- Vật liệu top là `ceramic(7)` **& `PLA(5)`** → nhiều đối thủ là **in 3D nhựa PLA**, không phải gốm →
  một chậu **gốm slip-cast thật** ăn đứt về chất & định vị cao cấp.
- Phân tán view thấp nhất (8.6×) → listing mới dễ có hiển thị. Cá nhân hoá chỉ 6% → nêm.

**Rủi ro:** phải giành attention với shop lớn; cầu tốt nên nhiều người nhảy vào.

### 🥉 plaster planter mold (khuôn thạch cao đúc chậu)
**Landscape:** bị **nhà cung cấp khuôn quy mô công nghiệp** thống trị: `Kissrose` **127.209** sales /
16.914 review, `JOJODIYCRAFT` 96k, Harbourstore 70k, CraftMoreStore 70k — **16 shop ≥10k**. Doanh số
đặc nhất (HHI 3573, 1 shop giữ 57%). 40% listing già ≥2 năm.

**Ghi chú:** tìm "plaster mold" nhưng kết quả **chủ yếu là khuôn SILICONE (16) chứ không phải thạch cao (5)**
— lệch từ khoá đáng chú ý, nhưng không đủ bù cho việc bị các xưởng lớn chiếm lĩnh.

**Phán quyết:** người bán mới gần như không có cửa. **Tránh.**

---

## 5. Kết luận & bước tiếp

1. **Vào `slip casting bowl mold` trước** — rào thấp nhất, không đối thủ bám trụ, tiền lệ shop mới leo top,
   đối thủ SEO kém, giá cao.
2. **Mở `mushroom planter` làm dòng thành phẩm** — khác biệt bằng gốm thật (đối thủ nhiều hàng nhựa PLA).
3. **Bỏ `plaster planter mold`** — xưởng công nghiệp thống trị.
4. **Nêm chèn chung cho cả 3:** cá nhân hoá <15% ở mọi ngách → "personalized/custom" là đòn bẩy phổ quát.

**Hạn chế của báo cáo:** doanh số/tháng là ước lượng theo review (thấp hơn thực với hàng khuôn); doanh số
trọn đời là toàn-shop, không riêng ngách; số liệu là ảnh chụp 02/07/2026 (chưa có xu hướng theo thời gian —
cần theo dõi vài tuần để biết ngách đang lên hay xuống).

*Dữ liệu thô: `scripts/out/niche-report.md` (scan 354 tổ hợp), `niche-depth.md`, `niche-concentration.md`,
`niche-shops.md`. Dữ liệu keyword đã lưu vào kho `metric_series` (source `scan-8mh6`) làm mốc gốc.*
