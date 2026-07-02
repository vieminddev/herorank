# 🦋 Linh vật bướm VieRank — hệ animation

Con bướm là **linh vật** của VieRank. Ý nghĩa thương hiệu: **biến đổi / lột xác / trưởng thành** →
khớp với câu chuyện "shop Etsy lột xác, leo hạng". Đây là chất liệu kể chuyện mà đối thủ (công cụ SEO
khô khan) không có. Nguyên tắc xuyên suốt: **ít mà chất**, tinh tế, có chủ đích, **luôn tôn trọng
`prefers-reduced-motion`**.

Logo dùng chung ở mọi nơi qua `static/vierank-logo.png` (PNG trong suốt). Mọi `<img alt="VieRank">` tự
nhận animation hover.

---

## ✅ Đã làm (live)

| Hiệu ứng | File | Ghi chú |
|----------|------|---------|
| **Hover vỗ cánh ở logo** (toàn site) | `src/app.css` (`@keyframes vr-flutter`, target `img[alt="VieRank"]`) | CSS thuần, reduced-motion safe |
| **ButterflyLoader** (chờ AI) | `src/lib/components/ui/ButterflyLoader.svelte` + `.bfl*` trong `app.css` | bướm vỗ cánh + bay bổng; thay spinner ở Image/Video Studio lúc generating |
| **Favicon động khi xử lý** | `src/lib/faviconAnimator.ts` | canvas ~11fps, ref-count, reduced-motion no-op, dọn sạch onDestroy; start/stop wired ở Image + Video Studio |
| **Sparkle khi hoàn thành** | `src/lib/components/ui/SparkleBurst.svelte` | nổ đốm teal+vàng 1 lần; gắn ở hero options reveal, set complete, video done |
| **Vỗ cánh tách rời 2 cánh (SVG)** | `src/lib/components/ui/MascotLogo.svelte` | logo SVG, clip-path trái/phải, vỗ cánh thật (hover + always); thay PNG toàn site |
| **Metamorphosis ở hero** | `src/lib/components/ui/CocoonToButterfly.svelte` | kén→bướm + rank #84→#2 + trend rising + đũa thần. **Gói A:** reduced-motion → khung tĩnh "after"; IntersectionObserver + visibilitychange dừng khi off-screen/tab ẩn |
| **Mascot cheer (thắng lợi thật)** — *gói B* | `src/lib/mascotCheer.ts` + `src/lib/components/ui/MascotCheer.svelte` | toast bướm + sparkle, auto-dismiss, reduced-motion safe; mount 1 lần ở root layout. Trigger: **shop connected** (connections page), **SEO score vượt ≥60 "Strong"** + **lưu listing thành công** (listing-editor) |
| **404 "Lost butterfly"** | `src/routes/+error.svelte` | bướm lạc bay lượn theo vệt đường đứt nét (chỉ nhánh 404; 5xx giữ TriangleAlert); reduced-motion → đứng yên |
| **Empty-state có mascot chỉ đường** | `ConnectShopEmpty.svelte` (toàn site) + `ToolEmpty.svelte` (prop `mascot`, opt-in) | bướm halo bồng bềnh; bật ở image-studio, video-studio, listing-editor, listing-analyzer (first-touch/activation) |
| **Bướm trong email giao dịch** | `src/lib/server/services/email.ts` | PNG `/vierank-logo.png` tĩnh ở header reset-password + verify email; URL lấy từ `originOf(link)` (không hardcode domain); wordmark là fallback khi client chặn ảnh |
| **Bướm parallax nền hero** | `src/routes/+page.svelte` | 3 con bướm trắng mờ (opacity 0.25/0.22/0.22) trôi ngược scroll (desktop-only) + 1 con bay quỹ đạo; cập nhật `scrollY` **rAF-throttled** + **freeze khi reduced-motion**. **Bướm lắc lư xoay ±5°** (`.bfly-wobble`) |
| **Connector dẫn hướng "How it works"** | `+page.svelte` + `.connector-*` trong `app.css` | luồng sáng teal chảy dọc qua 3 step icon khi cuộn tới (`.in-view`); reduced-motion → hiện full tĩnh |
| **Spotlight cột VieRank** | `+page.svelte` (`.comparison-table`) | hover hàng → ô cột 2 (VieRank) phát sáng gradient + ring teal |
| **Fix bug reduced-motion** | `+page.svelte` onMount | reduced-motion users từng bị ẩn toàn bộ section `.reveal` (IO skip → không có `.in-view`); nay add `.in-view` ngay cho mọi `.reveal` |

---

## ⏳ Còn lại — CẦN VECTOR HÓA LOGO SANG SVG TRƯỚC

Hai hiệu ứng "đỉnh" nhất phụ thuộc vào việc có **logo dạng SVG** (các path tách rời, scale vô hạn):

### 1. Metamorphosis ở hero — *signature nổi bật nhất*
Animation **kén / biểu đồ thấp → nở thành bướm + đường rank đi lên**. Đây là khoảnh khắc kể đúng USP
"lột xác & leo hạng" — thứ làm VieRank khác biệt hẳn đối thủ. Nên làm bằng **SVG path morphing** hoặc
**Lottie** (After Effects → JSON), đặt 1 chỗ duy nhất ở hero trang chủ.

### 2. Vỗ cánh tách rời 2 cánh (đẹp nhất)
Hiện hover chỉ "squash" cả con bướm (vì là PNG). Có **SVG** thì tách path **cánh trái / cánh phải** để
animate riêng → vỗ cánh thật, mượt và sống động hơn nhiều.

> **Điều kiện:** cần file **SVG** của logo. Cách lấy: vector hóa `app/logo.png` (hoặc
> `static/vierank-logo.png`) qua **vectorizer.ai** (hoặc Illustrator → Image Trace) → export SVG.
> Khi có SVG, thay `vierank-logo.png` → `.svg` và triển khai 2 hiệu ứng trên.

---

## 🟢 Làm được NGAY với PNG (không cần SVG)

- **Bướm bay parallax ở nền hero**: 2–3 con bướm mờ (opacity ~22–25%) trôi chậm theo cuộn → tạo chiều sâu,
  không che nội dung.
- **Bướm bay theo quỹ đạo** ngang hero (CSS animation theo path đơn giản / `offset-path`).
- Mở rộng **sparkle** sang các "win" khác (rank cải thiện, kết nối shop thành công…).

---

## Thứ tự đề xuất tiếp theo
1. **Bướm parallax nền hero** (PNG, làm ngay) — tăng độ "sống" cho trang chủ.
2. Vector hóa logo → **SVG**.
3. **Vỗ cánh tách rời 2 cánh** (cần SVG).
4. **Metamorphosis hero** (SVG/Lottie) — để cuối vì công phu nhất, nhưng impact cao nhất.

Liên quan: logo & favicon ở `static/`; brand teal trong `app.css` (`--teal`).
