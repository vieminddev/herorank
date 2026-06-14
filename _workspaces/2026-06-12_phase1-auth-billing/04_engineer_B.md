# Engineer B report — Billing & Auth FE (Task #6)

> 2026-06-12, branch `migrate-sveltekit`. All B-owned files shipped; `npm run check` = 0 errors in B's files (only A-owned `@ts-expect-error` cleanups remain — see Handoff).

## Files created
- `src/lib/server/stripe.ts` — Workers-safe Stripe client (`createFetchHttpClient()`), per-secret cache, `constructWebhookEvent` using `constructEventAsync`. Throws clear "is not configured" errors instead of crashing when keys are absent.
- `src/lib/server/services/planConfig.ts` — `PLAN_CREDITS` (free=30, side=750, business=3000, enterprise=9000), `PaidPlanSlug`, `isPaidPlan`/`isBillingPeriod` guards, `resolvePriceId(env,plan,period)` + reverse `planFromPriceId`. All price IDs from env, never hardcoded.
- `src/lib/server/repositories/subscriptionRepo.ts` — D1 access for `subscriptions` + `processed_stripe_events`. `ensureRow` (ON CONFLICT DO NOTHING), `update` (partial patch), `markEventProcessed` (INSERT OR IGNORE → returns `meta.changes>0` for idempotency).
- `src/lib/server/services/billingService.ts` — `createCheckoutSession` + `handleWebhookEvent` (checkout.session.completed / customer.subscription.updated / customer.subscription.deleted). Pure TS, DI for repo + `grantPlanCredits` callback. NOT using `@better-auth/stripe` plugin.
- `src/lib/server/api/routes/billing.ts` — Hono default-export. `POST /checkout` (requireAuth, zod-validated), `POST /webhook` (raw body via `c.req.text()`, signature verify, NO requireAuth). Resolves credits via A's `getCreditsService(db)` seam.

## Files edited (FE)
- `src/routes/auth/login/+page.svelte` — `authClient.signIn.email`, error banner, redirect `/dashboard`, Google → "coming soon" notice (BR-015). Markup/Tailwind preserved; only logic + error/notice blocks added.
- `src/routes/auth/signup/+page.svelte` — confirm-match + min-8 validation (BR-001), `authClient.signUp.email({email,password,name})` (name derived from email local-part — Better Auth requires it), redirect, Google notice.

## Key decisions / things QA should note
1. **Webhook idempotency (BR-010)** is gated FIRST via `repo.markEventProcessed(event.id)` before any mutation; the event id is ALSO passed as `ref` to `grantPlanCredits` so a grant cannot double-apply even if the two writes were ever split. Re-sending the same event = no-op (smoke test #7).
2. **Credits granting** delegated entirely to C's `CreditsService` through A's `services/provider.ts` (`getCreditsService(db)`); B never imports C's files. Webhook calls `grantPlanCredits(userId, plan, event.id)`.
3. **No real Stripe keys in env**: missing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` → graceful `500 {error:'BILLING_CONFIG'}` (checkout) or `400` (bad signature) / `500` (init) on webhook. No uncaught exceptions (spec §12 #6 / §13). QA: with empty keys, `/checkout` should return 500 BILLING_CONFIG, NOT crash.
4. **Webhook returns 500 on handler error** (after signature OK) so Stripe retries — safe because idempotency makes retries no-ops.
5. **`current_period_end`**: read defensively from `sub.items.data[0].current_period_end` with legacy top-level fallback (field location varies by Stripe API version).
6. **success_url** = `/dashboard?checkout=success`, **cancel_url** = `/pricing?checkout=cancelled`. Webhook (not the redirect) is the source of truth for activation/credits.
7. **name field on signup**: Better Auth requires `name`; FE derives it from email local-part. If PM wants a real name field, the signup form needs a new input (out of current scope — markup kept as-is).
8. **`subscription.updated` grants credits on every active update event** keyed by event.id. This is a deliberate Phase-1 simplification: a true "new billing cycle only" grant would need invoice.paid handling. Each distinct event id grants at most once; renewals produce fresh event ids → fresh grants. Flagged as acceptable for Phase 1 (matches spec §4.4 intent) but QA/PM should confirm — a plan-change update mid-cycle would also grant. **Concern noted for EM.**

## Handoff — A must clean up (do NOT edit A's files myself)
`npm run check` reports 6 errors, ALL in A-owned files, all "Unused '@ts-expect-error' directive":
- `src/lib/server/api/app.ts:32,34,36,38` — the 4 router import directives.
- `src/lib/server/services/provider.ts:21,23` — creditsRepo/creditsService import directives.

Cause: contract A §4/§3 explicitly anticipated this — "once B/C add their files... the `@ts-expect-error` becomes unused, A will remove it — ping A." Both B's `billing.ts` AND all of C's files (me/credits/tools/creditsRepo/creditsService) now exist and resolve at type level, so every directive is now stale. **Action: A removes the 6 `@ts-expect-error` lines.** No signature changes needed from B or C.

## Self-Review findings
- Security: parameterized queries throughout (no string interpolation of user input); webhook signature verified before processing; no secrets hardcoded (all via `env`); auth via `requireAuth` on `/checkout`. OK.
- Concurrency: idempotency via DB PK (`processed_stripe_events`) + `INSERT OR IGNORE` changes-check — race-safe for duplicate webhook deliveries. No shared mutable state; Stripe client cache is per-secret immutable. OK.
- Error handling: missing-config errors caught and mapped to clean codes; bad signature → 400; handler error → 500 (Stripe-retryable). No internal details leaked to clients (only `{error,message}` shapes). OK.
- Testability: `billingService` takes repo + `grantPlanCredits` via DI → unit-testable with in-memory fake (no D1/Stripe needed). OK.
- Idiomaticity: Hono default-export router, zod v4 validation, Svelte 5 runes ($state) on FE. OK.
- One pre-existing a11y warning on login `+page.svelte:91` (`href="#"` forgot-password) — left intentionally (A4: forgot-password out of Phase 1 scope; instructed to keep markup). Not introduced by me.

**Skills read:** `.claude/skills/SKILL-ROUTING.md` (empty/no content in this repo). Read all contract + spec + A's app.ts/types.ts/context.ts/env.ts/provider.ts/auth.ts + pricing/login/signup pages + migration 0002.

**Memory:** wrote `stripe-on-workers.md` [UNIVERSAL candidate] (fetch httpClient + constructEventAsync + omit apiVersion cast). No changes to existing herorank-phase1/better-auth-d1 (already accurate).

**Concerns/risks:** (1) #8 above — `subscription.updated` grant semantics need PM/QA confirmation. (2) Did not run full build per instructions; `npm run check` is the gate and B's files pass clean.
