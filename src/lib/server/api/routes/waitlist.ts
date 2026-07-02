/**
 * Waitlist routes — `/api/waitlist/*`. Honest interest capture for DEFERRED tools (Video Maker /
 * video-generator), whose render backend isn't built yet. The tool page's "Join waitlist" form
 * POSTs here (`tools-client.ts` → `joinVideoWaitlist`).
 *
 * Default-exported `Hono<AppEnv>`, mounted in `app.ts` via `app.route('/waitlist', waitlist)`.
 * Auth-gated: the form lives inside the dashboard, so we tie each signup to the signed-in user.
 *
 * Endpoints:
 *   POST /:tool  — record an email on a known tool's waitlist (idempotent per tool+email).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';

const router = new Hono<AppEnv>();

router.use('*', requireAuth);

/** Tools that expose a waitlist. Anything else 404s (no arbitrary list creation). */
const ALLOWED_TOOLS = new Set(['video-generator']);

// Mirror the FE's email check (tools/video-generator/+page.svelte) rather than rely on a
// specific zod version's `.email()`.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const bodySchema = z.object({
  email: z.string().min(3).max(320).refine((s) => EMAIL_RE.test(s.trim()), 'Invalid email'),
});

// POST /:tool — add the signed-in user's email to a tool's waitlist (idempotent).
router.post('/:tool', async (c) => {
  const tool = c.req.param('tool');
  if (!ALLOWED_TOOLS.has(tool)) {
    return c.json({ error: 'NOT_FOUND', message: 'Unknown waitlist.' }, 404);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: 'A valid email is required.' }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const userId = getUser(c).id;

  // Idempotent: re-joining the same (tool, email) is a no-op success (no duplicate row, no error).
  await getDb(c)
    .prepare(
      'INSERT INTO waitlist (tool, email, user_id, created_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(tool, email) DO NOTHING'
    )
    .bind(tool, email, userId)
    .run();

  return c.json({ joined: true });
});

export default router;
