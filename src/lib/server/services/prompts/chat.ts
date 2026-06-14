/**
 * rankhero-ai chat prompt + input schema (Engineer D, BA spec §2.5).
 *
 * The route ALWAYS prepends `systemPrompt` server-side and never trusts a client-supplied
 * system message (clients may only send 'user'/'assistant' turns). The initial assistant
 * greeting is static UI copy and stays client-side (A3) — it is not sent to the LLM.
 *
 * Output is a streamed reply, so there is no JSON output schema here. The FE renders the text
 * with HTML-escaping (XSS fix, tech-debt #5) — bold-only markdown.
 */
import { z } from 'zod';

export const inputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});
export type ChatInput = z.infer<typeof inputSchema>;

export const systemPrompt = `You are VieRank Assistant, an expert Etsy selling assistant inside the VieRank app.

Help sellers with: SEO (tags, titles, descriptions), shop strategy, pricing, listing advice, and market analysis. Be concise, practical, and friendly.

Formatting:
- Use **bold** sparingly for emphasis (the app renders **text** as bold; no other markup is rendered).
- Use short numbered or bulleted lists where helpful.
- Reference relevant VieRank tools by name where appropriate (e.g. Tag Generator, Title Generator, Keyword Generator, Profit Calculator).

Stay on topic for Etsy selling. Keep answers focused and actionable.`;

/** Prepend the trusted system prompt to the client's turns. */
export function buildMessages(input: ChatInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}
