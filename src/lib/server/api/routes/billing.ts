/**
 * Billing router (Engineer B) — mounted at /api/billing by app.ts.
 *
 *   POST /api/billing/checkout  (requireAuth)  → { url }
 *   POST /api/billing/webhook   (signature)    → { received: true } | 400
 *
 * Webhook reads the RAW body (`c.req.text()`, never `c.req.json()`) because Stripe
 * signature verification hashes the exact bytes. It is intentionally NOT behind
 * requireAuth — Stripe authenticates via the signature header instead.
 *
 * Credits granting is delegated to Engineer C's CreditsService, resolved lazily through
 * A's `services/provider.ts` seam (`getCreditsService(db)`) so this file never imports C's
 * implementation directly.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, ApiError } from '../types';
import { getDb, getEnv, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { getStripe, constructWebhookEvent } from '../../stripe';
import { getCreditsService } from '../../services/provider';
import { createSubscriptionRepo } from '../../repositories/subscriptionRepo';
import { createBillingService, BillingConfigError } from '../../services/billingService';

const router = new Hono<AppEnv>();

// S6: explicit enums — reject anything outside the known plan/period sets with a clear 400
// (rather than a permissive string + refine). `.strict()` rejects unexpected extra keys so a
// fuzzed/oversized object can't smuggle fields through.
const checkoutSchema = z
  .object({
    plan: z.enum(['side', 'business', 'enterprise']),
    period: z.enum(['monthly', 'yearly']),
  })
  .strict();

/** S6: hard cap on the raw webhook body (256 KiB). Stripe events are well under this; an
 * oversized body is rejected before signature work to avoid wasting CPU on junk payloads. */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Build a billing service bound to the current request's env + D1 + credits seam. */
async function buildBillingService(c: Context<AppEnv>) {
  const env = getEnv(c);
  const db = getDb(c);
  const stripe = getStripe(env.STRIPE_SECRET_KEY);
  const repo = createSubscriptionRepo(db);
  const credits = await getCreditsService(db);
  return createBillingService({
    stripe,
    env,
    repo,
    grantPlanCredits: (userId, plan, ref) => credits.grantPlanCredits(userId, plan, ref),
  });
}

router.post('/checkout', requireAuth, async (c) => {
  const user = getUser(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiError>(
      { error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid request' },
      400
    );
  }

  const origin = new URL(c.req.url).origin;

  try {
    const billing = await buildBillingService(c);
    const { url } = await billing.createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      plan: parsed.data.plan,
      period: parsed.data.period,
      origin,
    });
    return c.json({ url });
  } catch (err) {
    if (err instanceof BillingConfigError || isMissingConfig(err)) {
      console.error('[billing] checkout config error', err);
      return c.json<ApiError>(
        { error: 'BILLING_CONFIG', message: 'Billing is not configured' },
        500
      );
    }
    throw err; // → app.onError → 500 INTERNAL
  }
});

router.post('/webhook', async (c) => {
  const env = getEnv(c);
  const rawBody = await c.req.text(); // raw bytes for signature (NOT c.req.json())
  const signature = c.req.header('stripe-signature');

  // S6: reject oversized bodies before any signature/crypto work.
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    console.warn('[billing] webhook body too large', rawBody.length);
    return c.json<ApiError>({ error: 'VALIDATION', message: 'Payload too large' }, 413);
  }

  let stripe;
  try {
    stripe = getStripe(env.STRIPE_SECRET_KEY);
  } catch (err) {
    console.error('[billing] webhook stripe init failed', err);
    return c.json<ApiError>({ error: 'BILLING_CONFIG', message: 'Billing is not configured' }, 500);
  }

  let event;
  try {
    event = await constructWebhookEvent(stripe, rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // Bad signature / missing secret → 400, do not process (spec §4.6).
    console.warn('[billing] webhook signature verification failed', err);
    return c.json<ApiError>({ error: 'VALIDATION', message: 'Invalid webhook signature' }, 400);
  }

  try {
    const billing = await buildBillingService(c);
    await billing.handleWebhookEvent(event);
  } catch (err) {
    // Returning 500 makes Stripe retry — idempotency (BR-010) makes retries safe.
    console.error('[billing] webhook handling error', err);
    return c.json<ApiError>({ error: 'INTERNAL', message: 'Webhook processing failed' }, 500);
  }

  return c.json({ received: true });
});

/** Detect the "secret not configured" errors thrown by stripe.ts so we 500 cleanly. */
function isMissingConfig(err: unknown): boolean {
  return err instanceof Error && /is not configured/.test(err.message);
}

export default router;
