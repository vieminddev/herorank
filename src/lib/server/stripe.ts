/**
 * Stripe client wrapper (Engineer B).
 *
 * Workers constraints (spec §13):
 *   - The Stripe Node SDK defaults to Node's `http` module, which does NOT exist on
 *     Cloudflare Workers → the client MUST be created with `Stripe.createFetchHttpClient()`
 *     so all calls go through the global `fetch`.
 *   - Webhook signature verification MUST use the async variant
 *     `stripe.webhooks.constructEventAsync(...)` because Workers only exposes the async
 *     Web Crypto API (the sync `constructEvent` relies on Node crypto and throws).
 *
 * The SDK is request-scoped only in the sense that the secret comes from `env`; the client
 * itself is cheap and created per call site that needs it. We cache one instance per
 * distinct secret string to avoid rebuilding it on every request within an isolate.
 */
import Stripe from 'stripe';

// We intentionally do NOT pass `apiVersion`: SDK 22.2.0 is pinned to '2026-05-27.dahlia'
// and the typed `LatestApiVersion` is that exact string, so omitting it uses the same
// version the types are generated against (avoids a brittle literal cast).

const clientCache = new Map<string, Stripe>();

/**
 * Build (or reuse) a Workers-safe Stripe client for the given secret key.
 * Throws a clear configuration error if the key is missing so callers surface a 500 with
 * an actionable message instead of an opaque SDK crash (spec §12 smoke #6).
 */
export function getStripe(secretKey: string | undefined): Stripe {
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const cached = clientCache.get(secretKey);
  if (cached) return cached;

  const client = new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  clientCache.set(secretKey, client);
  return client;
}

/**
 * Verify a Stripe webhook signature and parse the event (async — Workers Web Crypto).
 * @param rawBody   the EXACT raw request body string (read via `c.req.text()`).
 * @param signature value of the `stripe-signature` header.
 * @param secret    the webhook signing secret (`STRIPE_WEBHOOK_SECRET`).
 * @throws if signature is invalid or the secret is missing.
 */
export async function constructWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined
): Promise<Stripe.Event> {
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);
}
