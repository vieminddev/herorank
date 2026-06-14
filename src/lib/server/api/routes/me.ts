/**
 * GET /api/me (Engineer C) — current user + subscription + credit balance (spec §9).
 *
 * Mounted at `/api/me` by `app.ts`. `requireAuth` populates `getUser(c)`. Balance is the
 * authoritative ledger sum (BR-007); subscription falls back to a `free`/`active` default if
 * the row hasn't been written yet (e.g. a brief window right after signup).
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getDb, getUser } from '../context';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';

const router = new Hono<AppEnv>();

router.get('/', requireAuth, async (c) => {
  const user = getUser(c);
  const repo = createCreditsRepo(getDb(c));
  const credits = createCreditsService(repo);

  const [subscription, balance] = await Promise.all([
    repo.getSubscription(user.id),
    credits.getBalance(user.id),
  ]);

  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
    subscription: {
      plan: subscription?.plan ?? 'free',
      status: subscription?.status ?? 'active',
      period: subscription?.period ?? null,
    },
    credits: { balance },
  });
});

export default router;
