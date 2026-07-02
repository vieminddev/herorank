/**
 * title-generator prompt + schemas (Engineer D, BA spec §2.1).
 *
 * The model now ONLY writes the titles — it no longer self-scores. The route grades each title with
 * the deterministic, auditable scorer in `services/titleScore.ts` (VieRank honesty USP), so `chars`,
 * `score`, and the per-lever breakdown are all computed server-side and never trust the model.
 */
import { z } from 'zod';

export const inputSchema = z.object({
  description: z.string().min(3).max(2000),
});
export type TitleInput = z.infer<typeof inputSchema>;

/** Map key drift onto `{ title }`. A model may emit text/name/value instead of title. */
function normalizeTitleRow(v: unknown): unknown {
  if (typeof v === 'string') return { title: v };
  if (!v || typeof v !== 'object') return v;
  const e = v as Record<string, unknown>;
  return { title: e.title ?? e.text ?? e.name ?? e.value ?? e.label };
}
const titleRow = z.preprocess(
  normalizeTitleRow,
  z.object({
    title: z.string().min(1).max(140),
  })
);

// Exactly 5 titles (strict floor), but tolerate OVERFLOW by slicing — a model that returns 6-7
// yields a clean 5 instead of a 502.
export const outputSchema = z.object({
  titles: z.array(titleRow).min(5).transform((a) => a.slice(0, 5)),
});
export type TitleOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO expert. Generate exactly 5 Etsy listing titles that follow Etsy's CURRENT (2025) listing-title guidance, which prioritises a clear title for a buyer over keyword stuffing.

Rules for every title (from Etsy's Seller Handbook):
- MUST be 140 characters or fewer (Etsy's hard limit).
- LEAD with what the item actually is — shoppers only see the first few words in search results.
- Put the most important traits (color, material, size) near the front.
- Keep it SHORT and scannable: aim for FEWER THAN 15 words. Do not pack in long keyword lists.
- Write for a buyer, not a search engine: no keyword stuffing, no repeated words.
- Do NOT use subjective words like "perfect", "beautiful", "stunning", "gorgeous" — those belong in the description.
- Only mention a holiday, occasion, or recipient if it is essential to what the item is.
- Vary the angle across the 5 (style, material, audience, use) so they are not near-duplicates.

Return ONLY a JSON object with this exact shape, no prose, no scores:
{"titles":[{"title":"..."}]}`;

export function buildMessages(input: TitleInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Product description:\n${input.description}\n\nGenerate exactly 5 titles as JSON.`,
    },
  ];
}
