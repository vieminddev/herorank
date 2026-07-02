# Ngôn ngữ Privacy/ToS — tham chiếu đối thủ đã được Etsy duyệt

Mục tiêu: dùng đúng câu chữ mà eRank/Marmalead/Alura (đều đang xài Etsy API hợp lệ) dùng, để
VieRank **thực sự** đáp ứng yêu cầu Etsy ToS — không phải vỏ bọc. Kèm cảnh báo chỗ **KHÔNG được
sao chép** vì sẽ thành tuyên bố sai với hệ thống VieRank.

Nguồn: eRank ToS `erank.com/legal/terms-of-service` + Privacy `erank.com/legal/privacy-policy`;
Marmalead `marmalead.com/privacy/`; Alura `alura.io/privacy-policy`.

---

## A. Trademark / "not endorsed" — ✅ VieRank ĐÃ CÓ (đúng chuẩn)
- eRank: *"'Etsy' is a trademark of Etsy, Inc. This app uses the Etsy API but is not endorsed or certified by Etsy."*
- Marmalead: *"The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc."*
- **VieRank** (/terms + /privacy + footer): *"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."* → giữ nguyên.

## B. Data controller vs processor — ➕ NÊN THÊM (đáp ứng Etsy ToS Section 4)
Etsy ToS Section 4 bắt buộc: *"you act as a **service provider** to the applicable Etsy seller
and will process such data only to fulfil the services..."*. eRank hiện thực bằng câu:
- eRank: *"you are the **data controller**, and we are the **data processor** for any content collected from Third-Party Services on your behalf"*

**Draft cho VieRank (thêm vào ToS mục "Connection to Etsy" + Privacy):**
> When you connect a third-party service such as Etsy, **you are the data controller and VieRank
> acts as the data processor** for any content we access from that service on your behalf. We
> process this data solely to provide the VieRank services you request, in accordance with these
> Terms, our Privacy Policy, and applicable privacy laws.

## C. Warranty disclaimer chuẩn Etsy — ➕ NÊN THÊM (Etsy ToS Section 3 yêu cầu gần nguyên văn)
Đối thủ chỉ có "AS-IS" chung (eRank: *"ERANK OFFERS THE SERVICES... 'AS-IS' AND MAKES NO
REPRESENTATIONS OR WARRANTIES"*). Nhưng Etsy ToS Section 3 đòi khối nêu **rõ Etsy KHÔNG phải là
nhà phát triển**. VieRank hiện chỉ có "as is / as available" → nên thêm khối chuẩn:

**Draft (thêm vào ToS mục 4 Disclaimer):**
> DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY VIERANK ("THE APPLICATION DEVELOPER"). YOU
> ACKNOWLEDGE THAT ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE
> THE APPLICATION SERVICE, AND MAKE NO WARRANTIES OF ANY KIND WITH RESPECT TO THE APPLICATION OR
> DATA ACCESSED THROUGH IT.

## D. Retention / caching — ➕ NÊN THÊM (bản HONEST, xem cảnh báo dưới)
Etsy: không cache "longer than reasonably necessary" + freshness listing 6h / khác 24h.

**Draft (thêm vào Privacy mục 2):**
> We cache Etsy data only as long as reasonably necessary to provide the Service, and refresh it
> in line with Etsy's freshness requirements — listing content within 6 hours, and other Etsy
> content within 24 hours, of the corresponding information on Etsy. Aggregated market metrics we
> derive (such as trend and sales-velocity history) are retained to power analytics features and
> are pruned under our retention schedule.

## E. Không bán dữ liệu — ✅ VieRank ĐÃ CÓ
- eRank: *"Under no circumstances, do we sell your Personal Information to any third party."*
- Alura: *"Alura does not sell, trade, or transfer User Information to third parties."*
- VieRank có: *"We do not sell, rent, or trade your personal or shop data..."* → giữ.

## F. Revoke access — ➕ NÊN THÊM link trực tiếp
- eRank: *"You can revoke eRank's access to your Etsy data any time by visiting https://www.etsy.com/your/apps."*
- VieRank hiện chỉ nói "Apps tab" → thêm URL rõ:
> You can revoke VieRank's access to your Etsy data at any time by visiting https://www.etsy.com/your/apps.

## G. Limitation of liability cap — ➕ TÙY CHỌN (parity với đối thủ)
- eRank: *"OUR TOTAL LIABILITY... WILL BE NO MORE THAN THE TOTAL AMOUNT PAID BY YOU TO ERANK
  DURING THE THREE (3) MONTHS PRECEDING THE EVENT..."* → cân nhắc thêm mức trần tương tự.

---

## ⚠️ HAI CHỖ KHÔNG ĐƯỢC SAO CHÉP (sẽ thành tuyên bố SAI với hệ thống VieRank)

1. **Marmalead: *"We do not store your listing information as it is against the Etsy API Terms of
   Use to do so."*** → VieRank **CÓ** lưu dữ liệu phái sinh (`metric_series` review-cadence theo
   tháng, `shop_pulse` sold_count theo ngày). Nếu copy câu này = nói dối, dễ bị bắt khi Etsy audit.
   Dùng bản HONEST ở mục D thay thế.

2. **Privacy hiện tại của VieRank (mục 1): *"This data is aggregated and anonymized immediately;
   individual transactions are never saved."*** → cần rà lại: `shop_pulse`/`metric_series` lưu
   **sold_count/review theo TỪNG shop qua thời gian** (định danh theo shop, KHÔNG anonymized ngay).
   Câu "aggregated and anonymized immediately" đang **không khớp** hệ thống. Sửa thành mô tả đúng:
   lưu chỉ số cấp shop (public) để dựng lịch sử xu hướng/velocity, không lưu từng giao dịch cá nhân
   của buyer. → Tránh để Etsy thấy policy nói một đằng, DB làm một nẻo.

---

## Tổng hợp: VieRank cần THÊM/ SỬA gì
| Mục | Trạng thái | Việc |
|---|---|---|
| A. Trademark notice | ✅ có | giữ |
| B. Controller/Processor | ❌ thiếu | thêm (ToS + Privacy) |
| C. Warranty disclaimer chuẩn Etsy | ⚠️ chỉ "as is" | thêm khối đầy đủ |
| D. Retention/caching (honest) | ❌ thiếu | thêm Privacy mục 2 |
| E. Không bán dữ liệu | ✅ có | giữ |
| F. Revoke link etsy.com/your/apps | ⚠️ mơ hồ | thêm URL |
| G. LoL cap | — | tùy chọn |
| ⚠️ #2 "anonymized immediately" | 🔴 sai thực tế | **sửa gấp** cho khớp DB |
| Support email | ✅ có (legal@/support@) | giữ |
