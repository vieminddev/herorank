# Bảng đối chiếu Etsy API ToS (16/06/2025) ↔ VieRank — sau sửa

Cập nhật 2026-07-01, sau khi deploy `5c641096` + reframe. Nguồn: https://www.etsy.com/legal/api/
Trạng thái: ✅ đạt · ⏳ chờ thao tác tài khoản Etsy · ⚠️ rủi ro đã chấp nhận · 🔴 gap cần quyết.

| # | Điều khoản ToS | Yêu cầu | VieRank hiện tại | Trạng thái |
|---|---|---|---|---|
| 1 | §1 Trademark notice | Hiển thị "…trademark of Etsy… not endorsed or certified" | Có ở footer + /terms + /privacy + dashboard footer, đúng nguyên văn | ✅ |
| 2 | §1 Brand kém nổi hơn brand mình | Etsy TM mờ hơn brand riêng | Chỉ ở footer mờ; brand VieRank (teal) chủ đạo | ✅ |
| 3 | §1 Không ngụ ý endorsement | Không "partner/certified/endorsed" | Đã gỡ 100% claim (grep sạch); FAQ sửa lại | ✅ |
| 4 | §2 Rate limit — 1 app = 1 key | Mỗi app chỉ dùng key riêng, không nhiều key lách | Backend vẫn dùng key pool (3 key). Không lộ ra ngoài | ⚠️ (chủ chấp nhận) |
| 5 | §2 Bảo mật credentials | Giữ token an toàn | OAuth refresh token mã hoá AES-256 at rest | ✅ |
| 6 | §3 Application Purpose approval | Etsy duyệt mục đích trước | Chưa nộp/duyệt Commercial | ⏳ (item A/E) |
| 7 | §3 Support email cho seller | Email giám sát để seller liên hệ | support@vierank.com + legal@vierank.com hiển thị | ✅ |
| 8 | §3 Application Terms + warranty disclaimer | Khối "…ETSY NOT THE APPLICATION DEVELOPER…" + click-through | Đã thêm khối disclaimer vào /terms; signup có checkbox bắt buộc | ✅ |
| 9 | §3 Privacy policy enforceable | Có + user chấp nhận | /privacy đầy đủ; signup click-through gate cả email+Google | ✅ |
| 10 | §4 Member data — service provider | User=controller, app=processor; xử lý theo seller | Đã thêm "Data Roles" (controller/processor) ở /terms + /privacy | ✅ |
| 11 | §5 Display of Data (freshness) | Listing ≤6h, khác ≤24h; không cache lâu hơn cần | TTL 6h/24h đã cấu hình + nêu trong /privacy | ✅ |
| 12 | §5 Không cache lâu hơn cần | Prune, không giữ vô hạn | Retention có prune; framing "operational history" (bỏ "model training") | ✅ |
| 13 | §5 Commercial use | Được phép (Etsy duyệt) | Mô hình SaaS; chờ Commercial approval | ⏳ (item E) |
| 14 | §5 Không charge thứ Etsy cấp free | — | Research free; chỉ thu tiền AI media/deep-analysis | ✅ |
| 15 | §5 Không thao túng shop stats | Không inflate rating/review/view | Chỉ ước lượng + badge honesty; không inflate | ✅ |
| 16 | §5 Không xin quá dữ liệu tối thiểu / burden | Chỉ lấy đủ dùng | Cron backfill rộng (đi kèm key pool) — theo dõi | ⚠️ |
| 17 | §5 Không dùng extension đọc/scrape Etsy Site | Cấm "use or promote", trừ khi Etsy cho phép văn bản | Extension MV3 (đọc DOM Etsy) **CHƯA public** → điều khoản chưa áp dụng | ⏸ parked |
| 18 | §5 Analytics/ML/AI-train cần cho phép văn bản | Cấm trừ khi Etsy duyệt | Sản phẩm analytics → hoá giải bằng App Purpose Commercial được duyệt | ⏳ (item E) |
| 19 | §5 Dữ liệu thị trường lấy từ đâu | Không scrape HTML Site | Dùng public listing-search API + `transaction_sold_count` (API field) | ✅ |
| 20 | §7 Data Breach báo trong 24h | Báo dpo@etsy.com + seller ≤24h | Chưa có quy trình chính thức | ⏳ (item G, nhẹ) |
| 21 | §3 Dormant 6 tháng | Gọi API đều | Cron chạy 30'/lần | ✅ |

## Tồn đọng (không phải code)
- **⏳ A/E** — nộp/duyệt Commercial App Purpose (draft ở [02](02-application-purpose.md)); giải quyết #6, #13, #18.
- **⚠️ #4/#16** — key pool + độ rộng cron: rủi ro đã chấp nhận (chưa có user). Xem lại khi có user.
- **⏳ G** — viết SOP data-breach 24h (dpo@etsy.com).
- **Kiểm mắt** — ảnh `/etsy_*.png` là illustration VieRank; xác nhận không tái tạo logo/UI Etsy (trade dress §5).

## ⏸ Parked (chưa liên quan hiện tại)
- **Extension (#17)** — **CHƯA public** nên §5 ("use or promote... browser extensions") chưa áp dụng.
  Xử lý **TRƯỚC khi publish**: xin phép văn bản, hoặc chuyển extension chỉ render dữ liệu từ API
  VieRank (không đọc DOM Etsy). Không phải rào chắn cho đợt apply Commercial này.

## Kết luận
Phần **code/nội dung user-visible** về cơ bản đã khớp ToS (đã deploy). Rào chắn thực sự còn lại
**không nằm ở code**: được Etsy **duyệt Commercial** (mở khoá hợp lệ cho mục đích analytics) — item E.
Extension để parked tới khi chuẩn bị public.
