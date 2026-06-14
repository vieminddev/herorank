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

const level = z.enum(['high', 'medium', 'low']);

export const inputSchema = z.object({
  keyword: z.string().min(1).max(100),
  location: z.enum(['Global', 'USA', 'UK', 'AUS', 'CAN', 'EU', 'IND']).default('Global'),
});
export type TagInput = z.infer<typeof inputSchema>;

const tagRow = z.object({
  tag: z.string().min(1).max(20),
  competition: level,
  searchVolume: level,
});

export const outputSchema = z.object({
  tags: z.array(tagRow).length(13),
  materials: z.array(tagRow).min(4).max(6),
  styles: z.array(tagRow).min(3).max(5),
});
export type TagOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO expert. Given a seed keyword, generate Etsy tags.

Rules:
- Etsy allows exactly 13 tags. Generate EXACTLY 13.
- Each tag MUST be 20 characters or fewer. Multi-word phrases are allowed and encouraged.
- Mix high, medium, and low competition tags so the seller can rank.
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
