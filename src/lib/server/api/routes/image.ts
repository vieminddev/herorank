/**
 * image-studio route (Engineer F) — `/api/tools/image-studio` + async job endpoints.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted by Engineer C inside `routes/tools.ts`.
 *
 * AI product-image generation in Etsy shot-type modes. Generation is now ASYNC (job-based): a request
 * creates one `image_jobs` row per image and returns jobIds immediately. vtoken images are produced
 * inline (fast); VEO3 images (media.viemind.ai — can take minutes when busy) are enqueued and finish
 * later via the webhook, which would otherwise blow past Cloudflare's ~100s request limit. The client
 * polls `/image-jobs/:id` and renders each image when done. Finished images live in R2 (binding
 * ARCHIVE, key image-jobs/{id}/out).
 *
 * Credit-charged via `requireCredits('image-studio')` (5 per image); a failed image refunds its 5.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getEnv, getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { rebrandImageB64, rebrandImageMetadata, b64ToBytes } from '../../services/imageMetadata';
import {
  veo3ConfigFromEnv,
  uploadReferenceToVeo3,
  submitImage,
  imageAspectFromSize,
} from '../../services/veo3Service';
import { createLlmService } from '../../services/llmService';
import { createImageJobsRepo, type ImageJobsRepo } from '../../repositories/imageJobsRepo';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

const MODES = ['mockup', 'lifestyle', 'detail', 'scale', 'group', 'remove-bg'] as const;
const SIZES = ['1024x1024', '1024x1792', '1792x1024'] as const;

type Mode = (typeof MODES)[number];

const inputSchema = z.object({
  mode: z.enum(MODES),
  productDesc: z.string().min(3).max(800),
  style: z.string().max(300).optional(),
  size: z.enum(SIZES).default('1024x1024'),
  n: z.number().int().min(1).max(4).default(2),
  referenceImage: z.string().max(12_000_000).optional(),
  background: z.string().max(40).optional(),
});

type ImageInput = z.infer<typeof inputSchema>;

const MODE_LABELS: Record<Mode, string> = {
  mockup: 'Studio mockup',
  lifestyle: 'Lifestyle scene',
  detail: 'Detail close-up',
  scale: 'Scale shot',
  group: 'Group / variations',
  'remove-bg': 'White-background packshot',
};

/** Build the image prompt from the validated input (mode-specific scaffolding + style + background). */
function buildPrompt(input: ImageInput): string {
  const desc = input.productDesc.trim();
  const style = input.style?.trim();
  const styleClause = style ? ` Style: ${style}.` : '';

  const bg = input.background?.trim();
  const isStudio = input.mode === 'mockup' || input.mode === 'detail' || input.mode === 'group';
  const isAccent = input.mode === 'lifestyle' || input.mode === 'scale';
  const bgClause = bg
    ? isStudio
      ? ` Set against a clean, seamless ${bg} background.`
      : isAccent
        ? ` Tie the whole scene together with a cohesive ${bg} colour palette in the setting and props.`
        : ''
    : '';

  let base: string;
  switch (input.mode) {
    case 'mockup':
      base = `Professional e-commerce product photograph of ${desc}. Clean seamless studio background, soft even lighting, centered composition, sharp focus, high detail, photorealistic, catalog-ready.`;
      break;
    case 'lifestyle':
      base = `Lifestyle product photograph of ${desc} shown in a natural real-world setting. Warm natural light, cozy editorial scene, tasteful props, shallow depth of field, photorealistic, Etsy hero-image quality.`;
      break;
    case 'detail':
      base = `Extreme close-up macro photograph of ${desc}, showing off the texture, materials and fine craftsmanship details. Sharp focus, high detail, soft even lighting, shallow depth of field, photorealistic.`;
      break;
    case 'scale':
      base = `Product photograph of ${desc} shown next to a common, recognizable everyday object (such as a hand or a coffee mug) so its real size is immediately clear. Clean uncluttered setting, soft even lighting, photorealistic.`;
      break;
    case 'group':
      base = `Group product photograph showing several ${desc} arranged neatly together, displaying the available colors, finishes or variations side by side. Clean seamless background, even lighting, photorealistic, catalog-ready.`;
      break;
    case 'remove-bg':
      base = `${desc}, isolated as a clean product cut-out on a pure solid white background. No shadows, no props, no background clutter. Studio packshot, centered, even lighting, crisp edges, photorealistic.`;
      break;
  }
  return base + styleClause + bgClause;
}

function publicBase(c: Context<AppEnv>): string {
  const env = getEnv(c);
  return (env.BETTER_AUTH_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
}

/** PNG magic → image/png, else image/jpeg (provider returns JPEG even when labelled png). */
function detectImageType(bytes: Uint8Array): string {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

async function storeImage(archive: R2Bucket, jobId: string, bytes: Uint8Array): Promise<void> {
  await archive.put(`image-jobs/${jobId}/out`, bytes, {
    httpMetadata: { contentType: detectImageType(bytes) },
  });
}

/** Refund failed jobs' credits (idempotent via claimRefund). Runs AFTER requireCredits has charged. */
async function refundFailedJobs(db: D1Database, repo: ImageJobsRepo, jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;
  const credits = createCreditsService(createCreditsRepo(db));
  for (const id of jobIds) {
    const job = await repo.get(id);
    if (job && job.credits_charged > 0 && (await repo.claimRefund(id))) {
      await credits.refundCredits(
        job.user_id,
        job.credits_charged,
        `refund:image-studio:${id}`,
        'refund:image-studio'
      );
    }
  }
}

const router = new Hono<AppEnv>();

// Image Studio bills PER IMAGE (5 credits each): one request can render 1–4 images (`n`) → charge 5×n.
const imageUnits = requireCredits('image-studio', {
  units: async (c) => {
    try {
      const body = (await c.req.json()) as { n?: unknown };
      const n = body?.n;
      return typeof n === 'number' && n >= 1 && n <= 4 ? Math.floor(n) : 2;
    } catch {
      return 2;
    }
  },
});

router.post('/image-studio', requireAuth, imageUnits, async (c) => {
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
  if (!env.LLM_API_KEY || !env.IMAGE_MODEL) {
    return c.json({ error: 'IMAGE_UNAVAILABLE', message: 'Image AI is not configured yet. Please try again later.' }, 503);
  }
  const archive = env.ARCHIVE;
  if (!archive) {
    return c.json({ error: 'IMAGE_UNAVAILABLE', message: 'Image storage is unavailable. Please try again later.' }, 503);
  }

  const llm = createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL ?? '',
    imageModel: env.IMAGE_MODEL,
    timeoutMs: 90_000,
  });

  const refClause = input.referenceImage
    ? ' Keep the exact same product shown in the reference image — identical design, colours, materials and any text; only change the scene, angle and framing.'
    : '';
  const prompt = buildPrompt(input) + refClause;

  // Provider rotation (env VEO3_IMAGE_PERCENT). vtoken images run inline now; VEO3 images are enqueued
  // and finish via the webhook (async — handles media.viemind.ai's multi-minute jobs without timing out).
  const veo3 = veo3ConfigFromEnv(env);
  const veo3Percent = Math.max(0, Math.min(100, Number.parseInt(env.VEO3_IMAGE_PERCENT ?? '70', 10) || 0));
  const hasRef = !!input.referenceImage;
  const veo3Possible = !!veo3 && veo3Percent > 0;

  // Reference (img2img): upload to Google ONCE (→ Media ID) so all VEO3 images can reuse it.
  let veoRefId: string | null = null;
  if (hasRef && veo3Possible) {
    try {
      veoRefId = await uploadReferenceToVeo3(veo3!, input.referenceImage!);
    } catch {
      veoRefId = null;
    }
  }
  const veo3CanServe = veo3Possible && (!hasRef || !!veoRefId);

  const db = getDb(c);
  const repo = createImageJobsRepo(db);
  const user = getUser(c);
  const batchId = crypto.randomUUID();
  const webhookSecret = env.VEO3_WEBHOOK_SECRET ?? env.VEO3_API_KEY ?? '';
  const callbackUrl = `${publicBase(c)}/api/webhook/veo3?token=${encodeURIComponent(webhookSecret)}&kind=image`;
  const failedJobs: string[] = [];
  let maxEtaSeconds = 0;
  let busyMessage: string | undefined;

  // Generate one image via the sync provider (vtoken) NOW, store to R2, mark done. On failure, mark
  // error + queue a refund (credits are charged by requireCredits right after this handler returns).
  const runVtokenInline = async (jobId: string): Promise<'done' | 'error'> => {
    try {
      const imgs = await llm.generateImage({ prompt, n: 1, size: input.size, referenceImage: input.referenceImage });
      const b64 = imgs[0]?.b64;
      if (!b64) throw new Error('no image returned');
      await storeImage(archive, jobId, b64ToBytes(rebrandImageB64(b64)));
      await repo.markDone(jobId);
      return 'done';
    } catch {
      await repo.markError(jobId, 'Generation failed');
      failedJobs.push(jobId);
      return 'error';
    }
  };

  const perImage = async (): Promise<{ id: string; provider: string; status: string }> => {
    const jobId = crypto.randomUUID();
    const useVeo3 = veo3CanServe && Math.random() * 100 < veo3Percent;
    const provider = useVeo3 ? 'veo3' : 'vtoken';
    await repo.create({
      id: jobId,
      userId: user.id,
      batchId,
      provider,
      mode: input.mode,
      prompt,
      size: input.size,
      creditsCharged: 5,
    });
    if (useVeo3) {
      try {
        const q = await submitImage(veo3!, {
          externalTaskId: jobId,
          prompt,
          aspect: imageAspectFromSize(input.size),
          referenceImageName: veoRefId ?? undefined,
          callbackUrl,
        });
        if (q.estimatedWaitSeconds && q.estimatedWaitSeconds > maxEtaSeconds) {
          maxEtaSeconds = q.estimatedWaitSeconds;
          busyMessage = q.message;
        }
        return { id: jobId, provider: 'veo3', status: 'pending' }; // webhook completes it
      } catch {
        // Couldn't enqueue → serve via vtoken now so the user still gets the image.
        const st = await runVtokenInline(jobId);
        return { id: jobId, provider: 'vtoken', status: st };
      }
    }
    const st = await runVtokenInline(jobId);
    return { id: jobId, provider: 'vtoken', status: st };
  };

  const jobs = await Promise.all(Array.from({ length: input.n }, () => perImage()));

  // Refund inline (vtoken) failures after requireCredits charges. Best-effort, non-blocking.
  if (failedJobs.length) {
    try {
      c.executionCtx.waitUntil(refundFailedJobs(db, repo, failedJobs));
    } catch {
      await refundFailedJobs(db, repo, failedJobs);
    }
  }

  return c.json({
    batchId,
    mode: input.mode,
    label: MODE_LABELS[input.mode],
    jobs,
    // Surfaced to the UI so it can say "server busy, ~N min" while VEO3 jobs are queued.
    eta: maxEtaSeconds > 0 ? { seconds: maxEtaSeconds, message: busyMessage ?? null } : null,
  });
});

/** Serialize a job row for the client (no internal fields). */
function publicJob(j: {
  id: string;
  status: string;
  mode: string;
  error_msg: string | null;
  created_at: number;
}) {
  return {
    id: j.id,
    status: j.status,
    mode: j.mode,
    createdAt: j.created_at,
    url: j.status === 'done' ? `/api/tools/image-jobs/${j.id}/asset` : null,
    error: j.status === 'error' ? 'Generation failed — credits refunded.' : null,
  };
}

router.get('/image-jobs', requireAuth, async (c) => {
  const repo = createImageJobsRepo(getDb(c));
  const jobs = await repo.listByUser(getUser(c).id, 40);
  return c.json({ jobs: jobs.map(publicJob) });
});

router.get('/image-jobs/:id', requireAuth, async (c) => {
  const repo = createImageJobsRepo(getDb(c));
  const job = await repo.get(c.req.param('id'));
  if (!job || job.user_id !== getUser(c).id) {
    return c.json({ error: 'NOT_FOUND', message: 'Job not found' }, 404);
  }
  return c.json(publicJob(job));
});

router.get('/image-jobs/:id/asset', requireAuth, async (c) => {
  const env = getEnv(c);
  const repo = createImageJobsRepo(getDb(c));
  const job = await repo.get(c.req.param('id'));
  if (!job || job.user_id !== getUser(c).id) {
    return c.json({ error: 'NOT_FOUND', message: 'Job not found' }, 404);
  }
  if (!env.ARCHIVE) return c.json({ error: 'IMAGE_UNAVAILABLE', message: 'Storage unavailable' }, 503);
  const obj = await env.ARCHIVE.get(`image-jobs/${job.id}/out`);
  if (!obj) return c.json({ error: 'NOT_FOUND', message: 'Image not ready' }, 404);
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return new Response(obj.body as unknown as BodyInit, {
    headers: { 'content-type': contentType, 'cache-control': 'private, max-age=86400' },
  });
});

export default router;
