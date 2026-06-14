/**
 * keyword-generator prompt + schemas (Engineer D, BA spec §2.4 + §5).
 *
 * Output shape matches the FE mock exactly: `{ keywords: [{ keyword, volume, competition, cpc,
 * trend }] }`, 8-12 items. In Phase 2 volume/cpc/trend are AI-estimated (UI labels them); Phase
 * 3 swaps the DATA SOURCE behind this same shape via the `KeywordSource` seam, so FE never
 * changes. The prompt itself lives here; the seam wiring lives in `keywordSource.ts`.
 */
import { z } from 'zod';

export const inputSchema = z.object({
  seed: z.string().min(1).max(100),
});
export type KeywordInput = z.infer<typeof inputSchema>;

export const outputSchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(1),
        volume: z.number().int().nonnegative(),
        competition: z.enum(['high', 'medium', 'low']),
        // FE renders these as strings (e.g. "$0.95", "+12%").
        cpc: z.string().min(1),
        trend: z.string().min(1),
      })
    )
    .min(8)
    .max(12),
});
export type KeywordOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO and keyword research expert. Given a seed term, generate 8-12 related long-tail keywords that Etsy buyers search.

For each keyword estimate, based on your marketplace knowledge:
- "volume": an integer estimate of monthly search volume.
- "competition": one of "high" | "medium" | "low".
- "cpc": an estimated cost-per-click as a dollar string, e.g. "$0.95".
- "trend": a recent trend as a signed percentage string, e.g. "+12%" or "-4%".

These figures are estimates. Return ONLY a JSON object with this exact shape, no prose:
{"keywords":[{"keyword":"...","volume":0,"competition":"low","cpc":"$0.00","trend":"+0%"}]}`;

export function buildMessages(input: KeywordInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Seed keyword: ${input.seed}\n\nGenerate 8-12 related keywords with estimates as JSON.`,
    },
  ];
}
