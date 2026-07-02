/**
 * video_jobs repository (AI Video Studio) — D1 data access for async VEO3 video jobs.
 *
 * Consumed by routes/video.ts (submit/list/status/seed/asset) and routes/webhook-veo3.ts (mark
 * done/error + refund). Parameterized queries only.
 */
import type { D1Database } from '@cloudflare/workers-types';

export type VideoJobStatus = 'pending' | 'done' | 'error';

export interface VideoJob {
  id: string;
  user_id: string;
  status: VideoJobStatus;
  clip_type: string;
  video_mode: string;
  aspect: string;
  duration: string;
  prompt: string;
  seed_token: string | null;
  credits_charged: number;
  refunded: number;
  error_msg: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateVideoJob {
  id: string;
  userId: string;
  clipType: string;
  videoMode: string;
  aspect: string;
  duration: string;
  prompt: string;
  seedToken: string | null;
  creditsCharged: number;
}

export interface VideoJobsRepo {
  create(job: CreateVideoJob): Promise<void>;
  get(id: string): Promise<VideoJob | null>;
  listByUser(userId: string, limit: number): Promise<VideoJob[]>;
  markDone(id: string): Promise<void>;
  markError(id: string, errorMsg: string): Promise<void>;
  /** Flip refunded 0→1 atomically; returns true only for the first caller (idempotent refund guard). */
  claimRefund(id: string): Promise<boolean>;
}

export function createVideoJobsRepo(db: D1Database): VideoJobsRepo {
  return {
    async create(j) {
      await db
        .prepare(
          `INSERT INTO video_jobs
             (id, user_id, status, clip_type, video_mode, aspect, duration, prompt, seed_token, credits_charged)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(j.id, j.userId, j.clipType, j.videoMode, j.aspect, j.duration, j.prompt, j.seedToken, j.creditsCharged)
        .run();
    },

    async get(id) {
      return (
        (await db.prepare('SELECT * FROM video_jobs WHERE id = ?').bind(id).first<VideoJob>()) ?? null
      );
    },

    async listByUser(userId, limit) {
      const { results } = await db
        .prepare('SELECT * FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
        .bind(userId, limit)
        .all<VideoJob>();
      return results ?? [];
    },

    async markDone(id) {
      await db
        .prepare("UPDATE video_jobs SET status = 'done', updated_at = unixepoch() WHERE id = ?")
        .bind(id)
        .run();
    },

    async markError(id, errorMsg) {
      await db
        .prepare("UPDATE video_jobs SET status = 'error', error_msg = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(errorMsg.slice(0, 500), id)
        .run();
    },

    async claimRefund(id) {
      const res = await db
        .prepare('UPDATE video_jobs SET refunded = 1 WHERE id = ? AND refunded = 0')
        .bind(id)
        .run();
      return ((res as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
    },
  };
}
