/**
 * GET /api/me/history (Engineer F) — the signed-in user's recent saved analyses.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted next to the `me` router (it shares the `/api/me`
 * prefix in `app.ts`, e.g. `me.route('/', history)` — same merge pattern as the tools routers).
 * This file does NOT mount itself.
 *
 * Reads the 40 most-recent rows from the `analyses` table (newest first) via
 * `createAnalysesStore(...).recentForUser`. Every tool that calls `recordRun` (tag-gap, rank-check,
 * listing-analyzer, …) shows up here. The stored `payload` is JSON; a malformed/legacy row degrades
 * to an empty `summary` object rather than failing the whole feed.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getDb, getUser } from '../context';
import { createAnalysesStore } from '../../services/etsy/analysesStore';

const router = new Hono<AppEnv>();

router.get('/history', requireAuth, async (c) => {
  const rows = await createAnalysesStore(getDb(c)).recentForUser(getUser(c).id, 40);
  const items = rows.map((r) => {
    let summary: unknown = {};
    try {
      summary = JSON.parse(r.payload);
    } catch {
      /* legacy / malformed payload → empty summary */
    }
    return { id: r.id, tool: r.tool, subject: r.subject, createdAt: r.created_at, summary };
  });
  return c.json({ items });
});

export default router;
