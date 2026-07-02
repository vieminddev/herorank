# Etsy Commercial API — Hồ sơ apply & tuân thủ

Mục tiêu: đưa VieRank lên **Etsy API Commercial Access** một cách hợp lệ, và khép các
rủi ro tuân thủ với **API Terms of Use bản 16/06/2025** (bản này thêm điều khoản cấm
analytics/AI/scraping "unless expressly authorised in writing by Etsy").

## Vì sao cần
- VieRank phục vụ **bất kỳ seller nào** (không chỉ shop của mình) + **có thu phí** →
  bắt buộc tier **Commercial** (Personal chỉ ≤5 shop và **không được charge tiền**).
- Việc App Purpose Commercial được Etsy **duyệt = "văn bản cho phép"** cho mục đích
  analytics → đây chính là cách eRank/Marmalead/Alura tồn tại hợp lệ.

## Các file trong thư mục
| File | Nội dung |
|---|---|
| [01-tos-compliance-analysis.md](01-tos-compliance-analysis.md) | Đối chiếu từng điều khoản ToS ↔ tính năng VieRank ↔ mức rủi ro ↔ hành động |
| [02-application-purpose.md](02-application-purpose.md) | Draft "Application Purpose" + câu trả lời form đăng ký + né các "mìn" reject |
| [03-remediation-checklist.md](03-remediation-checklist.md) | Danh sách việc phải làm để hợp lệ, kèm trạng thái |
| [04-competitor-research.md](04-competitor-research.md) | eRank/Marmalead/Alura lấy dữ liệu thế nào + nguồn tham khảo |
| [05-legal-language-reference.md](05-legal-language-reference.md) | Câu chữ Privacy/ToS verbatim của đối thủ + draft cho VieRank + 2 chỗ KHÔNG được copy |
| [06-compliance-scorecard.md](06-compliance-scorecard.md) | Bảng đối chiếu 21 điều khoản ToS ↔ VieRank sau sửa (✅/⏳/⚠️/🔴) |

## Trạng thái tổng (cập nhật 2026-07-01)
- [x] **Đã deploy** loạt sửa legal/marketing compliance (version `5c641096`): `/terms` + `/privacy`
  (controller/processor, warranty disclaimer chuẩn Etsy, retention honest, revoke link, sửa câu
  "anonymized immediately"); signup click-through Terms bắt buộc; gỡ mọi claim "Partner/Certified";
  làm nhẹ social proof bịa; đổi tên extension "SEO for Etsy". Chi tiết: [03-remediation-checklist.md](03-remediation-checklist.md) mục C/J/K.
- [ ] Xác nhận tier hiện tại của app tại `etsy.com/developers/your-apps`
- [x] Reframe R2/retention: bỏ chữ "model training" → "operational history" (comment nội bộ + config)
- [ ] Nộp/upgrade **Commercial** với App Purpose ở file 02
- [⏸] **Browser extension — parked** (chưa public; xử lý trước khi publish, không phải rào đợt này)

> Nguồn gốc: API ToS bản 16/06/2025 — https://www.etsy.com/legal/api/
