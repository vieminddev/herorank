/**
 * requireCredits (Engineer C) — gate + charge a tool invocation on the user's credit pool.
 *
 * Chain per spec §4.5: `requireAuth → requireCredits(tool) → handler → deduct → ledger`.
 * Place AFTER `requireAuth` so `getUser(c)` is populated.
 *
 * Behaviour:
 *   1. Pre-check (fail fast): if balance < cost → 402 INSUFFICIENT_CREDITS, handler never runs.
 *   2. Run the handler (`next()`).
 *   3. Deduct only if the handler succeeded (response status < 400). The deduct is the
 *      atomic, race-safe spend (BR-008/009) — so even though the pre-check is advisory, the
 *      actual charge cannot overspend under concurrency (the conditional UPDATE guards it).
 *   4. Merge the post-deduct balance into the JSON response as `creditsRemaining`. This is
 *      done by the middleware (not the route) because the deduct runs AFTER the handler has
 *      already built its body — so the route cannot know the remaining balance itself.
 *   5. If the concurrent charge loses the race (pre-check passed but the atomic spend found
 *      no credits), the response is rewritten as 402 and no charge is made.
 *
 * Deducting AFTER the handler means a failing tool (4xx/5xx) does not cost the user credits.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService, InsufficientCreditsError } from '../../services/creditsService';
import { getToolCost } from '../../services/toolCosts';

export function requireCredits(tool: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const cost = getToolCost(tool);
    if (cost === undefined) {
      // Misconfiguration (route charges an unpriced tool) — fail loud, do not run handler.
      return c.json({ error: 'INTERNAL', message: `Unpriced tool: ${tool}` }, 500);
    }

    const user = getUser(c);
    const repo = createCreditsRepo(getDb(c));
    const credits = createCreditsService(repo);

    // 1. Pre-check — cheap rejection before doing the tool's work.
    const balance = await credits.getBalance(user.id);
    if (balance < cost) {
      return c.json(
        { error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits', balance },
        402
      );
    }

    // 2. Run the handler.
    await next();

    // 3. Only charge for a successful handler (no charge on tool failure).
    if (c.res.status >= 400) return;

    // 4. Atomic, race-safe deduct. Authoritative even though step 1 was advisory.
    //    O1 wiring: set creditsDelta so logger.ts picks up the per-request credit charge.
    //
    //    F-01: pass a PER-REQUEST unique ledger ref `spend:{tool}:{requestId}`. Two distinct
    //    valid calls to the same tool produce two distinct refs (so the new unique index never
    //    blocks a legitimate second spend), but a RETRY of the SAME request (same requestId)
    //    reuses the ref → the spend is idempotent and cannot double-charge. The requestId comes
    //    from the logger middleware (`c.var.requestId`); fall back to a fresh UUID if absent (a
    //    fresh UUID per attempt is still safe — it just makes that attempt non-idempotent, which
    //    matches the pre-F-01 behaviour for that edge case).
    const requestId =
      (() => {
        const v = (c as unknown as { get: (k: string) => unknown }).get('requestId');
        return typeof v === 'string' ? v : undefined;
      })() ?? crypto.randomUUID();
    const spendRef = `spend:${tool}:${requestId}`;

    let remaining: number;
    try {
      const result = await credits.spendCredits(user.id, tool, spendRef);
      remaining = result.balance;
      // O1 (EDGE flag): expose deduction to logger middleware (reads 'creditsDelta' key).
      (c as unknown as { set: (k: string, v: unknown) => void }).set('creditsDelta', -cost);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        // Lost a concurrent race after the pre-check passed — rewrite as 402, no charge made.
        c.res = c.json(
          { error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits', balance: err.balance },
          402
        );
        return;
      }
      throw err;
    }

    // 5. Merge creditsRemaining into the (JSON) success response. Non-JSON responses are
    //    left untouched (the Phase 1 echo route always returns JSON).
    const contentType = c.res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      let payload: unknown;
      try {
        payload = await c.res.clone().json();
      } catch {
        return; // Unparseable body — leave the response as-is.
      }
      const merged =
        payload && typeof payload === 'object'
          ? { ...(payload as Record<string, unknown>), creditsRemaining: remaining }
          : { result: payload, creditsRemaining: remaining };
      c.res = c.json(merged, c.res.status as 200);
    }
  });
}
