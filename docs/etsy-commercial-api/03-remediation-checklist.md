# Checklist hợp lệ hoá — trạng thái

Trạng thái: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong. Cập nhật khi tiến hành.

## Bắt buộc trước/để được duyệt Commercial

- [!] **A. App `vierank`/`avfza…` → BANNED (2026-07-02)** — key Personal đang Pending bị Etsy ban,
  KHÔNG nêu lý do. Nó chưa từng call → production không rớt (pool cron + 8mh6 vẫn chạy). Nghi phạm:
  "multiple apps same service" (8mh6 + vierank cùng = VieRank) + pattern saturate đa-key + identity
  linking. **Kế hoạch nạp `avfza` vào `ETSY_API_KEYS` HỦY.** Post-mortem + bản điền form re-apply +
  do/don't ở **`07-ban-postmortem-reapply.md`**. TODO trước re-apply: (1) verify 8mh6 còn Active?
  (2) ✅ ĐÃ hạ `HISTORY_DAILY_TARGET` 13000→**7000** (deploy 2026-07-02, version 7af9d20c). Lý do sâu
  hơn "saturate optics": bộ đếm nội bộ reset theo ngày-lịch UTC nhưng Etsy dùng **sliding-window 24h**
  (không reset nửa đêm) → burst cuối ngày UTC vẫn bị Etsy đếm sang sáng hôm sau, khiến pool "exhausted"
  giả (best-sellers cron 00:45 chết 07-02 dù bộ đếm mới ~1.5k/key). 7000/3key ≈ 2333/key (~½ cap
  rolling ~4500) chừa headroom cho best-sellers/trends.

- [x] **B. Reframe "model training"** *(2026-07-01 — xong)*
  - Đã đổi "future model/ML training" → **"operational history / backfill / read-path continuity"** ở:
    `src/lib/server/env.ts`, `services/etsy/retention.ts`, `wrangler.jsonc` (R2 comment), memory
    `cron-data-strategy-implemented.md`.
  - Giữ nguyên: `/privacy` dòng "not to train models on your behalf" (câu HONEST, có lợi).
  - Lưu ý: các chỗ này là **comment nội bộ + config**, Etsy KHÔNG thấy source → không cần redeploy
    riêng cho compliance (đã sạch ở phần user-visible).

- [~] **C. Cập nhật Application Terms + Privacy** *(🟡 — draft ở file 05, code ĐÃ ÁP 2026-07-01)*
  - [x] Khối warranty **DISCLAIMER** chuẩn Etsy trong `/terms` mục 4 ("THIS APPLICATION IS SOLELY PROVIDED BY VIERANK...").
  - [x] **Controller/processor** thêm ở `/terms` mục 2 (Data Roles) + `/privacy` mục 2 (Data Roles) — đáp ứng Section 4.
  - [x] **Retention/caching honest** (`/privacy` mục 2) + link revoke `etsy.com/your/apps` (`/privacy` mục 3).
  - [x] Sửa câu Privacy sai thực tế → "Market & Calibration Data" (lưu chỉ số cấp shop công khai, không lưu giao dịch buyer).
  - [x] **Click-through enforceable** — 3 lối vào đều được phủ:
    - Signup: checkbox bắt buộc, gate cả nút email + Google (`auth/signup`).
    - Login "Continue with Google" (tạo account lần đầu): dòng consent "By continuing with Google
      you agree to Terms/Privacy" (`auth/login`) — bịt kẽ hở đăng ký qua Google bỏ qua checkbox.
    - Connect shop (OAuth): dòng "By connecting, you agree to Terms/Privacy + controller/processor"
      (`settings/connections`) — đáp ứng §4 "Application Terms with each seller".
  - Nguồn `src` type-check sạch.

- [x] **J. 🔴 Gỡ tuyên bố "Partner/Certified" sai sự thật** *(2026-07-01 — vi phạm "misrepresent
  affiliation" + mâu thuẫn disclaimer)*: sửa 4 chỗ — `auth/signup:249` + `auth/login:240`
  ("Official Etsy API Partner" → "Uses Etsy's official API"); landing FAQ ("certified Etsy
  Integration Partner" → dùng official API + "not endorsed or certified"); landing badge
  ("Official API Partner" → "Secure OAuth Access"). Grep lại: không còn claim partner/certified.

- [x] **K. Vòng rà 2 (2026-07-01) — social proof bịa + tên extension**:
  - Landing `:527` "Trusted by ... 12,000+ Etsy shops" + "4.9/5 Rating" → copy trung thực
    ("Every estimate honestly labeled · Built for Etsy sellers · free to start").
  - Testimonial bịa ở signup (Mai Le/PaperMoonStudio) + login (Sarah Jenkins/SpeckledClayCo·12k) →
    thay bằng "value statement" trung thực, không gán người thật.
  - Mockup `:1098` "Reaching Page 1." → "improves Page 1 potential." (bỏ ngụ ý guarantee ranking).
  - Extension name "VieRank — Etsy SEO" → "VieRank — SEO for Etsy" (nominative, tránh trademark/mìn).
  - Còn lại grep sạch: "official OAuth/API" là mô tả factual; disclaimer đúng. Nguồn type-check sạch.
  - ⏳ *(tùy chọn, chưa sửa)* footer auth "Fully Compliant & Secure" hơi mạnh — cân nhắc làm nhẹ sau.

- [ ] **D. Verify support email** *(🟡)* — hiển thị email giám sát được cho seller (ToS Section 3).

- [ ] **E. Request Commercial Access** — SAU khi Personal được duyệt, vào app → "Request Commercial
  Access" (dùng App Purpose ở file 02). Personal KHÔNG được thu phí + giới hạn ~5 shop; Commercial mới
  mở khoá: phục vụ mọi seller + thu phí + hợp thức mục đích analytics. *(Cần user.)*
  - ⚠️ **Quy trình app-key đang được Etsy revamp (GitHub #1607, openapi-support bot):**
    `developers@etsy.com` **KHÔNG** hỗ trợ đơn → đừng email thúc/hỏi. **KHÔNG post** app details /
    keystring ra nơi công khai (GitHub/forum) → auto-DENY. Cơ chế: dùng nút in-app + **chờ**.
    Rate-increase qua email cũng coi như không phản hồi lúc này → tạm dùng 5 QPS/5K QPD mặc định.

## ⏸ Parked (chưa liên quan)

- [⏸] **F. Browser extension — PARKED (chưa public)** — extension MV3 đọc DOM trang Etsy sẽ dính §5
  ("use or promote... browser extensions... unless authorised in writing") KHI publish. Hiện **chưa
  public** nên chưa áp dụng, không phải rào cho đợt apply này. Xử lý **trước khi publish**: xin phép
  văn bản · hoặc chỉ render dữ liệu từ API VieRank (không đọc DOM Etsy).

## Vận hành/readiness (không chặn apply)

- [ ] **G. Quy trình Data Breach** — báo `dpo@etsy.com` + seller trong **24h** (ToS Section 7).
- [ ] **H. Giữ cron ở mức tối thiểu cần thiết** — target/discovery breadth theo **nhu cầu
  feature thật**, tránh quét thừa (tránh vi phạm "minimum data / excessively burden").

## Đã đạt (không cần làm)
- [x] Trademark disclaimer đúng nguyên văn (footer + /terms + /privacy).
- [x] Caching freshness: listing 6h / khác 24h.
- [x] Pricing không charge cho thứ Etsy cấp free.
- [x] Dữ liệu thị trường qua public listing-search API + public fields (không scrape HTML Site).
