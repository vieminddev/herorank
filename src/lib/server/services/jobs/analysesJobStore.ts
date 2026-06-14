/**
 * Deep-analysis job lifecycle over Phase 3's `analyses` table (Engineer F owns) — §2.5.
 *
 * The queue REUSES `analyses` (0003) rather than adding a table (A4). Phase 3's
 * `analysesStore` is append-only history for rank-check; the deep-analysis job instead needs
 * a mutable status row (queued → running → done/failed/deferred). The 0003 `analyses` schema
 * has no `status` column, so we encode status + result inside the JSON `payload` (one source
 * of truth, no migration churn) and key the job by the row `id`.
 *
 * Payload JSON shape: `{ status, shop, result?, error?, updatedAt }`. `metric` mirrors a cheap
 * headline number when done (e.g. estimated monthly sales) for future charting.
 */
import type { D1Database } from '@cloudflare/workers-types';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'deferred';

export interface DeepAnalysisPayload {
  status: JobStatus;
  shop: string;
  result?: unknown;
  error?: string;
  /** Set true if the job finished but the success-deduct lost the credit race (BR-P4-01 race). */
  paymentFailed?: boolean;
  updatedAt: number; // epoch ms
}

export interface JobView {
  id: number;
  userId: string;
  status: JobStatus;
  shop: string;
  result?: unknown;
  error?: string;
  paymentFailed?: boolean;
}

export interface AnalysesJobStore {
  /** Create a queued deep-analysis row; returns its id (the queue message `jobId`). */
  enqueue(userId: string, shop: string): Promise<number>;
  /** Read a job (owner-scoped) for the poll endpoint, or null if not found / not owner. */
  get(userId: string, id: number): Promise<JobView | null>;
  /** Read a job by id WITHOUT owner scoping (consumer context — owner is in the message). */
  getById(id: number): Promise<JobView | null>;
  /** Patch the job payload (status transition + optional result/error/metric). */
  update(
    id: number,
    patch: { status: JobStatus; result?: unknown; error?: string; paymentFailed?: boolean; metric?: number | null }
  ): Promise<void>;
}

const TOOL = 'shop-analysis-deep';

interface AnalysisRow {
  id: number;
  user_id: string;
  subject: string;
  payload: string;
}

function parsePayload(raw: string, fallbackShop: string): DeepAnalysisPayload {
  try {
    const p = JSON.parse(raw) as DeepAnalysisPayload;
    if (p && typeof p.status === 'string') return p;
  } catch {
    /* fall through */
  }
  return { status: 'queued', shop: fallbackShop, updatedAt: Date.now() };
}

function toView(row: AnalysisRow): JobView {
  const p = parsePayload(row.payload, row.subject);
  return {
    id: row.id,
    userId: row.user_id,
    status: p.status,
    shop: p.shop ?? row.subject,
    result: p.result,
    error: p.error,
    paymentFailed: p.paymentFailed,
  };
}

export function createAnalysesJobStore(db: D1Database): AnalysesJobStore {
  return {
    async enqueue(userId, shop) {
      const payload: DeepAnalysisPayload = { status: 'queued', shop, updatedAt: Date.now() };
      const row = await db
        .prepare(
          'INSERT INTO analyses (user_id, tool, subject, payload, metric) VALUES (?, ?, ?, ?, ?) RETURNING id'
        )
        .bind(userId, TOOL, shop, JSON.stringify(payload), null)
        .first<{ id: number }>();
      if (!row) throw new Error('Failed to enqueue deep-analysis job');
      return row.id;
    },

    async get(userId, id) {
      const row = await db
        .prepare('SELECT id, user_id, subject, payload FROM analyses WHERE id = ? AND user_id = ? AND tool = ?')
        .bind(id, userId, TOOL)
        .first<AnalysisRow>();
      return row ? toView(row) : null;
    },

    async getById(id) {
      const row = await db
        .prepare('SELECT id, user_id, subject, payload FROM analyses WHERE id = ? AND tool = ?')
        .bind(id, TOOL)
        .first<AnalysisRow>();
      return row ? toView(row) : null;
    },

    async update(id, patch) {
      const existing = await db
        .prepare('SELECT id, user_id, subject, payload FROM analyses WHERE id = ? AND tool = ?')
        .bind(id, TOOL)
        .first<AnalysisRow>();
      if (!existing) return;
      const prev = parsePayload(existing.payload, existing.subject);
      const next: DeepAnalysisPayload = {
        status: patch.status,
        shop: prev.shop,
        result: patch.result !== undefined ? patch.result : prev.result,
        error: patch.error !== undefined ? patch.error : prev.error,
        paymentFailed: patch.paymentFailed !== undefined ? patch.paymentFailed : prev.paymentFailed,
        updatedAt: Date.now(),
      };
      const metric = patch.metric === undefined ? null : patch.metric;
      await db
        .prepare('UPDATE analyses SET payload = ?, metric = ? WHERE id = ?')
        .bind(JSON.stringify(next), metric, id)
        .run();
    },
  };
}
