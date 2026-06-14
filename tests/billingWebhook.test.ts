/**
 * Billing webhook tests (Engineer SEC, Phase 5).
 *
 * Covers the S1 hardening (tech-debt #1) + S9 signature non-regression:
 *
 *   S1 — credit-grant moved to `invoice.paid`, ONE grant per billing cycle:
 *     • invoice.paid (billing_reason=subscription_create) → grants the first cycle.
 *     • invoice.paid (billing_reason=subscription_cycle)   → grants a renewal.
 *     • invoice.paid (billing_reason=manual / subscription_update) → NO grant.
 *     • customer.subscription.updated (mid-cycle plan change) → SYNCS state, does NOT grant.
 *     • checkout.session.completed → activates only, does NOT grant (invoice.paid owns grants).
 *     • idempotency: a re-delivered invoice.paid grants AT MOST once (ref = invoice id).
 *
 *   S9 — Stripe webhook signature (constructWebhookEvent / constructEventAsync):
 *     • a correctly-signed body parses.
 *     • a tampered body (signature replay onto a different payload) → throws (→ route 400).
 *     • a wrong-secret signature → throws.
 *
 * The billing service is pure TS with the repo + grant callback injected (DI), so these run
 * with an in-memory fake repo and a spy grant — no D1, no real Stripe network calls.
 * Relative imports (not `$lib`) keep the suite independent of the SvelteKit alias resolver.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import {
  createBillingService,
  type BillingService,
} from '../src/lib/server/services/billingService';
import type {
  SubscriptionRepo,
  SubscriptionRow,
  SubscriptionUpdate,
} from '../src/lib/server/repositories/subscriptionRepo';
import { constructWebhookEvent } from '../src/lib/server/stripe';
import type { Env } from '../src/lib/server/env';
import type { PlanSlug } from '../src/lib/server/services/types';

// --- env with known price ids (so planFromPriceId resolves) ------------------------------

const PRICE_BUSINESS_MONTHLY = 'price_business_monthly';
const PRICE_SIDE_MONTHLY = 'price_side_monthly';

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    DB: {} as Env['DB'],
    KV: {} as Env['KV'],
    BETTER_AUTH_SECRET: 'x',
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PRICE_SIDE_MONTHLY: PRICE_SIDE_MONTHLY,
    STRIPE_PRICE_BUSINESS_MONTHLY: PRICE_BUSINESS_MONTHLY,
    ...over,
  } as Env;
}

// --- in-memory subscription repo ---------------------------------------------------------

function makeRepo() {
  const rows = new Map<string, SubscriptionRow>();
  const processed = new Set<string>();

  function ensure(userId: string): SubscriptionRow {
    let r = rows.get(userId);
    if (!r) {
      r = {
        user_id: userId,
        plan: 'free',
        status: 'active',
        period: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
        credits_balance: 0,
        created_at: 0,
        updated_at: 0,
      };
      rows.set(userId, r);
    }
    return r;
  }

  const repo: SubscriptionRepo = {
    async getByUserId(userId) {
      return rows.get(userId) ?? null;
    },
    async getByCustomerId(customerId) {
      return [...rows.values()].find((r) => r.stripe_customer_id === customerId) ?? null;
    },
    async getByStripeSubscriptionId(subscriptionId) {
      return [...rows.values()].find((r) => r.stripe_subscription_id === subscriptionId) ?? null;
    },
    async ensureRow(userId) {
      ensure(userId);
    },
    async setStripeCustomerId(userId, customerId) {
      ensure(userId).stripe_customer_id = customerId;
    },
    async update(userId, patch: SubscriptionUpdate) {
      const r = ensure(userId);
      if (patch.plan !== undefined) r.plan = patch.plan;
      if (patch.status !== undefined) r.status = patch.status;
      if (patch.period !== undefined) r.period = patch.period;
      if (patch.stripe_customer_id !== undefined) r.stripe_customer_id = patch.stripe_customer_id;
      if (patch.stripe_subscription_id !== undefined)
        r.stripe_subscription_id = patch.stripe_subscription_id;
      if (patch.current_period_end !== undefined) r.current_period_end = patch.current_period_end;
    },
    async markEventProcessed(eventId) {
      if (processed.has(eventId)) return false;
      processed.add(eventId);
      return true;
    },
  };
  return { repo, rows };
}

// --- grant spy that mirrors the real ledger idempotency (per ref) ------------------------

function makeGrantSpy() {
  const refs = new Set<string>();
  const balances = new Map<string, number>();
  const calls: Array<{ userId: string; plan: PlanSlug; ref?: string }> = [];
  const PLAN_CREDITS: Record<PlanSlug, number> = {
    free: 30,
    side: 750,
    business: 3000,
    enterprise: 9000,
  };

  const grant = vi.fn(async (userId: string, plan: PlanSlug, ref?: string) => {
    calls.push({ userId, plan, ref });
    // Mirror CreditsService idempotency: a repeated ref does not grant again.
    if (ref && refs.has(ref)) {
      return { balance: balances.get(userId) ?? 0 };
    }
    if (ref) refs.add(ref);
    const next = (balances.get(userId) ?? 0) + PLAN_CREDITS[plan];
    balances.set(userId, next);
    return { balance: next };
  });

  return { grant, calls, balances };
}

function build(env = makeEnv()): {
  svc: BillingService;
  rows: Map<string, SubscriptionRow>;
  grant: ReturnType<typeof makeGrantSpy>;
} {
  const { repo, rows } = makeRepo();
  const grant = makeGrantSpy();
  const svc = createBillingService({
    stripe: {} as Stripe, // unused on the webhook path
    env,
    repo,
    grantPlanCredits: grant.grant,
  });
  return { svc, rows, grant };
}

// --- event builders ----------------------------------------------------------------------

const USER = 'user_1';

function invoiceEvent(opts: {
  id: string;
  invoiceId: string;
  billingReason: string;
  priceId?: string;
  userId?: string;
  subscriptionId?: string;
  customerId?: string;
}): Stripe.Event {
  const invoice = {
    id: opts.invoiceId,
    billing_reason: opts.billingReason,
    customer: opts.customerId ?? 'cus_1',
    parent: {
      type: 'subscription_details',
      subscription_details: {
        subscription: opts.subscriptionId ?? 'sub_1',
        metadata: opts.userId ? { userId: opts.userId } : {},
      },
    },
    lines: {
      data: opts.priceId
        ? [{ pricing: { type: 'price_details', price_details: { price: opts.priceId } } }]
        : [],
    },
  };
  return {
    id: opts.id,
    type: 'invoice.paid',
    data: { object: invoice },
  } as unknown as Stripe.Event;
}

function subscriptionUpdatedEvent(opts: {
  id: string;
  priceId: string;
  userId: string;
  status?: Stripe.Subscription.Status;
}): Stripe.Event {
  const sub = {
    id: 'sub_1',
    status: opts.status ?? 'active',
    metadata: { userId: opts.userId },
    items: {
      data: [{ price: { id: opts.priceId, recurring: { interval: 'month' } } }],
    },
  };
  return {
    id: opts.id,
    type: 'customer.subscription.updated',
    data: { object: sub },
  } as unknown as Stripe.Event;
}

function checkoutCompletedEvent(opts: { id: string; userId: string; plan: string }): Stripe.Event {
  const session = {
    metadata: { userId: opts.userId, plan: opts.plan, period: 'monthly' },
    client_reference_id: opts.userId,
    subscription: 'sub_1',
    customer: 'cus_1',
  };
  return {
    id: opts.id,
    type: 'checkout.session.completed',
    data: { object: session },
  } as unknown as Stripe.Event;
}

// =========================================================================================
// S1 — invoice.paid grants once per cycle
// =========================================================================================

describe('S1: invoice.paid is the sole credit-granting path', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('grants the first cycle on subscription_create', async () => {
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_1',
        invoiceId: 'in_1',
        billingReason: 'subscription_create',
        priceId: PRICE_BUSINESS_MONTHLY,
        userId: USER,
      })
    );
    expect(ctx.grant.calls).toEqual([
      { userId: USER, plan: 'business', ref: 'invoice:in_1' },
    ]);
    expect(ctx.grant.balances.get(USER)).toBe(3000);
  });

  it('grants a renewal on subscription_cycle', async () => {
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_2',
        invoiceId: 'in_2',
        billingReason: 'subscription_cycle',
        priceId: PRICE_BUSINESS_MONTHLY,
        userId: USER,
      })
    );
    expect(ctx.grant.balances.get(USER)).toBe(3000);
  });

  it('does NOT grant for non-cycle billing reasons (manual / subscription_update)', async () => {
    for (const reason of ['manual', 'subscription_update', 'subscription_threshold']) {
      await ctx.svc.handleWebhookEvent(
        invoiceEvent({
          id: `evt_${reason}`,
          invoiceId: `in_${reason}`,
          billingReason: reason,
          priceId: PRICE_BUSINESS_MONTHLY,
          userId: USER,
        })
      );
    }
    expect(ctx.grant.grant).not.toHaveBeenCalled();
  });

  it('grants AT MOST once per cycle — a re-delivered invoice.paid is a no-op', async () => {
    // Same invoice id, but Stripe re-delivers under a FRESH event id (processed_stripe_events
    // would not catch it) — the invoice-id ref must stop the double grant.
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_a',
        invoiceId: 'in_dup',
        billingReason: 'subscription_cycle',
        priceId: PRICE_BUSINESS_MONTHLY,
        userId: USER,
      })
    );
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_b', // different event id, SAME invoice id
        invoiceId: 'in_dup',
        billingReason: 'subscription_cycle',
        priceId: PRICE_BUSINESS_MONTHLY,
        userId: USER,
      })
    );
    expect(ctx.grant.balances.get(USER)).toBe(3000); // granted exactly once
  });

  it('resolves the plan from the line price id (not metadata) — authoritative billed amount', async () => {
    // metadata userId only; plan must come from the SIDE price id on the line.
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_p',
        invoiceId: 'in_p',
        billingReason: 'subscription_create',
        priceId: PRICE_SIDE_MONTHLY,
        userId: USER,
      })
    );
    expect(ctx.grant.calls[0]?.plan).toBe('side');
    expect(ctx.grant.balances.get(USER)).toBe(750);
  });

  it('resolves the user by subscription id when invoice metadata is absent', async () => {
    // Seed a row tied to sub_known, then send an invoice with NO metadata userId.
    await ctx.svc.handleWebhookEvent(
      checkoutCompletedEvent({ id: 'evt_seed', userId: USER, plan: 'business' })
    );
    // checkout set stripe_subscription_id = 'sub_1'; send invoice without metadata userId.
    await ctx.svc.handleWebhookEvent(
      invoiceEvent({
        id: 'evt_no_meta',
        invoiceId: 'in_resolve',
        billingReason: 'subscription_cycle',
        priceId: PRICE_BUSINESS_MONTHLY,
        subscriptionId: 'sub_1',
        // no userId metadata
      })
    );
    expect(ctx.grant.balances.get(USER)).toBe(3000);
  });
});

// =========================================================================================
// S1 — subscription.updated + checkout no longer grant
// =========================================================================================

describe('S1: subscription.updated syncs only (no grant)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('a mid-cycle plan change syncs plan/status but does NOT grant credits', async () => {
    await ctx.svc.handleWebhookEvent(
      subscriptionUpdatedEvent({ id: 'evt_u', priceId: PRICE_BUSINESS_MONTHLY, userId: USER })
    );
    expect(ctx.grant.grant).not.toHaveBeenCalled();
    expect(ctx.rows.get(USER)?.plan).toBe('business'); // state synced
    expect(ctx.rows.get(USER)?.status).toBe('active');
  });

  it('checkout.session.completed activates the subscription but does NOT grant', async () => {
    await ctx.svc.handleWebhookEvent(
      checkoutCompletedEvent({ id: 'evt_c', userId: USER, plan: 'business' })
    );
    expect(ctx.grant.grant).not.toHaveBeenCalled();
    expect(ctx.rows.get(USER)?.status).toBe('active');
    expect(ctx.rows.get(USER)?.plan).toBe('business');
  });
});

// =========================================================================================
// idempotency gate (processed_stripe_events) still short-circuits duplicate event ids
// =========================================================================================

describe('webhook idempotency gate', () => {
  it('a duplicate event id is a no-op (markEventProcessed gate)', async () => {
    const ctx = build();
    const ev = invoiceEvent({
      id: 'evt_same',
      invoiceId: 'in_same',
      billingReason: 'subscription_cycle',
      priceId: PRICE_BUSINESS_MONTHLY,
      userId: USER,
    });
    await ctx.svc.handleWebhookEvent(ev);
    await ctx.svc.handleWebhookEvent(ev); // same event id → gated before any handler
    expect(ctx.grant.grant).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================================
// S9 — Stripe webhook signature verification (non-regression + replay/tamper)
// =========================================================================================

describe('S9: Stripe webhook signature', () => {
  const secret = 'whsec_test_secret';
  const stripe = new Stripe('sk_test_x', { httpClient: Stripe.createFetchHttpClient() });

  async function sign(payload: string, withSecret = secret): Promise<string> {
    return stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: withSecret });
  }

  it('parses a correctly-signed body', async () => {
    const payload = JSON.stringify({ id: 'evt_ok', type: 'invoice.paid', data: { object: {} } });
    const header = await sign(payload);
    const event = await constructWebhookEvent(stripe, payload, header, secret);
    expect(event.id).toBe('evt_ok');
    expect(event.type).toBe('invoice.paid');
  });

  it('rejects a replayed signature on a DIFFERENT (tampered) body', async () => {
    const original = JSON.stringify({ id: 'evt_real', type: 'invoice.paid', data: { object: {} } });
    const header = await sign(original);
    // Attacker reuses the valid signature header but swaps the body.
    const tampered = JSON.stringify({ id: 'evt_forged', type: 'invoice.paid', data: { object: { hacked: true } } });
    await expect(constructWebhookEvent(stripe, tampered, header, secret)).rejects.toThrow();
  });

  it('rejects a signature produced with the wrong secret', async () => {
    const payload = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    const header = await sign(payload, 'whsec_attacker');
    await expect(constructWebhookEvent(stripe, payload, header, secret)).rejects.toThrow();
  });

  it('rejects a missing signature header / missing secret', async () => {
    const payload = '{}';
    await expect(constructWebhookEvent(stripe, payload, undefined, secret)).rejects.toThrow(
      /signature/i
    );
    const header = await sign(payload);
    await expect(constructWebhookEvent(stripe, payload, header, undefined)).rejects.toThrow(
      /configured/i
    );
  });
});
