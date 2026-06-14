---
name: stripe-on-workers
description: Wiring the Stripe Node SDK (v22.x) to run on Cloudflare Workers, and a TS gotcha with apiVersion.
metadata:
  type: feedback
---

Running `stripe` Node SDK on Cloudflare Workers (verified with stripe 22.2.0).

**Why:** the SDK defaults to Node's `http` module and sync Node crypto, neither of which exist on Workers — naive use crashes at runtime, and a wrong `apiVersion` cast fails type-check.

**How to apply:**
- Construct with `new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })` so all calls go through global `fetch`.
- Webhook verification MUST be `await stripe.webhooks.constructEventAsync(raw, sig, secret)` (Web Crypto, async). The sync `constructEvent` throws on Workers.
- Read the webhook body with the framework's RAW text accessor (Hono: `c.req.text()`) BEFORE any JSON parse — signature hashes exact bytes.
- Do NOT pass `apiVersion` as a hand-written string literal cast: `Stripe.LatestApiVersion` is NOT under the `Stripe.` namespace in v22 (it's `LatestApiVersion` exported from `stripe/lib`). Simplest correct path: OMIT `apiVersion` — the SDK is pinned to one version (22.2.0 → `2026-05-27.dahlia`) and that's exactly what the generated types expect.
- `Stripe.Subscription.current_period_end` moved onto the subscription ITEM in recent API versions; read it defensively from `sub.items.data[0].current_period_end` with a fallback to the legacy top-level field.
