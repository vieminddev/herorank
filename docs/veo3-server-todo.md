# VEO3 — việc cần làm để AI Video Studio chạy end-to-end

> ✅ **ĐÃ LIVE** — verify end-to-end trên production 2026-06-26. 3 việc dưới đã xong (server nhận
> `startImageUrl`, public download, secrets set). Phần dưới (mục 4) là cải tiến BỎ WATERMARK.

---

## 4. (pathveo3) BỎ WATERMARK "Veo" góc phải-dưới — crop bằng FFmpeg trên server

Google Labs/Flow đóng logo "Veo" nhìn thấy ở **góc phải-dưới** mọi video. Cách sạch nhất: crop bỏ
rìa phải+dưới rồi scale về kích thước cũ (giữ nguyên tỉ lệ 9:16 / 16:9). **herorank KHÔNG cần đổi gì** —
chỉ cần file server trả về đã sạch. Máy VEO3 có FFmpeg native → nhanh, không ảnh hưởng mobile seller.

> ⚠️ Lưu ý: chỉ bỏ được watermark **NHÌN THẤY**. Watermark **SynthID vô hình** của Google vẫn còn (theo
> thiết kế, vô hình nên không ảnh hưởng listing) — không gỡ.

### Lệnh FFmpeg (chạy SAU khi Veo xuất file, trước khi serve `/api/media/download/:taskId`)
```bash
# Bỏ 10% rìa phải + 10% rìa dưới (nơi có logo), rồi scale về đúng kích thước gốc. Giữ nguyên tỉ lệ.
ffmpeg -y -i "<in.mp4>" \
  -vf "crop=iw*0.90:ih*0.90:0:0,scale=trunc(iw/0.90/2)*2:trunc(ih/0.90/2)*2:flags=lanczos" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an \
  -map_metadata -1 \
  -metadata title="VieRank AI" -metadata artist="VieRank" \
  -metadata comment="AI-generated video, created with VieRank AI (vierank.com)" \
  -metadata copyright="© 2026 VieRank" \
  "<out.mp4>"
```
- `-map_metadata -1` xoá metadata gốc; các `-metadata` gắn nhãn **VieRank AI** + giữ khai báo AI
  trung thực (đồng bộ với ảnh — herorank đã tự white-label metadata ảnh phía server). SynthID vô
  hình trong pixel vẫn còn (không gỡ).
- `crop=iw*0.90:ih*0.90:0:0` → lấy 90% khung tính từ góc trên-trái (0,0) ⇒ cắt 10% bên phải + 10% dưới.
- `scale=trunc(.../2)*2` → phóng về ~kích thước gốc, ép số chẵn (H.264 yêu cầu width/height chẵn).
- `-an` → bỏ tiếng (Veo không có tiếng + Etsy mute sẵn). `yuv420p` → tương thích rộng (Etsy/Safari).
- **0.90 đã VERIFY** (2026-06-26) trên 2 video thật ngang 1280×720 + dọc 720×1280: logo "Veo"
  nằm trong ~37px-từ-phải & ~48px-từ-đáy (cố định px cả 2 hướng). Ràng buộc lớn nhất = đáy-ngang
  (6.7%) → 10% dư biên an toàn cho CẢ 2 hướng. (0.92/8% quá sát đáy-ngang, đừng dùng.)
- **Tinh chỉnh:** logo vẫn ló → hạ `0.90`→`0.88`; muốn ít mất khung hơn → thử `0.91`.

### Tích hợp (Node, máy VEO3)
- Sau khi task `completed` và có `localPath`, chạy lệnh trên ghi ra file mới (vd `*_clean.mp4`), rồi cho
  endpoint download serve file `_clean` thay vì bản gốc. Ví dụ:
```js
const { execFile } = require('node:child_process');
const path = require('node:path');
function stripWatermark(inPath) {
  const out = inPath.replace(/\.mp4$/i, '_clean.mp4');
  return new Promise((res, rej) => {
    execFile('ffmpeg', ['-y','-i',inPath,
      '-vf','crop=iw*0.92:ih*0.92:0:0,scale=trunc(iw/0.92/2)*2:trunc(ih/0.92/2)*2:flags=lanczos',
      '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-an', out],
      (e) => e ? rej(e) : res(out));
  });
}
// → set localPath/downloadUrl trỏ tới `out` trước khi gửi webhook.
```
- Mất ~1–3s/clip 8s. Nếu muốn nhanh hơn: `-preset veryfast`.

### herorank
- **Không cần thay đổi.** Đã test: tải file → R2 → serve. File sạch tự động chảy qua.
- (Tùy chọn sau) nếu muốn bật/tắt theo từng job, herorank có thể gửi thêm cờ `config.stripWatermark` —
  nói nếu cần, mình thêm 1 field, deploy lại.

---

## 5. Image provider rotation (vtoken + VEO3) — ✅ LIVE (text→image VÀ reference/img2img)

herorank xoay **70% VEO3 / 30% vtoken** cho MỌI ảnh (env `VEO3_IMAGE_PERCENT`, đổi % rồi
`wrangler secret put VEO3_IMAGE_PERCENT` là xong — không cần redeploy). VEO3 async nhưng sync-wrap
(submit `/api/queue/image` → poll `/api/queue/status` → download, trong cùng request). Sinh nhiều
ảnh song song, **fallback sang vtoken** nếu VEO3 lỗi/timeout. Metadata cả 2 provider được
white-label "VieRank AI".

**Reference/img2img qua VEO3 — DÙNG ĐƯỢC** (không cần `startImageUrl`; field đúng là
`config.referenceImageName`). Luồng (như tdplaster `src/lib/server/jobs.ts`):
1. POST `/api/eval-main` (text/plain, **User-Agent KHÔNG được là python-urllib** → 403; herorank gửi
   `User-Agent: VieRank/1.0`) một script chạy `uploadImageIfNeeded(tempFile)` → set `global.<var>`.
2. Poll `/api/eval-main` body `global.<var>` tới khi có Google Media ID (~9s).
3. Submit `/api/queue/image` với `config.referenceImageName = <mediaId>`.
herorank upload ref **1 lần/request** rồi tái dùng cho các ảnh VEO3; upload fail → reference rơi về
vtoken. Verified 2026-06-26: ref lá vàng → output giữ đúng chiếc lá (~54s/ảnh end-to-end).
Code: `services/veo3Service.ts` (`uploadReferenceToVeo3`, `generateImageVeo3`), `routes/image.ts`.

---

## (Lịch sử) 3 việc gốc — ĐÃ XONG
> herorank đã build & deploy xong (2026-06-26, version a86df12e). Tool hiện trả **503 VIDEO_UNAVAILABLE**
> (không trừ credit) cho tới khi 3 việc dưới đây xong. Chi tiết thiết kế: `ai-video-studio-plan.md`.

## ✅ Checklist

### 1. (pathveo3) Cho `/api/queue/video` nhận ảnh seed qua URL — **việc cốt lõi**
- Hiện server chỉ nhận `config.startFilePath` = **đường dẫn file local** trên máy Windows chạy VEO3.
  Cloudflare Worker không đặt file lên máy đó được → cần thêm 1 field URL.
- **Thêm `config.startImageUrl`**: khi có, server tải URL đó về 1 file tạm, rồi đưa vào đúng luồng
  `startFilePath` → `uploadImageIfNeeded` → Google `/v1/flow/uploadImage` → `mediaId` (đã có sẵn).
- herorank sẽ gửi (videoMode `image`):
  ```json
  { "externalTaskId": "<jobId>", "prompt": "...",
    "config": { "videoMode": "image", "quality": "relaxed",
                "aspect": "portrait", "duration": "8s",
                "startImageUrl": "https://vierank.com/api/tools/video-jobs/<jobId>/seed?t=<token>" },
    "callbackUrl": "https://vierank.com/api/webhook/veo3?token=<VEO3_WEBHOOK_SECRET>" }
  ```
- `startImageUrl` là URL công khai, token-gated, trả về ảnh hero PNG — server cứ GET là tải được.
- ❗ Không có field này thì hero→video không chạy từ cloud (chỉ còn text→video).

### 2. (media.viemind.ai) Expose route tải file công khai
- Webhook trả `downloadUrl = http://localhost:19774/api/media/download/:taskId` (không với tới từ cloud).
- herorank đã tự lấy **path** rồi ghép vào `VEO3_SERVER_URL`, nên chỉ cần đảm bảo
  **`GET https://media.viemind.ai/api/media/download/:taskId`** truy cập được công khai và nhận 3 header
  auth (`x-api-key`, `api-key`, `Authorization: Bearer`).
- Nhớ: file **bị xoá sau 1 lần tải** (GC) — herorank tải đúng 1 lần về R2 ngay, OK.
- Không cần expose `/api/queue/status` (mình dùng webhook, không poll).

### 3. (herorank) Set 3 Workers secret + cho VEO3 gọi webhook về
```bash
# tại C:\DATA\viemid\herorank\app, có CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID trong env
npx wrangler secret put VEO3_SERVER_URL       # => https://media.viemind.ai
npx wrangler secret put VEO3_API_KEY          # => <VEO3 API key>
npx wrangler secret put VEO3_WEBHOOK_SECRET   # => 1 chuỗi mạnh bất kỳ (mình nhúng vào callbackUrl + verify)
```
- VEO3 phải POST được về `https://vierank.com/api/webhook/veo3?token=<VEO3_WEBHOOK_SECRET>`.
- Chưa set đủ → tool 503 (không trừ credit).

## Ghi chú thêm
- herorank gửi `aspect: "portrait" | "landscape"` và `duration: "5s" | "8s"`. Nếu enum của VEO3 khác,
  chỉnh mapping trong `src/lib/server/services/veo3Service.ts` + `src/lib/server/api/routes/video.ts`.
- Test seed trước khi nối thật: `node pathveo3/test-i2v-seed.js` (xem server có nhận URL/base64 seed không).
- Veo xuất 16:9 / 9:16 — Workers không FFmpeg-crop được; hiện ship native (Etsy chấp nhận). Nếu muốn
  crop chuẩn 1:2 / 2:1 thì xử lý phía VEO3/SvelteKit trước khi trả file.

## Liên quan
- `ai-video-studio-plan.md` — spec đầy đủ + những gì đã build phía herorank.
- `veo3-media-provider-plan.md` — API VEO3 + Path A/B (rotate provider cho ảnh).
