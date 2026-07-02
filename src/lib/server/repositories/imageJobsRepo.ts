/**
 * image_jobs repository (AI Image Studio) — D1 data access for async image generation jobs.
 *
 * Consumed by routes/image.ts (submit/list/status/asset) and routes/webhook-veo3.ts (mark done/error
 * + refund for VEO3 images). Parameterized queries only.
 */
import type { D1Database } from '@cloudflare/workers-types';

export type ImageJobStatus = 'pending' | 'done' | 'error';

export interface ImageJob {
  id: string;
  user_id: string;
  batch_id: string;
  status: ImageJobStatus;
  provider: string;
  mode: string;
  prompt: string;
  size: string;
  credits_charged: number;
  refunded: number;
  error_msg: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateImageJob {
  id: string;
  userId: string;
  batchId: string;
  provider: string;
  mode: string;
  prompt: string;
  size: string;
  creditsCharged: number;
}

export interface ImageJobsRepo {
  create(job: CreateImageJob): Promise<void>;
  get(id: string): Promise<ImageJob | null>;
  listByUser(userId: string, limit: number): Promise<ImageJob[]>;
  markDone(id: string): Promise<void>;
  markError(id: string, errorMsg: string): Promise<void>;
  /** Flip refunded 0→1 atomically; returns true only for the first caller (idempotent refund guard). */
  claimRefund(id: string): Promise<boolean>;
}

export function createImageJobsRepo(db: D1Database): ImageJobsRepo {
  return {
    async create(j) {
      await db
        .prepare(
          `INSERT INTO image_jobs
             (id, user_id, batch_id, status, provider, mode, prompt, size, credits_charged)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
        )
        .bind(j.id, j.userId, j.batchId, j.provider, j.mode, j.prompt, j.size, j.creditsCharged)
        .run();
    },

    async get(id) {
      return (
        (await db.prepare('SELECT * FROM image_jobs WHERE id = ?').bind(id).first<ImageJob>()) ?? null
      );
    },

    async listByUser(userId, limit) {
      const { results } = await db
        .prepare('SELECT * FROM image_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
        .bind(userId, limit)
        .all<ImageJob>();
      return results ?? [];
    },

    async markDone(id) {
      await db
        .prepare("UPDATE image_jobs SET status = 'done', updated_at = unixepoch() WHERE id = ?")
        .bind(id)
        .run();
    },

    async markError(id, errorMsg) {
      await db
        .prepare("UPDATE image_jobs SET status = 'error', error_msg = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(errorMsg.slice(0, 500), id)
        .run();
    },

    async claimRefund(id) {
      const res = await db
        .prepare('UPDATE image_jobs SET refunded = 1 WHERE id = ? AND refunded = 0')
        .bind(id)
        .run();
      return ((res as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
    },
  };
}
