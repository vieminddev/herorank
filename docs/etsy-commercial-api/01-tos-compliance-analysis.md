# Đối chiếu Etsy API ToS (16/06/2025) ↔ VieRank

Mỗi mục: **điều khoản (trích nguyên văn) → VieRank làm gì → verdict → hành động.**
Mức: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 OK.

---

## 🔴 1. Analytics / AI / ML cần cho phép bằng văn bản
> "Use the Etsy API to **collect, scan, or otherwise request Etsy content for purposes of
> analytics, machine learning, training artificial intelligence models**, licensing, or
> content removal, **unless expressly authorised in writing by Etsy**."

- **VieRank**: là sản phẩm analytics (sales estimate, trend forecast, keyword analytics,
  sales velocity) + có AI + R2 archive ghi "for future model training/backfill".
- **Verdict**: mục đích analytics **được hoá giải bằng App Purpose Commercial được duyệt**
  (xem file 04 — incumbents vận hành theo cách này). Nhưng cụm **"training AI models"**
  bị liệt kê riêng, rủi ro cao → **không** khai mục đích train AI, và đổi framing archive.
- **Hành động**: (a) khai App Purpose = seller-analytics/research; (b) bỏ chữ "model
  training" trong retention.ts + wrangler + memory → "operational history".

## ⏸ 2. Extension đọc/annotate trang Etsy — PARKED (chưa public)
> "Use or **promote** the use of **automated systems or browser extensions to access, analyse,
> or scrape the Etsy Site**, the Etsy API or any Etsy data... **unless expressly authorised
> in writing by Etsy**."

- **VieRank**: extension MV3 đọc DOM trang Etsy (`querySelectorAll('a[href*="/listing/"]')`,
  autocomplete listbox) rồi overlay estimate.
- **Verdict**: sẽ dính §5 KHI publish — nhưng extension **CHƯA public** nên điều khoản
  ("use or promote") chưa áp dụng → **không phải rủi ro hiện tại**, để parked.
- **Hành động (trước khi publish)**: (a) xin phép văn bản, hoặc (b) chuyển extension sang chỉ
  hiển thị dữ liệu từ API của VieRank (không đọc DOM Etsy).

---

## 🟠 3. Không lưu lâu hơn mức cần thiết
> "Once you've accessed, stored, or displayed Etsy content, **you will not cache or store it
> longer than is reasonably necessary** to provide service to your Application's users."

- **VieRank**: `metric_series` multi-year + R2 archive "for model training".
- **Verdict**: vùng xám; framing "model training" làm nặng thêm (trùng #1).
- **Hành động**: reframe archive = lịch sử vận hành phục vụ feature seller; giữ retention có
  giới hạn (đã có prune).

## 🟠 4. "Minimum data needed" + "excessively burden"
> "[You will not] Request more than the minimum amount of data needed... **Excessively burden**
> or impose an unreasonable burden on the Etsy API or Etsy platform."

- **VieRank**: cron backfill history đối thủ đều đặn.
- **Verdict**: nếu quét quá rộng/dày = gánh nặng, cộng dồn với #1.
- **Hành động**: giữ cron ở mức phục vụ feature thật, tránh quét thừa; tuân caching + prune (đã có).

---

## 🟡 5. Application Terms click-through + warranty disclaimer + xử lý dữ liệu theo seller
> Bắt buộc chèn khối: "DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY [DEV]... ETSY... MAKE
> NO WARRANTIES..." + terms enforceable (click-through) + xử lý dữ liệu Member theo vai
> service-provider của từng seller (Section 4).
- **Hành động**: verify /terms có khối DISCLAIMER + ngôn ngữ processor theo seller + enforceable
  ở signup/OAuth-connect.

## 🟡 6. Support email giám sát được trong Application
> "Your Application must include a monitored email address that Etsy sellers can use... for support."
- **Hành động**: verify có support email hiển thị.

---

## 🟢 Đã tuân thủ tốt (ghi nhận)
- ✅ **Trademark disclaimer** đúng nguyên văn: footer dashboard + /terms + /privacy, đặt mờ hơn brand mình.
- ✅ **Freshness caps**: listing 6h / khác 24h (khớp clause "Display of Data").
- ✅ **Pricing**: research free, chỉ thu tiền AI media/deep-analysis (khớp "không charge cho thứ Etsy cấp free").
- ✅ **sold_count qua API chính thức** (`getShop.transaction_sold_count`) — KHÔNG scrape HTML.
- ✅ **Market/keyword data qua public listing-search API** (`findActiveListings`) — API hợp lệ, không phải scraping the Site.
- ⚙️ Data breach: báo `dpo@etsy.com` + seller trong **24h**. Dormant 6 tháng → suspend (cron active nên OK).
