/**
 * Billing service (Engineer B) — Stripe webhook handling + checkout session creation.
 *
 * Pure TS with DI: takes a Stripe client, env, SubscriptionRepo, and a grant callback
 * (decoupled from credits implementation). Tested hermetically in `billingWebhook.test.ts`.
 *
 * S1 hardening (tech-debt #1):
 *   - Credit granting moved to `invoice.paid` ONLY (billing_reason = subscription_create | subscription_cycle).
 *   - `subscription.updated` syncs plan/status but does NOT grant.
 *   - `checkout.session.completed` activates subscription but does NOT grant.
 *   - Idempotency: invoice id as ref → at most one grant per invoice.
 */
import type Stripe from 'stripe';
import type { SubscriptionRepo } from '../repositories/subscriptionRepo';
import type { Env } from '../env';
import type { PlanSlug } from './types';

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConfigError';
  }
}

export interface BillingService {
  createCheckoutSession(params: {
    userId: string;
    userEmail: string;
    plan: string;
    period: string;
    origin: string;
  }): Promise<{ url: string }>;
  handleWebhookEvent(event: Stripe.Event): Promise<void>;
}

interface BillingDeps {
  stripe: Stripe;
  env: Env;
  repo: SubscriptionRepo;
  grantPlanCredits: (userId: string, plan: PlanSlug, ref?: string) => Promise<{ balance: number }>;
}

/** Map a Stripe price ID to a plan slug using env config. */
function planFromPriceId(env: Env, priceId: string): PlanSlug | null {
  const map: Record<string, PlanSlug> = {};
  if (env.STRIPE_PRICE_SIDE_MONTHLY) map[env.STRIPE_PRICE_SIDE_MONTHLY] = 'side';
  if (env.STRIPE_PRICE_SIDE_YEARLY) map[env.STRIPE_PRICE_SIDE_YEARLY] = 'side';
  if (env.STRIPE_PRICE_BUSINESS_MONTHLY) map[env.STRIPE_PRICE_BUSINESS_MONTHLY] = 'business';
  if (env.STRIPE_PRICE_BUSINESS_YEARLY) map[env.STRIPE_PRICE_BUSINESS_YEARLY] = 'business';
  if (env.STRIPE_PRICE_ENTERPRISE_MONTHLY) map[env.STRIPE_PRICE_ENTERPRISE_MONTHLY] = 'enterprise';
  if (env.STRIPE_PRICE_ENTERPRISE_YEARLY) map[env.STRIPE_PRICE_ENTERPRISE_YEARLY] = 'enterprise';
  return map[priceId] ?? null;
}

/** Map a Stripe price ID to a billing period. */
function periodFromPriceId(env: Env, priceId: string): 'monthly' | 'yearly' | null {
  const monthly = [
    env.STRIPE_PRICE_SIDE_MONTHLY,
    env.STRIPE_PRICE_BUSINESS_MONTHLY,
    env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  ];
  const yearly = [
    env.STRIPE_PRICE_SIDE_YEARLY,
    env.STRIPE_PRICE_BUSINESS_YEARLY,
    env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  ];
  if (monthly.includes(priceId)) return 'monthly';
  if (yearly.includes(priceId)) return 'yearly';
  return null;
}

/** Resolve the price ID for a (plan, period) tuple. */
function priceIdFor(env: Env, plan: string, period: string): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}` as keyof Env;
  const id = env[key];
  if (!id || typeof id !== 'string') {
    throw new BillingConfigError(`Stripe price for ${plan}/${period} is not configured`);
  }
  return id;
}

export function createBillingService(deps: BillingDeps): BillingService {
  const { stripe, env, repo, grantPlanCredits } = deps;

  return {
    async createCheckoutSession({ userId, userEmail, plan, period, origin }) {
      const priceId = priceIdFor(env, plan, period);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: userEmail,
        client_reference_id: userId,
        metadata: { userId, plan, period },
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/pricing?checkout=cancel`,
      });

      if (!session.url) {
        throw new BillingConfigError('Stripe did not return a checkout URL');
      }
      return { url: session.url };
    },

    async handleWebhookEvent(event) {
      // Idempotency gate: skip already-processed events.
      const isNew = await repo.markEventProcessed(event.id);
      if (!isNew) return;

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId ?? session.client_reference_id;
          if (!userId) break;
          const plan = (session.metadata?.plan ?? 'free') as PlanSlug;
          const period = session.metadata?.period ?? null;

          await repo.ensureRow(userId);
          if (session.customer && typeof session.customer === 'string') {
            await repo.setStripeCustomerId(userId, session.customer);
          }
          await repo.update(userId, {
            plan,
            status: 'active',
            period,
            stripe_subscription_id:
              typeof session.subscription === 'string' ? session.subscription : null,
          });
          // NOTE: checkout does NOT grant credits (S1). invoice.paid owns grants.
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const billingReason = (invoice as unknown as Record<string, unknown>).billing_reason as string | undefined;

          // S1: only grant on subscription_create or subscription_cycle.
          const grantReasons = ['subscription_create', 'subscription_cycle'];
          if (!billingReason || !grantReasons.includes(billingReason)) break;

          // Resolve user ID from subscription metadata or subscription lookup.
          const parent = (invoice as unknown as Record<string, unknown>).parent as
            | { type: string; subscription_details?: { subscription?: string; metadata?: Record<string, string> } }
            | undefined;
          let userId = parent?.subscription_details?.metadata?.userId;
          const subscriptionId = parent?.subscription_details?.subscription;

          if (!userId && subscriptionId && typeof subscriptionId === 'string') {
            const sub = await repo.getByStripeSubscriptionId(subscriptionId);
            userId = sub?.user_id;
          }
          if (!userId) {
            const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined;
            if (customerId) {
              const sub = await repo.getByCustomerId(customerId);
              userId = sub?.user_id;
            }
          }
          if (!userId) break;

          // Resolve plan from the line's price ID (authoritative — not metadata).
          const lines = (invoice as unknown as Record<string, unknown>).lines as
            | { data?: Array<{ pricing?: { type: string; price_details?: { price?: string } }; price?: { id: string } }> }
            | undefined;
          const firstLine = lines?.data?.[0];
          const priceId = firstLine?.pricing?.price_details?.price ?? firstLine?.price?.id;
          const plan = priceId ? planFromPriceId(env, priceId as string) : null;
          if (!plan) break;

          // Grant with invoice ID as ref → idempotent (at most once per invoice).
          const invoiceId = invoice.id;
          await grantPlanCredits(userId, plan, `invoice:${invoiceId}`);
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          if (!userId) break;

          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan = priceId ? planFromPriceId(env, priceId) : null;
          const period = priceId ? periodFromPriceId(env, priceId) : null;

          await repo.update(userId, {
            plan: plan ?? undefined,
            status: sub.status,
            period,
          });
          // NOTE: subscription.updated does NOT grant credits (S1).
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          if (!userId) break;
          await repo.update(userId, { plan: 'free', status: 'canceled' });
          break;
        }

        default:
          // Unhandled event type — no-op (spec: ack without processing).
          break;
      }
    },
  };
}
