/**
 * title-generator prompt + schemas (Engineer D, BA spec §2.1).
 *
 * Output shape matches the FE mock exactly: `{ titles: [{ title, chars, score }] }` — exactly
 * 5 items. The route recomputes `chars` from `title.length` (BR-P2-04) so it never trusts the
 * model's count.
 */
import { z } from 'zod';

export const inputSchema = z.object({
  description: z.string().min(3).max(2000),
});
export type TitleInput = z.infer<typeof inputSchema>;

export const outputSchema = z.object({
  titles: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        chars: z.number().int().nonnegative(),
        score: z.number().min(0).max(100),
      })
    )
    .length(5),
});
export type TitleOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO expert. Given a product description, generate exactly 5 Etsy listing titles.

Rules for every title:
- MUST be 140 characters or fewer.
- Front-load the most important, high-intent keywords buyers actually search.
- Use separators among " • ", " | " or ", " to break keyword phrases.
- Stay human-readable; no keyword stuffing or repeated words within a title.
- Vary the angle across the 5 (gift, audience, style, material, occasion) so they are not near-duplicates.

For each title also return:
- "chars": the exact character length of the title.
- "score": an integer 0-100 reflecting your estimate of the title's Etsy SEO strength.

Return ONLY a JSON object with this exact shape, no prose:
{"titles":[{"title":"...","chars":0,"score":0}]}`;

export function buildMessages(input: TitleInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Product description:\n${input.description}\n\nGenerate exactly 5 titles as JSON.`,
    },
  ];
}
