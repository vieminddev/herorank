/**
 * video-studio routes (AI Video Studio) — mounted under /api/tools/* via routes/tools.ts.
 *
 * Turns a hero photo into ONE short, looping, Etsy-spec listing video using VEO3 (image-to-video).
 * Generation is ASYNC: submit enqueues a VEO3 task (charged 20 credits via requireCredits) and
 * returns `{ jobId, status:'pending' }`; the finished MP4 arrives via webhook (routes/webhook-veo3)
 * and is stored in R2. The client polls `GET /video-jobs/:id` until `done`.
 *
 * Endpoints:
 *   POST /video-studio            (auth + credits) → { jobId, status }
 *   GET  /video-jobs              (auth)           → { jobs: [...] }      recent jobs for the user
 *   GET  /video-jobs/:id          (auth, owner)    → { status, url?, error? }
 *   GET  /video-jobs/:id/asset    (auth, owner)    → MP4 stream from R2
 *   GET  /video-jobs/:id/seed     (token-gated)    → seed image for VEO3 to fetch (no cookie auth)
 *
 * Requires `ARCHIVE` (R2) + `VEO3_SERVER_URL` + `VEO3_API_KEY`; otherwise 503 VIDEO_UNAVAILABLE
 * (no credit spent). The hero→video seed transport relies on the VEO3 server accepting
 * `config.startImageUrl` — see docs/ai-video-studio-plan.md.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getEnv, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { createVideoJobsRepo } from '../../repositories/videoJobsRepo';
import { submitVideo, veo3ConfigFromEnv } from '../../services/veo3Service';

const CLIP_TYPES = ['turntable', 'lifestyle', 'detail', 'reveal'] as const;
type ClipType = (typeof CLIP_TYPES)[number];

const inputSchema = z.object({
  clipType: z.enum(CLIP_TYPES),
  /** Etsy listing video: portrait (mobile-first) or landscape. */
  aspect: z.enum(['portrait', 'landscape']).default('portrait'),
  duration: z.enum(['4s', '6s', '8s']).default('8s'),
  /** Hero image (data URL or raw base64) for image-to-video. Absent → text→video. ~12MB cap. */
  heroImage: z.string().max(12_000_000).optional(),
  /** Optional text describing the product (used for text→video and to enrich the prompt). */
  productDesc: z.string().max(800).optional(),
});

const CLIP_PROMPTS: Record<ClipType, string> = {
  turntable:
    'Slow, smooth 360-degree turntable rotation of the product on a clean studio surface, even soft lighting, the product stays perfectly centered and in sharp focus, photorealistic, seamless loop',
  lifestyle:
    'The product shown in a warm, natural real-world setting with gentle camera movement, cozy editorial mood, soft natural light, shallow depth of field, photorealistic, seamless loop',
  detail:
    'Extreme close-up macro camera slowly gliding across the product, revealing its texture, materials and fine craftsmanship, soft even lighting, sharp focus, photorealistic, seamless loop',
  reveal:
    'A gentle zoom-out that reveals the full product on a clean, uncluttered background, smooth cinematic motion, soft lighting, photorealistic, seamless loop',
};

/** Build the VEO3 prompt: clip scaffolding + product + Etsy constraints (silent, no text overlays). */
function buildVideoPrompt(clipType: ClipType, productDesc: string | undefined, hasSeed: boolean): string {
  const base = CLIP_PROMPTS[clipType];
  const subject = hasSeed
    ? ' Keep the exact same product shown in the reference image — identical design, colours, materials and any text.'
    : productDesc
      ? ` The product: ${productDesc.trim()}.`
      : '';
  // Etsy mutes listing videos and clips >15s — keep it silent and short; no captions baked in.
  return `${base}.${subject} No on-screen text or captions, no logos, no watermark.`;
}

/** base64 / data-URL → Uint8Array. */
function decodeImage(input: string): Uint8Array {
  const raw = input.includes(',') && input.startsWith('data:') ? input.slice(input.indexOf(',') + 1) : input;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function publicBase(c: Context<AppEnv>): string {
  const env = getEnv(c);
  return (env.BETTER_AUTH_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
}

const router = new Hono<AppEnv>();

router.post('/video-studio', requireAuth, requireCredits('video-studio'), async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }
  const input = parsed.data;

  const env = getEnv(c);
  const veo3 = veo3ConfigFromEnv(env);
  const archive = env.ARCHIVE;
  if (!veo3 || !archive) {
    return c.json(
      { error: 'VIDEO_UNAVAILABLE', message: 'AI video is not configured yet. Please try again later.' },
      503
    );
  }

  const user = getUser(c);
  const db = getDb(c);
  const repo = createVideoJobsRepo(db);

  const jobId = crypto.randomUUID();
  const hasSeed = !!input.heroImage;
  const videoMode = hasSeed ? 'image' : 'text';
  const prompt = buildVideoPrompt(input.clipType, input.productDesc, hasSeed);
  const base = publicBase(c);

  // Store the hero seed in R2 and expose a token-gated public URL the VEO3 server can download.
  let startImageUrl: string | undefined;
  let seedToken: string | null = null;
  if (hasSeed && input.heroImage) {
    seedToken = crypto.randomUUID();
    try {
      await archive.put(`video-jobs/${jobId}/seed.png`, decodeImage(input.heroImage), {
        httpMetadata: { contentType: 'image/png' },
      });
    } catch {
      return c.json({ error: 'VIDEO_UNAVAILABLE', message: 'Could not stage the hero image.' }, 503);
    }
    startImageUrl = `${base}/api/tools/video-jobs/${jobId}/seed?t=${seedToken}`;
  }

  const webhookSecret = env.VEO3_WEBHOOK_SECRET ?? env.VEO3_API_KEY ?? '';
  const callbackUrl = `${base}/api/webhook/veo3?token=${encodeURIComponent(webhookSecret)}`;

  await repo.create({
    id: jobId,
    userId: user.id,
    clipType: input.clipType,
    videoMode,
    aspect: input.aspect,
    duration: input.duration,
    prompt,
    seedToken,
    creditsCharged: 20,
  });

  let queueEta: { seconds: number; message: string | null } | null = null;
  try {
    const sub = await submitVideo(veo3, {
      externalTaskId: jobId,
      prompt,
      videoMode,
      aspect: input.aspect,
      duration: input.duration,
      startImageUrl,
      callbackUrl,
    });
    if (sub.queue?.estimatedWaitSeconds) {
      queueEta = { seconds: sub.queue.estimatedWaitSeconds, message: sub.queue.message ?? null };
    }
  } catch (err) {
    // Submit failed before any work — mark error and return non-2xx so NO credit is charged.
    // Keep the real reason in logs; store a clean (vendor-free) message on the job row.
    console.error('[video-studio] submit failed', jobId, err instanceof Error ? err.message : err);
    await repo.markError(jobId, 'Could not start render');
    return c.json({ error: 'VIDEO_BUSY', message: 'The video service is busy. Please retry shortly.' }, 502);
  }

  return c.json({ jobId, status: 'pending', eta: queueEta });
});

/** Serialize a job row for the client (no internal fields). */
function publicJob(j: {
  id: string;
  status: string;
  clip_type: string;
  aspect: string;
  duration: string;
  error_msg: string | null;
  created_at: number;
}) {
  return {
    id: j.id,
    status: j.status,
    clipType: j.clip_type,
    aspect: j.aspect,
    duration: j.duration,
    createdAt: j.created_at,
    url: j.status === 'done' ? `/api/tools/video-jobs/${j.id}/asset` : null,
    error: j.error_msg ?? null,
  };
}

router.get('/video-jobs', requireAuth, async (c) => {
  const repo = createVideoJobsRepo(getDb(c));
  const jobs = await repo.listByUser(getUser(c).id, 20);
  return c.json({ jobs: jobs.map(publicJob) });
});

router.get('/video-jobs/:id', requireAuth, async (c) => {
  const repo = createVideoJobsRepo(getDb(c));
  const job = await repo.get(c.req.param('id'));
  if (!job || job.user_id !== getUser(c).id) {
    return c.json({ error: 'NOT_FOUND', message: 'Job not found' }, 404);
  }
  return c.json(publicJob(job));
});

router.get('/video-jobs/:id/asset', requireAuth, async (c) => {
  const env = getEnv(c);
  const repo = createVideoJobsRepo(getDb(c));
  const id = c.req.param('id');
  const job = await repo.get(id);
  if (!job || job.user_id !== getUser(c).id) {
    return c.json({ error: 'NOT_FOUND', message: 'Job not found' }, 404);
  }
  if (!env.ARCHIVE) return c.json({ error: 'VIDEO_UNAVAILABLE', message: 'Storage unavailable' }, 503);

  const range = c.req.header('range');
  const obj = await env.ARCHIVE.get(`video-jobs/${id}/out.mp4`, range ? { range } : undefined);
  if (!obj) return c.json({ error: 'NOT_FOUND', message: 'Video not ready' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', 'video/mp4');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('Content-Disposition', `inline; filename="vierank-${id}.mp4"`);
  headers.set('Accept-Ranges', 'bytes');

  let status = 200;
  if (range && obj.range) {
    status = 206;
    // R2Range is a union (offset/length/suffix); we only ever pass offset+length, so read defensively.
    const r = obj.range as { offset?: number; length?: number };
    const offset = r.offset ?? 0;
    const length = r.length ?? obj.size;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
  } else {
    headers.set('Content-Length', String(obj.size));
  }

  return new Response(obj.body as unknown as BodyInit, {
    status,
    headers,
  });
});

/**
 * Token-gated seed image — the ONLY video route without cookie auth, because the VEO3 server (not
 * the user's browser) fetches it server-side. The opaque per-job token gates access.
 */
router.get('/video-jobs/:id/seed', async (c) => {
  const env = getEnv(c);
  const repo = createVideoJobsRepo(getDb(c));
  const id = c.req.param('id');
  const token = c.req.query('t');
  const job = await repo.get(id);
  if (!job || !job.seed_token || !token || token !== job.seed_token) {
    return c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404);
  }
  if (!env.ARCHIVE) return c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404);
  const obj = await env.ARCHIVE.get(`video-jobs/${id}/seed.png`);
  if (!obj) return c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404);
  return new Response(obj.body as unknown as BodyInit, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
  });
});

export default router;
