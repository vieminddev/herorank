/**
 * Phase 4 jobs routes (Engineer F owns) — `/api/tools/*` for rank tracking + deep shop analysis.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted by Engineer C inside `routes/tools.ts` via
 * `router.route('/', jobs)` (same pattern as etsy-tools). This file does NOT mount itself.
 *
 * Endpoints (BA §5.1):
 *   POST   /track-listing            — add a tracked (listing, keyword). Plan-GATED (free 0 /
 *                                      side 10 / business 50 / enterprise 200), 0 credits
 *                                      (BR-P4-TRACK-01/02). Over cap → 403 TRACK_LIMIT.
 *   GET    /tracked-listings         — this user's tracked listings.
 *   DELETE /tracked-listings/:id     — untrack (owner-scoped).
 *   GET    /rank-history?listing=&keyword= — GLOBAL rank history for a (listing, keyword).
 *   POST   /shop-analysis-deep       — enqueue a deep analysis. Returns 202 + jobId IMMEDIATELY;
 *                                      NO credit deducted at enqueue (deduct-on-success in the
 *                                      consumer, BR-P4-01). Falls back to inline waitUntil when
 *                                      ANALYSIS_QUEUE is absent (BR-P4-Q-03).
 *   GET    /shop-analysis-deep/:jobId — poll status + result (owner-scoped).
 *
 * Tracking endpoints use a plan check (NOT requireCredits — they are subscription features, not
 * metered tools). The deep-analysis enqueue also does NOT use requireCredits (deduct happens on
 * consumer success); it pre-checks balance to reject early without queuing.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { Queue } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import { getEnv, getUser, getDb } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { normalize } from '../../services/etsy/cache';
import { createTrackedListingsStore, createRankHistoryStore } from '../../services/jobs/jobsStore';
import { createAnalysesJobStore } from '../../services/jobs/analysesJobStore';
import { createSubscriptionRepo } from '../../repositories/subscriptionRepo';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';
import { getToolCost } from '../../services/toolCosts';
import { processDeepAnalysisJob, DEEP_ANALYSIS_TOOL } from '../../jobs/consume';
import type { DeepShopAnalysisJob, AnalysisQueueMessage } from '../../jobs/types';
import type { PlanSlug } from '../../services/types';

// ---------------------------------------------------------------------------
// Plan tracking limits (PM decision: free 0 / side 10 / business 50 / enterprise 200)
// ---------------------------------------------------------------------------
export const TRACK_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  side: 10,
  business: 50,
  enterprise: 200,
};

function trackLimitFor(plan: string): number {
  return (TRACK_LIMITS as Record<string, number>)[plan] ?? TRACK_LIMITS.free;
}

async function readBody<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Extract a numeric listing_id from a URL (…/listing/{id}/…) or a bare digit string. */
function parseListingId(input: string): number | null {
  const m = input.match(/listing\/(\d+)/) ?? input.match(/^(\d+)$/);
  if (m) return Number(m[1]);
  const digits = input.match(/(\d{4,})/);
  return digits ? Number(digits[1]) : null;
}

const router = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// POST /track-listing — plan-gated, 0 credits
// ---------------------------------------------------------------------------
const trackBody = z.object({
  listing: z.string().min(1, 'listing is required'),
  keyword: z.string().min(1, 'keyword is required'),
});

router.post('/track-listing', requireAuth, async (c) => {
  const body = await readBody(c, trackBody);
  if (!body.ok) return body.res;

  const listingId = parseListingId(body.data.listing);
  if (listingId === null) {
    return c.json({ error: 'VALIDATION', message: 'Enter a valid Etsy listing URL or ID.' }, 400);
  }
  const keyword = body.data.keyword.trim();

  const db = getDb(c);
  const user = getUser(c);
  const tracked = createTrackedListingsStore(db);

  // Resolve plan → limit. No subscription row = free tier.
  const sub = await createSubscriptionRepo(db).getByUserId(user.id);
  const plan = sub?.plan ?? 'free';
  const limit = trackLimitFor(plan);

  const count = await tracked.countForUser(user.id);
  if (count >= limit) {
    return c.json(
      {
        error: 'TRACK_LIMIT',
        message:
          limit === 0
            ? 'Tracking is a paid feature. Upgrade your plan to track listings.'
            : `You've reached your plan limit of ${limit} tracked listings. Upgrade to track more.`,
        limit,
        plan,
      },
      403
    );
  }

  const { inserted } = await tracked.add(user.id, listingId, keyword);
  return c.json({ tracked: true, alreadyTracked: !inserted, listingId, keyword: normalize(keyword) }, 201);
});

// ---------------------------------------------------------------------------
// GET /tracked-listings — this user's tracked listings
// ---------------------------------------------------------------------------
router.get('/tracked-listings', requireAuth, async (c) => {
  const db = getDb(c);
  const user = getUser(c);
  const rows = await createTrackedListingsStore(db).listForUser(user.id);
  return c.json({
    listings: rows.map((r) => ({
      id: r.id,
      listingId: r.listing_id,
      keyword: r.keyword,
      lastRank: r.last_rank,
      lastCheckedAt: r.last_checked_at,
      createdAt: r.created_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// DELETE /tracked-listings/:id — untrack
// ---------------------------------------------------------------------------
router.delete('/tracked-listings/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'VALIDATION', message: 'Invalid id.' }, 400);
  }
  const db = getDb(c);
  const user = getUser(c);
  const removed = await createTrackedListingsStore(db).remove(user.id, id);
  if (!removed) return c.json({ error: 'NOT_FOUND', message: 'Tracked listing not found.' }, 404);
  return c.json({ removed: true });
});

// ---------------------------------------------------------------------------
// GET /rank-history?listing=&keyword= — GLOBAL history for a (listing, keyword)
// ---------------------------------------------------------------------------
router.get('/rank-history', requireAuth, async (c) => {
  const listingRaw = c.req.query('listing') ?? '';
  const keyword = (c.req.query('keyword') ?? '').trim();
  const listingId = parseListingId(listingRaw);
  if (listingId === null || !keyword) {
    return c.json({ error: 'VALIDATION', message: 'listing and keyword are required.' }, 400);
  }

  const rows = await createRankHistoryStore(getDb(c)).history(listingId, keyword, 90);
  return c.json({
    listingId,
    keyword: normalize(keyword),
    history: rows.map((r) => ({ position: r.position, capturedAt: r.captured_at })),
  });
});

// ---------------------------------------------------------------------------
// POST /shop-analysis-deep — enqueue (202), NO deduct at enqueue
// ---------------------------------------------------------------------------
const deepBody = z.object({ shop: z.string().min(1, 'shop is required') });

router.post('/shop-analysis-deep', requireAuth, async (c) => {
  const body = await readBody(c, deepBody);
  if (!body.ok) return body.res;

  const shop = body.data.shop.trim();
  const env = getEnv(c);
  const db = getDb(c);
  const user = getUser(c);

  // Pre-check credits (reject 402 WITHOUT queuing) — but do NOT deduct here. The actual
  // 8-credit charge is on consumer success only (BR-P4-01). Cost comes from C's toolCosts.
  const cost = getToolCost(DEEP_ANALYSIS_TOOL);
  if (cost === undefined) {
    return c.json({ error: 'INTERNAL', message: `Unpriced tool: ${DEEP_ANALYSIS_TOOL}` }, 500);
  }
  const credits = createCreditsService(createCreditsRepo(db));
  const balance = await credits.getBalance(user.id);
  if (balance < cost) {
    return c.json({ error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits', balance }, 402);
  }

  // Create the queued job row (id = jobId) then enqueue / inline-fallback.
  const jobs = createAnalysesJobStore(db);
  const jobId = await jobs.enqueue(user.id, shop);
  const message: DeepShopAnalysisJob = {
    kind: 'shop-analysis-deep',
    jobId: String(jobId),
    userId: user.id,
    shop,
    requestedAt: Date.now(),
  };

  const queue = env.ANALYSIS_QUEUE as Queue<AnalysisQueueMessage> | undefined;
  if (queue) {
    await queue.send(message);
  } else {
    // BR-P4-Q-03: no queue binding (plain vite dev) → process inline via waitUntil, never 500.
    const exec = c.executionCtx;
    const work = processDeepAnalysisJob(env, message);
    if (exec && typeof exec.waitUntil === 'function') {
      exec.waitUntil(work);
    } else {
      // No execution context (some test harnesses) — fire and forget without blocking the 202.
      void work.catch((err) => console.error('[jobs] inline deep-analysis failed:', err));
    }
  }

  return c.json({ jobId: String(jobId), status: 'queued' }, 202);
});

// ---------------------------------------------------------------------------
// GET /shop-analysis-deep/:jobId — poll status + result
// ---------------------------------------------------------------------------
router.get('/shop-analysis-deep/:jobId', requireAuth, async (c) => {
  const jobId = Number(c.req.param('jobId'));
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return c.json({ error: 'VALIDATION', message: 'Invalid jobId.' }, 400);
  }
  const db = getDb(c);
  const user = getUser(c);
  const job = await createAnalysesJobStore(db).get(user.id, jobId);
  if (!job) return c.json({ error: 'NOT_FOUND', message: 'Job not found.' }, 404);

  let creditsRemaining: number | undefined;
  if (job.status === 'done') {
    creditsRemaining = await createCreditsService(createCreditsRepo(db)).getBalance(user.id);
  }

  return c.json({
    jobId: String(job.id),
    status: job.status,
    shop: job.shop,
    result: job.result,
    error: job.error,
    paymentFailed: job.paymentFailed,
    creditsRemaining,
  });
});

export default router;
