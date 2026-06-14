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

export const systemPrompt = `You are an Etsy SEO copywriter. Given product information and a tone preference, write ONE complete, keyword-rich Etsy listing description in that tone.

Structure (use these emoji section headers, in this order):
- An attention-grabbing intro line / hook (the product name in caps with ✨).
- 🎁 PERFECT GIFT FOR — a short bulleted list of audiences/occasions.
- 📐 PRODUCT DETAILS — materials, sizes, options, customization.
- 💎 QUALITY GUARANTEE — craftsmanship and materials reassurance.
- 📦 SHIPPING — handling/shipping expectations (generic, no exact dates).
- ⭐ HOW TO ORDER — numbered steps for personalization/checkout.
- 💬 NEED HELP — invite buyers to message the shop.
- A final "Tags:" line listing relevant keyword phrases.

Style: natural and readable, keyword-rich but never stuffed. Use line breaks and bullet points ("•"). Adapt the voice (e.g. friendly, informative, concise) to match the requested tone.

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
