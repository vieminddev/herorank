# PM Decisions — Phase 5 (chốt 2026-06-12)

- **Launch scope:** Soft/closed beta TRƯỚC, dùng mock EtsyClient + honesty labels (estimated badge). KHÔNG chờ Etsy commercial key. Khi key duyệt → swap nguồn sau seam, không đổi API. → rate limit có thể chặt hơn (beta nhỏ); taxonomy node-id thật (C1/C2) là blocked-on-key, chỉ làm seam.
- **Observability:** Cloudflare native — Workers Logs + Analytics Engine. KHÔNG Sentry. → O1/O2/O3 dùng structured console logging + Analytics Engine dataset, không thêm SDK ngoài.
- **Scope Phase 5:** TOÀN BỘ P0 + P1 + P2 (33 item). Làm kỹ nhất.
- **Prod infra:** CHƯA có gì (Cloudflare account, domain, Stripe live keys, price IDs đều chưa). → L1 deploy là hướng dẫn từng bước khi tới; phần lớn Phase 5 làm + verify trên local/mock, deploy thật là bước cuối cần user cung cấp account/keys.

## Hệ quả thực thi
- Đa số việc làm + test được trên local/mock ngay. Chỉ L1 (deploy prod), L2 (prod smoke), Stripe live, custom domain là blocked-on-user-infra → gom vào cuối, làm thành checklist + script, user chạy khi sẵn account.
- Điểm nghẽn file chung (app.ts, hooks.server.ts, wrangler.jsonc, billingService.ts) → serialize theo thứ tự BA đề xuất.
