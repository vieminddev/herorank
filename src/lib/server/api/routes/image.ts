/**
 * image-studio route (Engineer F) — `/api/tools/image-studio`. AI product-image generation.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted by Engineer C inside `routes/tools.ts` via
 * `router.route('/', image)` (same pattern as etsy-tools / jobs). This file does NOT mount itself.
 *
 * Generates Etsy-ready product imagery from a text description in one of three modes (studio
 * mockup / lifestyle scene / white-background packshot). Credit-charged via
 * `requireCredits('image-studio')` (cost 5 — AI image generation is expensive); a ≥400 response
 * costs 0 credits.
 *
 * Requires both `LLM_API_KEY` and `IMAGE_MODEL` to be configured — otherwise 503 IMAGE_UNAVAILABLE
 * (no credit spent). Upstream LLM errors are mapped to friendly IMAGE_* bodies; details are never
 * leaked.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getEnv } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { createLlmService, LlmError } from '../../services/llmService';

const MODES = ['mockup', 'lifestyle', 'remove-bg'] as const;
const SIZES = ['1024x1024', '1024x1792', '1792x1024'] as const;

type Mode = (typeof MODES)[number];

const inputSchema = z.object({
  mode: z.enum(MODES),
  productDesc: z.string().min(3).max(800),
  /** Free-text style/mood, e.g. "rustic, warm tones, cozy". Optional. */
  style: z.string().max(300).optional(),
  size: z.enum(SIZES).default('1024x1024'),
  n: z.number().int().min(1).max(4).default(2),
});

type ImageInput = z.infer<typeof inputSchema>;

const MODE_LABELS: Record<Mode, string> = {
  mockup: 'Studio mockup',
  lifestyle: 'Lifestyle scene',
  'remove-bg': 'White-background packshot',
};

/** Build the image prompt from the validated input (mode-specific scaffolding + optional style). */
function buildPrompt(input: ImageInput): string {
  const desc = input.productDesc.trim();
  const style = input.style?.trim();
  const styleClause = style ? ` Style: ${style}.` : '';
  switch (input.mode) {
    case 'mockup':
      return `Professional e-commerce product photograph of ${desc}. Clean seamless studio background, soft even lighting, centered composition, sharp focus, high detail, photorealistic, catalog-ready.${styleClause}`;
    case 'lifestyle':
      return `Lifestyle product photograph of ${desc} shown in a natural real-world setting. Warm natural light, cozy editorial scene, tasteful props, shallow depth of field, photorealistic, Etsy hero-image quality.${styleClause}`;
    case 'remove-bg':
      return `${desc}, isolated as a clean product cut-out on a pure solid white background. No shadows, no props, no background clutter. Studio packshot, centered, even lighting, crisp edges, photorealistic.${styleClause}`;
  }
}

interface MappedImageError {
  status: 429 | 502 | 503 | 504;
  error: string;
  message: string;
}

/** Map an LlmError to a friendly IMAGE_* HTTP body. No upstream detail leaked. */
function mapLlmError(err: unknown): MappedImageError {
  if (err instanceof LlmError) {
    switch (err.code) {
      case 'LLM_CONFIG':
        return { status: 503, error: 'IMAGE_UNAVAILABLE', message: 'Image AI is not configured yet. Please try again later.' };
      case 'LLM_TIMEOUT':
        return { status: 504, error: 'IMAGE_TIMEOUT', message: 'The image took too long to generate. Please try again.' };
      case 'LLM_RATE_LIMIT':
        return { status: 429, error: 'IMAGE_BUSY', message: 'Image AI is busy. Please retry in a moment.' };
      case 'LLM_PARSE':
        return { status: 502, error: 'IMAGE_BAD_OUTPUT', message: 'The image service returned nothing. Please try again.' };
      default:
        return { status: 502, error: 'IMAGE_UNAVAILABLE', message: 'Image AI is temporarily unavailable. Please try again.' };
    }
  }
  return { status: 502, error: 'IMAGE_UNAVAILABLE', message: 'Image AI is temporarily unavailable. Please try again.' };
}

const router = new Hono<AppEnv>();

router.post('/image-studio', requireAuth, requireCredits('image-studio'), async (c) => {
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
    return c.json(
      { error: 'IMAGE_UNAVAILABLE', message: 'Image AI is not configured yet. Please try again later.' },
      503
    );
  }

  const llm = createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL ?? '',
    imageModel: env.IMAGE_MODEL,
    timeoutMs: 90_000,
  });

  const prompt = buildPrompt(input);
  try {
    const images = await llm.generateImage({ prompt, n: input.n, size: input.size });
    return c.json({
      mode: input.mode,
      label: MODE_LABELS[input.mode],
      prompt,
      images, // [{ b64?, url? }]
    });
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

export default router;
