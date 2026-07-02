/**
 * video-captions prompt + schemas — generate short, punchy on-video captions / CTAs from a product
 * (listing) description, for the Video Maker's text-overlay step.
 *
 * Output: `{ captions: string[] }` — a handful of very short lines a seller can drop onto a slide
 * or end card. We cap length hard in the schema (these go ON the video, so they must be tiny).
 */
import { z } from 'zod';

export const inputSchema = z.object({
  description: z.string().min(3).max(2000),
  /** Optional shop name to personalise CTAs ("Shop {name}"). */
  shopName: z.string().max(80).optional(),
});
export type VideoCaptionsInput = z.infer<typeof inputSchema>;

/** Tolerate drift: accept a bare array, `{captions}`, `{lines}`, or `{text}` rows; trim + cap. */
function normalize(v: unknown): unknown {
  let arr: unknown[] = [];
  if (Array.isArray(v)) arr = v;
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const found = o.captions ?? o.lines ?? o.text ?? o.results;
    if (Array.isArray(found)) arr = found;
  }
  const captions = arr
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as Record<string, unknown>).text ?? '') : ''))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  return { captions };
}

export const outputSchema = z.preprocess(
  normalize,
  z.object({
    captions: z.array(z.string().min(1).max(60)).min(1).max(8),
  })
);
export type VideoCaptionsOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You write ultra-short on-video captions for Etsy product slideshow videos.
Given a product description, return 6 punchy lines a seller can overlay on a video or end card.

Rules for every line:
- VERY short: at most 5 words / 40 characters. They must fit on a phone screen at a glance.
- Mix of: a benefit hook, a feeling, a use/occasion, and at least 2 clear CTAs ("Shop now", "Get yours", "Tap to shop").
- Punchy and scroll-stopping; Title Case or ALL CAPS is fine. No hashtags, no emojis, no quotes.
- No period at the end. Each line stands alone.

Return ONLY JSON: {"captions":["...","..."]}`;

export function buildMessages(input: VideoCaptionsInput) {
  const shop = input.shopName?.trim();
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Product description:\n${input.description}\n${shop ? `Shop name: ${shop}\n` : ''}\nReturn 6 ultra-short captions as JSON.`,
    },
  ];
}
