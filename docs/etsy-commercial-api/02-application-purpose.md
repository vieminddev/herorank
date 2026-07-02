# Application Purpose & câu trả lời form đăng ký

Dùng khi tạo/nâng cấp app tại `etsy.com/developers/your-apps` → **Request Commercial Access**.

## Draft "Application Purpose" (dán vào form)

> VieRank is a commercial SEO and analytics tool that helps Etsy sellers grow their shops.
> Sellers connect via OAuth to read their own listings, shop stats, and optionally create or
> edit draft listings. VieRank also uses Etsy's public listing-search data to provide keyword
> research, market-trend insights, and competitor benchmarking, so sellers can optimize their
> titles, tags, and pricing. We comply with Etsy's caching policy (listing data refreshed
> within 6 hours, other data within 24 hours), display the required "not endorsed or certified
> by Etsy" notice, and keep our branding clearly distinct from Etsy. Core research tools that
> surface Etsy data are free; we charge only for optional AI content-generation features that
> do not integrate with the Etsy API.

Vì sao đoạn này an toàn: nhấn **lợi ích seller**, **OAuth consent**, **public search hợp lệ**,
tuân thủ **caching + disclaimer**, **pricing** không thu tiền cho thứ Etsy cấp free — và né hết
các mìn reject bên dưới.

## Câu trả lời các trường thường gặp
- **App name**: `VieRank` (KHÔNG chứa chữ "etsy" → tránh auto-reject).
- **App URL / homepage**: https://vierank.com
- **Personal or Commercial**: Commercial (phục vụ mọi seller + thu phí).
- **OAuth scopes cần**: `listings_r`, `shops_r`, `transactions_r` (đọc); `listings_w` (tạo/sửa
  draft, optional, gated `ETSY_WRITE_ENABLED`). KHÔNG xin `listings_d` (delete) nếu chưa cần.
- **Support email**: (điền email giám sát được — bắt buộc theo ToS Section 3).

## ⚠️ Các "mìn" làm reject (tránh tuyệt đối)
- ❌ Chữ **"etsy" trong TÊN app** → auto reject. (Slug nội bộ `etsy-trends`/URL không tính, nhưng
  tên đăng ký với Etsy phải là "VieRank".)
- ❌ Khai **"third-party access"** → reject. Khai là **app của bạn dùng Etsy API trực tiếp**.
- ❌ Mô tả **mơ hồ** → reject/chậm. Phải cụ thể lợi ích seller.
- ❌ Nghe giống **circumvent checkout / divert sales / mimic Etsy** → reject.
- ❌ Nhắc tới **scraping / AI training** → tự đưa vào diện cấm.

## Chiến thuật nộp
1. (Tùy chọn) Xin **Personal trước** cho dễ duyệt, rồi **upgrade Commercial**.
2. Nộp **sớm** — thực tế duyệt **2–3 tuần** (có khi 20+ ngày), support chậm. Danh nghĩa 24–48h.
3. Trước khi nộp: đảm bảo homepage vierank.com đã có disclaimer + phân biệt brand rõ (đã có).

## Yêu cầu bắt buộc phải hiển thị trong app (ToS)
- Disclaimer nguyên văn: *"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses
  Etsy's API, but is not endorsed or certified by Etsy."* → **đã có** ở footer + /terms + /privacy.
- Warranty DISCLAIMER block trong Application Terms (xem file 03, cần verify).
- Support email cho seller.
