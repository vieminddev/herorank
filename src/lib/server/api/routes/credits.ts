/**
 * GET /api/credits (Engineer C) — current balance + recent ledger entries (spec §9).
 *
 * Mounted at `/api/credits` by `app.ts`. `requireAuth` populates `getUser(c)`. Returns the
 * authoritative balance (BR-007) and the last 20 ledger rows (newest first) for an activity
 * view (BR-006).
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getDb, getUser } from '../context';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';

const LEDGER_LIMIT = 20;

const router = new Hono<AppEnv>();

router.get('/', requireAuth, async (c) => {
  const user = getUser(c);
  const repo = createCreditsRepo(getDb(c));
  const credits = createCreditsService(repo);

  const [balance, ledger] = await Promise.all([
    credits.getBalance(user.id),
    repo.recentLedger(user.id, LEDGER_LIMIT),
  ]);

  return c.json({ balance, ledger });
});

export default router;
