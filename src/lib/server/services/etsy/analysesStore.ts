/**
 * Saved analyses store (Engineer F owns, spec §2.4) — D1 `analyses` table.
 *
 * Phase 3 uses this for rank-check's REAL history chart (replaces the mock 7-day data): each
 * rank check appends a row (`tool='rank-check'`, `subject='<listingId>:<kw>'`, `metric=position`),
 * and the chart/best-rank reads back this user's prior points. Other tools MAY write but the FE
 * does not yet read their history.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface AnalysisRow {
  metric: number | null;
  created_at: number; // epoch seconds
  payload: string;
}

/** A recent saved analysis for the user's history feed (`/api/me/history`). */
export interface RecentAnalysisRow {
  id: number;
  tool: string;
  subject: string;
  payload: string;
  created_at: number; // epoch seconds
}

export interface AnalysesStore {
  insert(input: {
    userId: string;
    tool: string;
    subject: string;
    payload: unknown;
    metric?: number | null;
  }): Promise<void>;
  /** This user's history for a tool+subject, oldest→newest, capped to `limit` rows. */
  history(userId: string, tool: string, subject: string, limit?: number): Promise<AnalysisRow[]>;
  /** This user's most recent saved analyses across all tools, newest→oldest. */
  recentForUser(userId: string, limit?: number): Promise<RecentAnalysisRow[]>;
}

export function createAnalysesStore(db: D1Database): AnalysesStore {
  return {
    async insert({ userId, tool, subject, payload, metric = null }): Promise<void> {
      await db
        .prepare(
          'INSERT INTO analyses (user_id, tool, subject, payload, metric) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(userId, tool, subject, JSON.stringify(payload), metric)
        .run();
    },

    async history(userId, tool, subject, limit = 30): Promise<AnalysisRow[]> {
      const res = await db
        .prepare(
          'SELECT metric, created_at, payload FROM analyses ' +
            'WHERE user_id = ? AND tool = ? AND subject = ? ' +
            'ORDER BY created_at ASC LIMIT ?'
        )
        .bind(userId, tool, subject, limit)
        .all<AnalysisRow>();
      return res.results ?? [];
    },

    async recentForUser(userId, limit = 40): Promise<RecentAnalysisRow[]> {
      const res = await db
        .prepare(
          'SELECT id, tool, subject, payload, created_at FROM analyses ' +
            'WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
        )
        .bind(userId, limit)
        .all<RecentAnalysisRow>();
      return res.results ?? [];
    },
  };
}
