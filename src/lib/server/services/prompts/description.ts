/**
 * description-generator prompt + schemas (Engineer D, BA spec §2.2).
 *
 * Output is a single multi-line string (FE renders it in `<pre class="whitespace-pre-wrap">`).
 * The system prompt pins the section structure shown in the FE mock.
 */
import { z } from 'zod';

export const inputSchema = z.object({
  productInfo: z.string().min(3).max(2000),
  tone: z.string().optional(),
});
export type DescriptionInput = z.infer<typeof inputSchema>;

export const outputSchema = z.object({
  description: z.string().min(100),
});
export type DescriptionOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an Etsy SEO copywriter. Given product information and a tone preference, write ONE complete Etsy listing description that follows Etsy's official description guidance (Etsy Seller Handbook / Help Center).

Etsy rules you MUST follow:
- OPEN with one or two natural sentences that clearly state what the item is and casually weave in 1-2 of the most important keywords. The FIRST 160 CHARACTERS become the listing's Google search snippet and Etsy search weights them — do NOT waste them on an all-caps hook, an emoji, or by copying the title verbatim. A shopper reading the first sentence should know exactly what it is.
- Put ESSENTIAL INFORMATION near the top: materials, dimensions/sizes, colors, options, personalization, and care instructions.
- Keep it SCANNABLE: short paragraphs and bulleted lists ("•") for key details (materials, measurements, care).
- Write for a human in the requested tone. Keyword-rich but natural — NEVER repeat the same phrase over and over (no keyword stuffing).
- Do NOT use subjective filler like "perfect", "beautiful", "stunning", "gorgeous".
- You may close with shipping/processing expectations (generic, no exact dates), simple ordering steps, and an invitation to message the shop. Do NOT add a "Tags:" line — tags belong in the tag field, not the description.

You may use tasteful emoji section headers (e.g. 📐 DETAILS, 📦 SHIPPING, ⭐ HOW TO ORDER) AFTER the opening sentences, but the opening must be a real, readable sentence.

Return ONLY a JSON object: {"description":"<the full multi-line description as a single string>"}`;

export function buildMessages(input: DescriptionInput) {
  let content = `Product information:\n${input.productInfo}\n`;
  if (input.tone) {
    content += `Tone preference: ${input.tone}\n`;
  }
  content += `\nWrite the description and return it as JSON.`;
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content,
    },
  ];
}
