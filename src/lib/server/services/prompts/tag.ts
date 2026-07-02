/**
 * tag-generator prompt + schemas (Engineer D, BA spec §2.3).
 *
 * Output shape matches the FE mock rows `{ tag, competition, searchVolume }`. Exactly 13 tags
 * (BR-P2-05), each ≤20 chars, plus material + style suggestions. competition/searchVolume are
 * AI-estimated in Phase 2 (UI shows an "AI estimated" badge); real Etsy data lands in Phase 3
 * behind this same shape.
 *
 * `location` is forwarded for Phase-3 forward-compat (A5) but does not change Phase 2 output.
 */
import { z } from 'zod';

/**
 * Coerce a free-form level into the strict enum. No-thinking models drift on casing/synonyms
 * ("High", "Mid", "moderate") — normalize those rather than 502 on a cosmetic difference. An
 * unrecognized value is passed through so the enum still rejects genuine garbage.
 */
function normalizeLevel(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  if (['high', 'hi', 'h', 'strong'].includes(s)) return 'high';
  if (['medium', 'med', 'mid', 'm', 'moderate', 'average'].includes(s)) return 'medium';
  if (['low', 'lo', 'l', 'weak'].includes(s)) return 'low';
  return s;
}
const level = z.preprocess(normalizeLevel, z.enum(['high', 'medium', 'low']));

export const inputSchema = z.object({
  keyword: z.string().min(1).max(100),
  location: z.enum(['Global', 'USA', 'UK', 'AUS', 'CAN', 'EU', 'IND']).default('Global'),
});
export type TagInput = z.infer<typeof inputSchema>;

/** Map common key-name drift onto the canonical `{tag, competition, searchVolume}` shape. */
function normalizeTagRow(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const e = v as Record<string, unknown>;
  return {
    tag: e.tag ?? e.name ?? e.keyword ?? e.text ?? e.label ?? e.value,
    competition: e.competition ?? e.comp ?? e.competitionLevel,
    searchVolume:
      e.searchVolume ?? e.search_volume ?? e.searchvolume ?? e.volume ?? e.demand,
  };
}
const tagRow = z.preprocess(
  normalizeTagRow,
  z.object({
    tag: z.string().min(1).max(20),
    competition: level,
    searchVolume: level,
  })
);

// Floors stay strict (Etsy needs exactly 13 tags; rows must be ≤20 chars), but tolerate OVERFLOW
// by slicing to the cap — a model that returns 14 tags yields a clean 13 instead of a 502.
export const outputSchema = z.object({
  tags: z.array(tagRow).min(13).transform((a) => a.slice(0, 13)),
  materials: z.array(tagRow).min(4).transform((a) => a.slice(0, 6)),
  styles: z.array(tagRow).min(3).transform((a) => a.slice(0, 5)),
});
export type TagOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO expert. Given a seed keyword, generate Etsy tags.

Follow Etsy's official tag rules (Etsy Seller Handbook):
- Etsy allows exactly 13 tags. Generate EXACTLY 13.
- Each tag MUST be 20 characters or fewer (Etsy's hard limit).
- Use MULTI-WORD phrases, never single words: "custom bracelet" is stronger than "custom" and
  "bracelet", and frees up a slot. Every one of the 13 tags should be 2+ words.
- Keep all 13 tags UNIQUE and varied — spread them across different searches. Do NOT make most
  tags repeat the same head word (avoid "octopus art" / "octopus print"; prefer "octopus art
  print" / "animal wall decor").
- Use natural-sounding language a shopper would actually type. Favour descriptive long-tail
  phrases. Include relevant synonyms and, where the target market warrants, regional phrasing.
- Also suggest 4-6 "materials" and 3-5 "styles" as additional tag rows (each ≤20 chars).
- For every row, estimate "competition" and "searchVolume" as one of "high" | "medium" | "low"
  based on your knowledge of the Etsy marketplace.

Return ONLY a JSON object with this exact shape, no prose:
{"tags":[{"tag":"...","competition":"high","searchVolume":"high"}],"materials":[...],"styles":[...]}`;

export function buildMessages(input: TagInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Seed keyword: ${input.keyword}\nTarget market: ${input.location}\n\nReturn exactly 13 tags plus materials and styles as JSON.`,
    },
  ];
}
