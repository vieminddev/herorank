/**
 * VEO3 webhook (AI Video Studio) — mounted at /api/webhook by app.ts.
 *
 *   POST /api/webhook/veo3?token=<secret>   (token-gated, NOT requireAuth)
 *
 * VEO3 calls this when a video task finishes. It is NOT behind requireAuth — VEO3 has no session;
 * instead we verify the `?token=` we embedded in the submit's callbackUrl (VEO3_WEBHOOK_SECRET,
 * falling back to VEO3_API_KEY).
 *
 * On `completed`: download the MP4 once (the server GCs it after a single stream) and store it in R2
 * at video-jobs/{id}/out.mp4, then mark the job done. On `failed`: mark error and refund the 20
 * credits (idempotent — a webhook retry refunds at most once).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getEnv } from '../context';
import { createVideoJobsRepo } from '../../repositories/videoJobsRepo';
import { createImageJobsRepo } from '../../repositories/imageJobsRepo';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';
import { downloadAsset, veo3ConfigFromEnv } from '../../services/veo3Service';
import { rebrandImageMetadata } from '../../services/imageMetadata';

const payloadSchema = z.object({
  taskId: z.string().min(1),
  status: z.string().min(1),
  downloadUrl: z.string().optional(),
  localPath: z.string().optional(),
  error: z.string().optional(),
});

const router = new Hono<AppEnv>();

router.post('/veo3', async (c) => {
  const env = getEnv(c);

  // Verify the shared secret we embedded in callbackUrl.
  const expected = env.VEO3_WEBHOOK_SECRET ?? env.VEO3_API_KEY ?? '';
  const token = c.req.query('token') ?? '';
  if (!expected || token !== expected) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION' }, 400);
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION' }, 400);
  }
  const { taskId, status, downloadUrl, error } = parsed.data;
  const db = getDb(c);
  const isCompleted = status === 'completed' || status === 'done' || status === 'success';

  // --- Image jobs (Image Studio async pipeline) — callbackUrl carried ?kind=image. ---
  if (c.req.query('kind') === 'image') {
    const imgRepo = createImageJobsRepo(db);
    const job = await imgRepo.get(taskId);
    if (!job) return c.json({ received: true }); // unknown → ack
    if (isCompleted && downloadUrl) {
      const veo3 = veo3ConfigFromEnv(env);
      if (!veo3 || !env.ARCHIVE) return c.json({ error: 'IMAGE_UNAVAILABLE' }, 500);
      try {
        const buf = await downloadAsset(veo3, downloadUrl);
        // White-label the provider's (Google) C2PA/EXIF before storing; detect png vs jpeg.
        const bytes = rebrandImageMetadata(new Uint8Array(buf));
        const ct = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
        await env.ARCHIVE.put(`image-jobs/${job.id}/out`, bytes, { httpMetadata: { contentType: ct } });
        await imgRepo.markDone(job.id);
      } catch (err) {
        console.error('[webhook/veo3] image download/store failed', job.id, (err as Error).message);
        return c.json({ error: 'DOWNLOAD_FAILED' }, 500); // 500 → VEO3 retries (file GC'd only after success)
      }
      return c.json({ received: true });
    }
    if (error) console.error('[webhook/veo3] image job failed', job.id, error);
    await imgRepo.markError(job.id, 'Generation failed');
    if (job.credits_charged > 0 && (await imgRepo.claimRefund(job.id))) {
      const credits = createCreditsService(createCreditsRepo(db));
      await credits.refundCredits(job.user_id, job.credits_charged, `refund:image-studio:${job.id}`, 'refund:image-studio');
    }
    return c.json({ received: true });
  }

  const repo = createVideoJobsRepo(db);
  const job = await repo.get(taskId); // our jobId == externalTaskId
  if (!job) {
    // Unknown task — ack so VEO3 stops retrying.
    return c.json({ received: true });
  }

  if (isCompleted && downloadUrl) {
    const veo3 = veo3ConfigFromEnv(env);
    if (!veo3 || !env.ARCHIVE) {
      // Can't fetch/store — 500 so VEO3 retries later (when config is restored).
      return c.json({ error: 'VIDEO_UNAVAILABLE' }, 500);
    }
    try {
      const bytes = await downloadAsset(veo3, downloadUrl);
      await env.ARCHIVE.put(`video-jobs/${job.id}/out.mp4`, bytes, {
        httpMetadata: { contentType: 'video/mp4' },
      });
      await repo.markDone(job.id);
    } catch (err) {
      // Download/store failed — 500 lets VEO3 retry (file is GC'd only after a SUCCESSFUL stream).
      console.error('[webhook/veo3] download/store failed', job.id, (err as Error).message);
      return c.json({ error: 'DOWNLOAD_FAILED' }, 500);
    }
    return c.json({ received: true });
  }

  // Failure (or completed without a downloadUrl) → mark error + refund once.
  // Store a clean, white-labeled reason (the raw provider error may name the vendor); keep the
  // real reason in logs for debugging.
  if (error) console.error('[webhook/veo3] job failed', job.id, error);
  await repo.markError(job.id, 'Video render failed');
  if (job.credits_charged > 0 && (await repo.claimRefund(job.id))) {
    const credits = createCreditsService(createCreditsRepo(db));
    await credits.refundCredits(
      job.user_id,
      job.credits_charged,
      `refund:video-studio:${job.id}`,
      'refund:video-studio'
    );
  }
  return c.json({ received: true });
});

export default router;
