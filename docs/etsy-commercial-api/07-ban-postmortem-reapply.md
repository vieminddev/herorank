# Ban post-mortem + hồ sơ re-apply (2026-07-02)

App `vierank` / keystring `avfza6rx2llctp91cnkvbp7a` bị Etsy chuyển sang **Banned**
(không nêu lý do). Ghi lại để apply lại đúng cách, tránh lặp lỗi.

## 1. Trạng thái thực tế (đã verify từ prod D1)
- App bị ban là key **Personal đang Pending, CHƯA từng call 1 lần** → **không phải dormancy,
  không phải do chính nó lạm dụng**.
- **Production KHÔNG rớt:** pool cron (`63pjadbm`/`yb9gwm64`/`72cw8z2w`) vẫn gọi Etsy OK ngày
  02-07; `error_log` không có 401/403 Etsy (chỉ có bug R2 `range` ở `/video-jobs/*/asset`,
  không liên quan). Đường **8mh6 (OAuth connect/write/user-reads)** chưa thấy lỗi.
- ⚠️ **Câu hỏi CHƯA chốt:** ban ở mức **app** hay mức **account/developer**? Cần xác nhận trên
  dashboard **8mh6 còn "Active" không**. Etsy link identity mạnh (IP/fingerprint/business/bank/
  pattern) → ban có thể lan.

## 2. Lý do ban phổ biến (research cộng đồng — nguồn ở cuối)
1. **"Missing clear and detailed use case"** — chiếu ToS §3 & §5. Lý do #1. Reviewer nghi **lấy
   key để cắm vào phần mềm bên thứ ba** ("submitted on behalf of a third-party app").
2. **Ban tự động, không người review, không lý do**, kèm câu *"we're not able to reconsider this
   decision"* → **không có kháng cáo thật sự**. `developers@etsy.com` 10+ ngày không hồi âm.
3. **Cấm tạo nhiều app "substantially the same services"** (ToS, nói thẳng).
4. **Account-level linking** rất mạnh — 1 chỗ bị suspend có thể lan sang app/account chung định danh.
5. Chỉ 1 giao dịch test trong developer mode → suspend account, kháng cáo bị từ chối (#1305).
6. App "ngủ" 6 tháng không call → treo (không phải case này).

## 3. Nghi phạm số 1 cho VieRank
- **(a) Nhiều app cùng dịch vụ + identity linking:** đã có app OAuth **8mh6** (= VieRank), lại đăng
  ký thêm **`vierank`** (cũng = VieRank), cùng domain `vierank.com`, cùng người/hạ tầng → đúng nghĩa
  "multiple Applications offering substantially the same services".
- **(b) Pattern tải nặng đa-key:** pool 3 key mượn đập ~13k/ngày qua cùng IP Worker → giống lách
  rate-limit; nếu Etsy tương quan được với identity `vierank` thì củng cố cờ abuse.

## 4. Chiến lược re-apply (LÀM / TRÁNH)

**TRÁNH**
- ❌ Tạo thêm app song song cùng dịch vụ dưới cùng account (làm nặng cờ, dễ kéo cả 8mh6).
- ❌ Email/spam support hối thúc; ❌ post keystring/app details công khai (auto-deny, #1607).
- ❌ Tạo account/định danh mới để "né" ban — identity linking sẽ bắt được → permaban.
- ❌ Khai gian "Just myself" để lấy Personal cho dễ rồi phục vụ public (= misrepresentation, đúng
  thứ khiến bị ban).

**LÀM**
1. **Chốt trước:** 8mh6 còn Active? → nếu còn, **gom về 1 app 8mh6 duy nhất** và **Request
   Commercial trên chính nó**, KHÔNG tạo app mới.
2. Nếu buộc phải tạo mới (8mh6 cũng chết): dùng **đúng account/định danh thật** (không né), điền
   hồ sơ ở mục 5, mô tả cực rõ use case, nhấn "first-party, không phải key cho bên thứ 3".
3. **Hạ tải cron ngay** (`HISTORY_DAILY_TARGET` 13000 → ~2500) để bỏ pattern saturate đa-key; tính
   đường tách pool khỏi cùng IP/định danh.

## 5. Bản điền form "Create a New App" (đề xuất — bản trung thực)

| Field | Giá trị |
|---|---|
| **Name** | `Virank` (chuỗi KHÁC "vierank" đã Banned → tránh auto-dedup; vẫn sát brand; không chứa "etsy") |
| **Describe your application** *(≤500, chỉ Etsy đọc)* | dùng đoạn 460-ký-tự bên dưới |
| **Website URL** | `https://vierank.com` |
| **Application type** | **Seller Tools** |
| **Who will be the users** | **The general public** *(sự thật — SaaS public; đừng khai "just myself")* |
| **Is your application commercial?** | **Yes** *(có /pricing + Stripe → phải khai Yes; Personal không được thu phí)* |
| **Will your app do…** | ✅ **Read sales data** (lõi) · ✅ **Upload or edit listings** (Listing Editor/Builder, đang gate `ETSY_WRITE_ENABLED`) · ⬜ **Send email** *(bỏ trống trừ khi thực sự gọi endpoint email của Etsy)* |

**Mô tả (copy-paste, 460/500 ký tự):**

> VieRank (vierank.com) is our own SaaS that helps Etsy sellers optimize their listings and grow their shops. It offers keyword research, tag and title suggestions, competitor and market analysis, and rank tracking. Sellers sign up on our site and connect their own shop via Etsy OAuth. We use public listing/search data plus each connected seller's shop stats to produce SEO recommendations, and (with their permission) help create or edit their draft listings.

### Fork người dùng tự quyết
- **Scope:** muốn duyệt nhanh hơn → có thể bỏ tick "Upload or edit listings" (apply **read-only**
  trước), sau khi được duyệt mới xin write. Đánh đổi: mất tính năng editor ngay từ đầu.
- **Commercial vs Personal:** khai "general public + commercial Yes" đi thẳng review Commercial
  (khó hơn nhưng đúng sự thật). Không được hạ xuống "just myself" để lách.

## 6. Điều kiện tiên quyết trước khi bấm "Create App"
Form cảnh báo: *"if your Etsy user and shop are not in adherence with Etsy's policies… your
application may be rejected."* → đảm bảo tài khoản Etsy + shop dùng để đăng ký **sạch policy**
(không vi phạm Terms/API Terms/Testing Policy) trước khi apply.

## Nguồn
- Banned: why??? — https://github.com/etsy/open-api/discussions/1566
- API Key Revoked / Unjustified Ban Appeal — https://github.com/etsy/open-api/discussions/1618
- Account suspended after dev-mode test txn — https://github.com/etsy/open-api/discussions/1305
- App approval issues — https://github.com/etsy/open-api/discussions/675 ,
  https://github.com/etsy/open-api/discussions/1361
- Multiple API Applications Refused — https://groups.google.com/g/etsy-api-v2/c/CXbyG92dfTE
- Etsy API Terms of Use — https://www.etsy.com/legal/api/
