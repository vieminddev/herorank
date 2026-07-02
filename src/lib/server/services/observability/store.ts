/**
 * Observability sinks (best-effort, never block a request/cron):
 *   - recordError   → persist a 5xx/uncaught error to D1 `error_log` (queryable via wrangler).
 *   - recordCronRun → audit every scheduled job to `cron_runs` + write a KV heartbeat on success.
 *   - cronWatchdog  → if a daily job's heartbeat is overdue, email an operational alert (debounced).
 *
 * Why D1 (not just console): `SELECT * FROM error_log ORDER BY at DESC` needs no external service —
 * production errors and cron health are inspectable directly. All writes swallow their own errors so
 * logging can never be the thing that breaks the app.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { sendEmail, isEmailConfigured } from '../email';

const nowSec = (): number => Math.floor(Date.now() / 1000);
const clip = (s: string | undefined, n: number): string | null => (s ? s.slice(0, n) : null);

export interface ErrorFields {
  where: string;
  method?: string;
  status?: number;
  message?: string;
  detail?: string;
  userId?: string;
}

/** Persist a production error to D1. Best-effort — swallows its own failures. */
export async function recordError(db: D1Database, f: ErrorFields): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO error_log (at, where_at, method, status, message, detail, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(nowSec(), clip(f.where, 200) ?? '?', f.method ?? null, f.status ?? null, clip(f.message, 500), clip(f.detail, 1000), f.userId ?? null)
      .run();
  } catch {
    /* logging must never break the request */
  }
}

/** Cron jobs whose daily heartbeat the watchdog monitors (hours-overdue threshold). */
const WATCHED: ReadonlyArray<{ job: string; maxAgeH: number }> = [
  { job: 'trends', maxAgeH: 26 },
  { job: 'best-sellers', maxAgeH: 26 },
];

/** Audit a cron run + (on success) refresh its heartbeat and clear any prior overdue-alert flag. */
export async function recordCronRun(env: Env, job: string, ok: boolean, detail?: string): Promise<void> {
  const now = nowSec();
  try {
    await env.DB.prepare('INSERT INTO cron_runs (job, ok, detail, ran_at) VALUES (?, ?, ?, ?)')
      .bind(job, ok ? 1 : 0, clip(detail, 500), now)
      .run();
  } catch {
    /* best-effort */
  }
  if (ok) {
    try {
      await env.KV.put(`cron:hb:${job}`, String(now));
      await env.KV.delete(`cron:alert:${job}`); // recovered → re-arm alerting
    } catch {
      /* best-effort */
    }
  }
}

async function sendOverdueAlert(env: Env, job: string, ageH: number): Promise<boolean> {
  const to = env.ALERT_EMAIL || env.EMAIL_FROM;
  if (!to || !isEmailConfigured(env)) return false;
  return sendEmail(env, {
    to,
    subject: `[VieRank] Cron "${job}" overdue (${ageH}h)`,
    html: `<p>The scheduled job <b>${job}</b> hasn't succeeded in <b>${ageH} hours</b>. Cron-built data (best-sellers / Etsy trends) may be going stale.</p><p>Check the Worker's cron triggers and logs.</p>`,
    text: `VieRank cron "${job}" overdue ${ageH}h — cron-built data may be stale. Check Worker cron triggers/logs.`,
  });
}

/**
 * Run on the frequent (30-min) trigger: if a watched daily job's last success is overdue, send ONE
 * alert email (debounced to ~daily via a KV flag that recordCronRun clears on recovery). A job with
 * no heartbeat yet (cold start) is skipped — no false alarms before the first daily run.
 */
export async function cronWatchdog(env: Env): Promise<void> {
  const now = nowSec();
  for (const { job, maxAgeH } of WATCHED) {
    let hb = 0;
    try {
      hb = Number(await env.KV.get(`cron:hb:${job}`)) || 0;
    } catch {
      continue;
    }
    if (hb === 0) continue; // never recorded yet → don't false-alarm
    const ageH = Math.round((now - hb) / 3600);
    if (ageH <= maxAgeH) continue;
    let alerted: string | null = null;
    try {
      alerted = await env.KV.get(`cron:alert:${job}`);
    } catch {
      /* ignore */
    }
    if (alerted) continue; // already alerted within the debounce window
    const sent = await sendOverdueAlert(env, job, ageH);
    try {
      await env.KV.put(`cron:alert:${job}`, String(now), { expirationTtl: 23 * 3600 });
    } catch {
      /* ignore */
    }
    console.error(`[CRON-ALERT] "${job}" overdue ${ageH}h (alert email sent: ${sent})`);
  }
}
