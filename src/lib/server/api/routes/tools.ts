/**
 * POST /api/tools/echo (Engineer C) — Phase 1 demo tool (spec §4.5).
 *
 * Exercises the full chain: `requireAuth → requireCredits('echo') → handler → deduct → ledger`.
 * The handler just echoes the input text; `requireCredits` charges 1 credit (BR-004) AFTER
 * the handler succeeds, then exposes the remaining balance via `getCreditsRemaining`.
 *
 * Response: `{ result, creditsRemaining }` — the handler returns `{ result }`; `requireCredits`
 * merges `creditsRemaining` after the post-handler deduct. Insufficient credits → 402
 * (emitted by the middleware before/after the handler). Bad body → 400 VALIDATION.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import llmTools from './llm-tools';
import etsyTools from './etsy-tools';
import jobs from './jobs';
import experiments from './experiments';
import image from './image';

const echoBody = z.object({
  text: z.string().min(1, 'text is required').max(2000),
});

const router = new Hono<AppEnv>();

router.post('/echo', requireAuth, requireCredits('echo'), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }

  const parsed = echoBody.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
      400
    );
  }

  // The actual "tool" work — trivially echo the input. requireCredits charges after this
  // returns 2xx (so a 400 above costs the user nothing) and merges `creditsRemaining` into
  // this body.
  return c.json({ result: parsed.data.text });
});

// Mount Phase 2 LLM tools (Engineer D's router) under the same /api/tools prefix.
// Relative paths in llm-tools.ts (/title-generator, /rankhero-ai/chat, etc.) become
// /api/tools/* automatically since app.ts already mounts this router at /api/tools.
router.route('/', llmTools);

// Mount Phase 3 Etsy tools (Engineer F's router) — 7 endpoints.
// Relative paths in etsy-tools.ts (/listing-analyzer, etc.) become /api/tools/* automatically.
router.route('/', etsyTools);

// Mount Phase 4 jobs router (Engineer F) — rank tracking + deep shop analysis.
// Relative paths in jobs.ts (/track-listing, /shop-analysis-deep, etc.) become /api/tools/*.
router.route('/', jobs);

// Phase 5/6 additions: title experiments + AI image studio (relative paths
// /experiments, /image-studio → /api/tools/* via the same mount).
router.route('/', experiments);
router.route('/', image);

export default router;
