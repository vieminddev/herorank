# Engineer SEC-BILLING report — Phase 5 hardening (Task #23)

> 2026-06-13, branch `migrate-sveltekit`. Scope: S1, S6, S8, S9, S10.
> Gates: `npm run check` = **0 errors / 0 warnings** (whole project). `npx vitest run` = **227 PASS / 0 FAIL** (172 baseline + 23 new + pre-existing). No full build (per brief).

---

## S1 (P0) — Webhook credit grant moved to `invoice.paid` (tech-debt #1)

**Files changed:** `services/billingService.ts`, `api/routes/billing.ts`. (`subscriptionRepo.ts` needed NO change — its `update`/`ensureRow`/`markEventProcessed` already cover what the new handler needs.)

**What changed (one grant per cycle):**
- Added `case 'invoice.paid'` to the webhook switch → new `onInvoicePaid(invoice)` handler. Grants **only** when `billing_reason ∈ {subscription_create, subscription_cycle}` (the cycle-anchoring invoices). Every other reason (`manual`, `subscription_update`, `subscription_threshold`, …) syncs nothing and grants nothing.
- `onSubscriptionUpdated` no longer grants — it now **syncs plan/status/period/current_period_end ONLY**. A mid-cycle plan change therefore does NOT top up credits (the exact bug flagged in Phase-1 engineer_B §8).
- `onCheckoutCompleted` no longer grants either — it **activates** the subscription only. Rationale: Stripe fires `invoice.paid` (billing_reason `subscription_create`) alongside checkout, so keeping a single granting path avoids a double-grant for the first cycle. New subscribers still see credits within seconds (the create-invoice arrives right after checkout).
- **Idempotency is double-guarded:** (a) `processed_stripe_events` gates each `event.id` (unchanged); (b) the grant `ref` is now `invoice:{invoice.id}` — so even a re-delivered `invoice.paid` with a *fresh event id but the same invoice id* is refused by the credits ledger (`hasLedgerRef`). One invoice per cycle ⇒ at most one grant per cycle.
- **Plan resolution** for the grant prefers the **line item price id** (authoritative amount billed this cycle) → `planFromPriceId`, falling back to subscription-snapshot metadata `plan`. User resolution: subscription-snapshot metadata `userId` → DB lookup by subscription id → by customer id.

**Stripe SDK 22.2.0 (API `2026-05-27.dahlia`) note:** `Invoice.subscription` moved to `invoice.parent.subscription_details.{subscription,metadata}` and a line's price to `line.pricing.price_details.price`. Added defensive extractors (`subscriptionIdFromInvoice`, `priceIdFromInvoice`, `subscriptionMetadata`, `customerIdFromInvoice`) with legacy top-level fallbacks so a version skew can't crash the webhook.

**Tests (S1):** `tests/billingWebhook.test.ts` (13 it):
- `subscription_create` → grants first cycle; `subscription_cycle` → grants renewal.
- `manual` / `subscription_update` / `subscription_threshold` → **no grant**.
- re-delivered `invoice.paid` (different event id, same invoice id) → granted **exactly once**.
- plan resolved from line price id (SIDE vs BUSINESS), user resolved by subscription id when metadata absent.
- `subscription.updated` mid-cycle plan change → **no grant**, state synced.
- `checkout.session.completed` → activate only, **no grant**.
- duplicate `event.id` → gated no-op.

---

## S6 (P1) — Input validation (owned routes)

**File:** `api/routes/billing.ts`.
- `checkoutSchema` tightened from `z.string().refine(...)` to explicit `z.enum(['side','business','enterprise'])` + `z.enum(['monthly','yearly'])` and `.strict()` (rejects unexpected extra keys). Cleaner 400s; fuzzed/oversized objects can't smuggle fields. Removed now-unused `isPaidPlan`/`isBillingPeriod` imports.
- Webhook body **size cap** added: raw body > 256 KiB → `413 VALIDATION` *before* any signature/crypto work (avoids wasting CPU on junk payloads). Stripe events are well under this.

OAuth state/redirect (S6 portion in `oauth.ts`): already validated — `code`/`state` presence checked → 400; state owner + expiry enforced; redirect targets are hardcoded constants (`/settings/connections`), the only interpolated value is `encodeURIComponent(oauthError)`. No change needed; covered by S9 tests below.

---

## S8 (P1) — SQL injection spot-audit

**Method:** grepped every `.prepare(` call site + every `${...}` / string-concat near SQL keywords across `repositories/*`, `services/**/*Store.ts`, `connectedShopRepo`, calibration, etsy caches/usage.

**Result: CLEAN — no user input reaches SQL as a literal anywhere.** Every dynamic value is parameterized via `.bind()`. The only `${...}` interpolations and `+` concatenations are author-controlled static text (column-name constants, multi-line SQL literals, fixed `col = ?` set-clauses).

| File | Lines (interp/concat) | Finding |
|---|---|---|
| `repositories/subscriptionRepo.ts` | 59,66,74 (`${SUBSCRIPTION_COLUMNS}`), 126 (`${sets.join(', ')}`) | SAFE — `SUBSCRIPTION_COLUMNS` is a const; `sets` are hardcoded `col = ?` strings, values via `.bind()`. No user input. |
| `repositories/creditsRepo.ts` | — | SAFE — all `?` + `.bind()`; arithmetic (`credits_balance - ?`) is in-SQL on bound params. |
| `services/jobs/jobsStore.ts` | 66,85,97,98,145 (concat) | SAFE — static SQL literals joined at author-time; LIMIT/ORDER bound or constant. |
| `services/jobs/analysesJobStore.ts` | 88–131 | SAFE — `?` + `.bind()` throughout. |
| `services/oauth/connectedShopRepo.ts` | 125–204 (concat + `SHOP_SELECT`) | SAFE — static literals; tokens/ids all `.bind()`. |
| `services/etsy/analysesStore.ts` | 43–47 | SAFE — `WHERE … = ? … LIMIT ?` bound. |
| `services/etsy/usageCounter.ts` | 64–68 | SAFE — `VALUES (?, ?)`, `count = count + excluded.count` (no input). |
| `services/etsy/cache.ts` | 128,145–147 | SAFE — `WHERE keyword = ? AND captured_at < ?` bound; `LIMIT 1` constant. |
| `services/calibration/calibrationJob.ts` | 189–196 | SAFE — `VALUES (?, ?, ?, unixepoch())` bound. |
| `services/calibration/reviewRateProvider.ts` | 85 | SAFE — static `SELECT … FROM calibration_factors`, no params. |

**No fixes required.** No out-of-scope SQLi to hand to INFRA/QA.

---

## S9 (P1) — Webhook signature + OAuth state/PKCE (non-regression + adversarial)

No logic changed (Phase 1/4 already correct); added adversarial tests.

**Stripe signature** — `tests/billingWebhook.test.ts` (S9 block, real `constructEventAsync` via `generateTestHeaderStringAsync`):
- correctly-signed body parses;
- **replayed signature on a tampered body → throws** (→ route 400);
- wrong-secret signature → throws;
- missing signature header / missing secret → throws with clear message.

**OAuth state + PKCE** — `tests/oauthSecurity.test.ts` (4 it), separate file to avoid colliding with Engineer H's `oauth.test.ts`:
- state **reuse** (replayed callback, same state) → rejected (one-shot consume).
- cross-user state (minted for A, consumed as B) → rejected (CSRF owner check).
- **PKCE verifier binding:** the exchange uses the verifier *bound at /start* — modelled token endpoint 400s on any other (mirrors Etsy's S256 mismatch); an attacker-chosen verifier → `EtsyOAuthError`.

---

## S10 (P0) — Credits race AUDIT (audit + tests only; did NOT modify INFRA's `consume.ts`/`queue.ts`)

**Audited:** `services/creditsService.ts` `spendCredits` → `repositories/creditsRepo.ts` `spend` (atomic conditional), and `jobs/consume.ts` `processDeepAnalysisJob` (deduct-on-success + `paymentFailed`), and the `jobs/queue.ts` retry path.

**Findings:**
- ✅ `creditsRepo.spend` is genuinely race-safe: a single `db.batch([...])` where BOTH the ledger `INSERT…SELECT…WHERE credits_balance >= cost` and the guarded `UPDATE … WHERE credits_balance >= cost` commit together; success is read from the UPDATE's `changes()`. Two concurrent debits cannot both pass the guard. No read-then-write gap.
- ✅ `consume.ts` deduct-on-success: result is saved first, then `spendCredits`; `InsufficientCreditsError` → `paymentFailed=true` (result still delivered, no debit), any other error → rethrow → job `failed` (no charge). Correct per BR-P4-01.
- ✅ Retry safety rests on the **job lifecycle**: only `deferred` (quota, *never charged*) calls `msg.retry()`; `done` (charged) and `failed` (not charged) both `msg.ack()` (terminal). So a *charged* run is never re-delivered.

**⚠️ FLAG for INFRA-JOBS / QA (potential, not a confirmed live bug — non-blocking):**
The deep-analysis spend uses `ref = tool` (the constant `'shop-analysis-deep'`), **not a per-job ref**. So the credits ledger itself does NOT dedupe a second debit for the same job. Today the lifecycle guarantee (above) means a charged job is never retried, so no double-charge occurs. **But** the non-double-charge property is purely lifecycle-enforced — if a future change ever re-runs `processDeepAnalysisJob` for a job that already reached `done` (e.g. a DLQ replay/manual requeue, or the inline `waitUntil` fallback racing the queue consumer for the same job), it **would** double-charge because the spend has no idempotency key. **Recommendation (INFRA-JOBS owns `consume.ts`):** pass a per-job ref to `spendCredits`, e.g. `spend(... ref: 'job:'+jobId)`, and have the deep-analysis spend go through that ref so a repeated debit for the same job is a ledger no-op. This is defense-in-depth for R3 (DLQ consumer) and R4 (idempotency audit) which INFRA is adding this phase. I did not change `consume.ts` (out of my ownership) or `creditsService.spendCredits` signature (shared with Engineer C).

**Tests:** `tests/creditsRace.test.ts` (6 it) — concurrent spend with balance-for-one → exactly 1 winner / rest `InsufficientCreditsError` / balance never negative; balance-for-two → exactly 2 winners; deduct-on-success with balance=0 → `paymentFailed=true` + no debit; sufficient balance → charged once; two concurrent job runs on balance-for-one → one charges, one flags; lifecycle invariant (only the non-charging `deferred` outcome is retried).

---

## Files

**Changed (owned):**
- `src/lib/server/services/billingService.ts` — S1 invoice.paid handler + extractors; subscription.updated/checkout no longer grant.
- `src/lib/server/api/routes/billing.ts` — S6 enum validation + webhook body cap.

**Added (tests):**
- `tests/billingWebhook.test.ts` — S1 (13) + S9 Stripe signature.
- `tests/creditsRace.test.ts` — S10 (6).
- `tests/oauthSecurity.test.ts` — S9 OAuth state/PKCE (4).

**Audited, no change:** `subscriptionRepo.ts`, `creditsService.ts`, `creditsRepo.ts`, `stripe.ts`, `etsyOAuth.ts`, `oauth.ts`, `connectedShopRepo.ts`, all `*Store.ts`, calibration.

---

## Needs INFRA / QA action
1. **INFRA-JOBS (P1, S10 defense-in-depth):** add a per-job `ref` (e.g. `job:{jobId}`) to the deep-analysis spend in `consume.ts` so a future requeue/DLQ-replay can never double-charge. Today safe via lifecycle only.
2. **QA:** the S1 path is verified at the service+signature level with fakes; an end-to-end `stripe trigger invoice.paid` smoke (L2) still belongs to QA/launch.
3. **Path note for PM/BA:** `stripe.ts` lives at `src/lib/server/stripe.ts` (not `services/stripe.ts` as the brief listed) — no relocation done.

---

## Self-Review findings
- **Security:** parameterized queries confirmed across the whole repo (S8); webhook signature verified before processing; grant idempotency double-guarded (event id + invoice-id ref); no secrets logged; enum + size validation on inputs. OK.
- **Concurrency:** atomic conditional spend re-audited — single-batch guard, no read-then-write race; flagged the only residual (missing per-job spend ref) for INFRA. OK.
- **Error handling:** invoice handler returns early (no grant) on unmapped plan / unknown user — never grants a guessed amount; webhook still 500s on handler error so Stripe retries (idempotent). OK.
- **Testability:** billing service DI (repo + grant spy) → S1 fully unit-tested without D1/Stripe network. OK.
- **Idiomaticity:** matches existing Hono/zod-v4/DI conventions; tests use relative imports like the rest of the suite. OK.

**Skills read:** `.claude/skills/SKILL-ROUTING.md` (empty in this repo). Read: BA spec S1/S6/S8/S9/S10 + PM decisions; Phase-1 `04_engineer_B.md` + `02_contract_A.md`; all in-scope source (billingService, subscriptionRepo, billing route, stripe, creditsService, creditsRepo, etsyOAuth, connectedShopRepo, oauth route, consume, queue) + every `*Store`/calibration file for the S8 audit.

**Memory:** wrote `stripe-invoice-fields-dahlia.md` [UNIVERSAL] (SDK 22.2.0 invoice field relocations + one-grant-per-cycle webhook pattern). No existing entry duplicated.

**Concerns/risks:** (1) S10 per-job-ref gap above — currently safe, but a latent double-charge if job lifecycle assumptions change; handed to INFRA. (2) Did not run full build (per brief); `npm run check` (0/0) + vitest (227 pass) are the gates.
