# Product

## Register

product

## Users

Người bán trên **Etsy** — chủ shop handmade, vintage, print/digital — từ người mới mở shop tới seller chuyên nghiệp quản lý hàng trăm listing. Bối cảnh sử dụng: ngồi tối ưu listing để lên hạng tìm kiếm, nghiên cứu keyword/ngách, phân tích shop đối thủ, theo dõi thứ hạng. Họ không phải dân kỹ thuật/SEO chuyên sâu — cần công cụ biến dữ liệu phức tạp thành hành động rõ ràng. Tác vụ chính mỗi màn: **một việc cụ thể** (sinh title/tag, phân tích 1 listing/shop, tìm ngách) → ra kết quả dùng được ngay.

## Product Purpose

**VieRank** là bộ công cụ SEO cho người bán Etsy: 5 công cụ sinh nội dung bằng AI (title, description, tag, keyword, chat trợ lý) + 7 công cụ dữ liệu Etsy (phân tích listing/shop, rank check, niche finder, best sellers, trends, reputation check). Mục tiêu: giúp seller **lên hạng và bán nhiều hơn** mà không cần là chuyên gia SEO. Thành công = seller tạo listing tối ưu nhanh hơn, tìm được ngách tốt, và tin vào số liệu công cụ đưa ra. Mô hình SaaS có gói trả phí + hệ thống credits.

## Brand Personality

Ba từ: **Tin cậy · Hiện đại · Ấm áp**.

- **Tin cậy & chuyên nghiệp**: cảm giác một SEO platform data-driven nghiêm túc. Số liệu đáng tin, minh bạch — ước lượng được gắn nhãn rõ ("estimated"), không giả vờ là sự thật tuyệt đối.
- **Hiện đại & khác biệt**: nổi bật so với eRank/Marmalead (cũ kỹ, rối) — trẻ trung, tinh gọn, phân cấp thị giác mạnh.
- **Thân thiện & khích lệ**: ấm với người bán handmade/creative, dễ tiếp cận, không đáng sợ. Nghiêm túc nhưng không lạnh lùng.

Bản sắc thị giác lấy cảm hứng từ **Starbucks** (xem [design.md](./design.md)): hệ xanh lá thương hiệu nhiều tầng, typography làm chủ đạo (kiểu SoDoSans, tracking âm nhẹ), hình khối bo tròn (button pill, card 12px), độ nổi (elevation) kiềm chế. **Lưu ý quan trọng:** giữ bản sắc XANH + typography của Starbucks, nhưng **KHÔNG dùng nền kem/cream** (#f2f0eb) làm canvas — đó là màu mặc-định-AI-2026 mà ta chủ động tránh. Thay bằng off-white sạch (chroma ~0) hoặc neutral hơi ngả xanh thương hiệu; "sự ấm" đến từ màu xanh + chữ + ảnh, không phải nền be.

## Anti-references

KHÔNG được trông giống:

- **SaaS generic / AI-slop**: gradient tím-xanh, template hero-metric (số to + label nhỏ), grid card giống hệt nhau lặp vô tận, eyebrow chữ hoa nhỏ tracking rộng trên mọi section, marker số 01/02/03. Toàn bộ "absolute bans" của impeccable.
- **Nền kem/cream warm-neutral** (paper/sand/parchment) — màu mặc định bị AI lạm dụng. Tránh cả khi redesign theo Starbucks.
- **Dashboard rối, nhồi số** kiểu eRank/Marmalead: bảng số dày đặc choáng ngợp, thiếu phân cấp thị giác.
- **Quá vui nhộn, thiếu nghiêm túc**: màu mè/emoji quá đà làm mất cảm giác tin cậy của một công cụ phân tích.

## Design Principles

1. **Tin cậy qua minh bạch** — mọi con số ước lượng phải gắn nhãn "estimated" rõ ràng; không bao giờ trình bày phỏng đoán như sự thật. Sự trung thực là nền tảng của niềm tin (đối thủ thường mập mờ chỗ này).
2. **Bản sắc nằm ở xanh + chữ, không ở nền** — màu xanh Starbucks và typography mang toàn bộ "feel"; canvas giữ trung tính sạch. Không mượn sự ấm áp từ nền kem.
3. **Rõ hơn đối thủ, không nhồi nhét** — phân cấp thị giác mạnh, mỗi màn một tác vụ chính. Người dùng luôn biết nhìn vào đâu trước. Chống "dashboard choáng ngợp".
4. **Chuyên nghiệp nhưng ấm** — nghiêm túc và đáng tin với dân chuyên, nhưng thân thiện với người mới. Không lạnh lùng, cũng không vui nhộn quá đà.
5. **Nhanh, đúng việc** — power-tool: vào là làm được việc ngay, kết quả dùng được tức thì. Tốc độ và sự rõ ràng quan trọng hơn hiệu ứng phô trương.

## Accessibility & Inclusion

**WCAG 2.1 AA** (chuẩn ngành cho SaaS thương mại):
- Contrast body text ≥4.5:1, large text ≥3:1, placeholder cũng ≥4.5:1 (không dùng xám nhạt "cho sang").
- Keyboard navigation đầy đủ, focus-visible rõ ràng.
- `prefers-reduced-motion`: mọi animation phải có phương án crossfade/tức thì.
- Cân nhắc color-blind: không dùng riêng màu để truyền thông tin trạng thái (score high/medium/low cần kèm nhãn/icon, không chỉ xanh/vàng/đỏ).
