# Pricing review — COGS analysis & restructure proposal

_Prepared 2026-06-29. Companion to the live pricing page. The copy wins (credit conversion
examples, Enterprise framing) are already shipped. The money-sensitive items below need your
real provider costs before we touch live billing/credit values._

---

## Current structure

| | Free | Side $7.99→5.99 | Business $12.99→9.99 | Enterprise $49.99→29.99 |
|---|---|---|---|---|
| Credits | 30 (once) | 750/mo | 3,000/mo | 9,000/mo |
| Shops | 1 | 3 | 10 | 25 |
| Tracked | 0 | 10 | 50 | 200 |
| Tools | all (credit-limited) | all | all | all |

**Credit value:** 750cr / $7.99 → **$0.0107/cr**; 3,000cr / $9.99 (yearly) → **$0.0033/cr**.
So a credit is worth **~$0.003–0.011** depending on plan. Use **$0.005** as a blended planning figure.

---

## (a) COGS table

Provider $ are ESTIMATES — replace the "Provider COGS" column with your real vtoken / VEO3
(media.viemind.ai) numbers, then read off the margin.

| Tool | Credits | Sell @ $0.005/cr | Est. provider COGS | Verdict |
|---|---|---|---|---|
| Keyword / Tag / Title | 1 | $0.005 | LLM ~$0.0005–0.002 | ✅ healthy |
| Description | 2 | $0.010 | ~$0.002 | ✅ healthy |
| VieRank Assistant | 2 | $0.010 | ~$0.003 | ✅ healthy |
| Listing Optimizer / Competitor Research / Reputation / Search Position / Etsy Trends / Niche / Best Sellers | 3 | $0.015 | Etsy API (free) + small LLM | ✅ healthy |
| Deep Competitor Analysis | 8 | $0.040 | full-shop fetch + LLM | ✅ ok |
| Review Requests | 1 | $0.005 | 1 LLM call | ✅ healthy |
| **AI Image Studio** | 5 / image | $0.025 | image gen **~$0.02–0.05** | ⚠️ **thin / break-even** |
| **AI Video Studio** | 20 / video | $0.100 | VEO3 clip **~$0.30–1.50+** | ❌ **likely LOSS per video** |

**Key risk (unchanged from the review):** text/analysis tools are safely profitable; the exposure
is concentrated in **AI media**, above all **video**. At 3,000 credits, a Business user ($9.99/mo)
can submit **~150 videos/month** — if a VEO3 clip costs even $0.30, that's **$45 COGS on a $9.99 plan**.

---

## (b) Recommended fixes (need your real COGS to finalize the numbers)

### 1. Re-price AI media to cover cost (the important one)
Formula: `credits = ceil( providerCost / creditValue × 1.3 safety )`, creditValue = $0.005.

| If real cost is… | Video credits should be ≥ | Image credits should be ≥ |
|---|---|---|
| $0.10 | 26 | (5 ok) |
| $0.30 | 78 | 13 |
| $0.50 | 130 | 13 |
| $1.00 | 260 | 26 |

→ **Action:** tell me your real per-clip / per-image cost and I set `TOOL_COSTS['video-studio']`
and `['image-studio']` in `src/lib/server/services/toolCosts.ts` accordingly (one-line each).
Current: video 20, image 5.

**Alternative to repricing:** keep credit costs but add a **per-plan monthly AI-media cap**
(e.g. Side 10 videos, Business 40, Enterprise 120). More work (needs a monthly counter) but
protects COGS without making occasional video expensive for everyone. Repricing is simpler and ships now.

### 2. Free tier — recurring small allowance instead of "30 once"
Today free credits are granted **once at signup** (`auth.ts` → `grantPlanCredits('free')`); there is
no monthly top-up. "30 once" is effectively a one-time trial → kills top-of-funnel.

**Proposed:** a small **monthly** free grant (e.g. **20 credits/mo**) so free users keep using the
cheap text tools, while AI media stays naturally gated by the low balance (can't afford a video,
~4 images max). COGS of 20 text-tool credits ≈ **<$0.05/user/mo** — negligible. Abuse already
mitigated by disposable-email blocking.

**Cleanest implementation (no cron):** lazy idempotent grant on dashboard load.
- In the (dashboard) layout server load, for `plan === 'free'`, call
  `credits.grantPlanCredits(userId, 'free', \`free-monthly:${userId}:${YYYY-MM}\`)` — the existing
  `hasLedgerRef` idempotency means it grants at most once per user per month, only for active users.
- Add `FREE_MONTHLY_CREDITS = 20` (separate from the signup 30) so the two are tunable independently.
- Update pricing copy: "30 to start + 20 free credits every month".

→ This is a **business-model decision** (free becomes recurring-free) + a small code change. Say the
word and I wire it; tell me the monthly number (default 20).

### 3. Enterprise — give it real value or accept it's an anchor
$49.99 for 3× Business's credits is poor value → today it mainly makes Business look good. Either:
- **(a) Leave as anchor** (fine — few buy it), or
- **(b) Add genuine Enterprise-only value** so it sells: team seats / multiple logins, an API key,
  priority support SLA. None of these exist yet — would be a build, not a copy change.

Shipped now: reframed the Enterprise highlight to "Built for agencies & multi-shop sellers" (honest,
capacity-based) instead of repeating "VieRank Assistant".

---

## (c) Shipped already ✅
- **Credit conversion examples** on every paid card (e.g. "≈ 750 keyword searches or 250 listing audits / mo")
  — removes the "how much is 750 credits?" friction.
- **Business** highlight → "Best value — 4× Side's credits"; **Enterprise** → "Built for agencies & multi-shop sellers".

---

## Decisions needed from you
1. **Real per-clip / per-image provider cost** → so I finalize video/image credit pricing (or approve a per-plan media cap instead).
2. **Free recurring credits?** yes/no + monthly amount (default 20).
3. **Enterprise:** keep as anchor, or schedule a build for seats/API/priority?
