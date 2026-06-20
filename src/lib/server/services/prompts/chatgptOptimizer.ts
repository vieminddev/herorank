/**
 * chatgpt-optimizer prompt + schemas (Engineer D).
 *
 * "AI shopping optimization" — restructure an Etsy listing so AI assistants (ChatGPT Shopping,
 * Gemini, Perplexity) can understand, trust, and RECOMMEND it. Unlike classic Etsy SEO this
 * rewards STRUCTURED, FACTUAL, CONVERSATIONAL content, so the output is a structured JSON object
 * (title, attributes, conversational keywords, Q&A, description, checklist) rather than free text.
 *
 * The model occasionally returns `attributes` as a key/value MAP instead of the required array of
 * `{name, value}` objects; `normalizeAttributes` coerces either shape into the array form before
 * validation (via a zod `preprocess`). Every string/array field is length-clamped so a verbose
 * model can never overflow the UI.
 */
import { z } from 'zod';

/** A string field that must be non-empty but is hard-truncated to `max` chars. */
const clampStr = (min: number, max: number) =>
  z.string().min(min).transform((s) => s.slice(0, max));

/** An array field that must have at least `min` items but is hard-truncated to `max` items. */
const clampArr = <T extends z.ZodTypeAny>(item: T, min: number, max: number) =>
  z.array(item).min(min).transform((a) => a.slice(0, max));

/** Flatten an arbitrary attribute value (string | array | object) into a comma-joined string. */
function attrValueToString(x: unknown): string {
  if (Array.isArray(x)) return x.map(attrValueToString).filter(Boolean).join(', ');
  if (x === null || x === undefined) return '';
  if (typeof x === 'object') return Object.values(x).map(attrValueToString).join(', ');
  return String(x);
}

/** Coerce a `{name: value}` map into the required `[{name, value}]` array; pass arrays through. */
function normalizeAttributes(v: unknown): unknown {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>).map(([name, value]) => ({
      name,
      value: attrValueToString(value),
    }));
  }
  return v;
}

export const inputSchema = z.object({
  /** The current listing — title + description pasted together is fine. */
  listing: z.string().min(10).max(6000),
});
export type ChatgptOptimizerInput = z.infer<typeof inputSchema>;

export const outputSchema = z.object({
  /** A clear, factual title an AI assistant can quote verbatim. */
  optimizedTitle: clampStr(1, 300),
  /** Structured attributes the assistant matches against buyer intent. Accepts a map OR an array. */
  attributes: z.preprocess(
    normalizeAttributes,
    clampArr(z.object({ name: clampStr(1, 80), value: clampStr(1, 300) }), 3, 12)
  ),
  /** Natural-language phrases buyers TYPE TO AN AI ("a gift for a coffee lover under $30"). */
  conversationalKeywords: clampArr(clampStr(1, 200), 3, 10),
  /** FAQ pairs that let an assistant answer buyer questions from the listing alone. */
  qa: clampArr(z.object({ question: clampStr(1, 250), answer: clampStr(1, 800) }), 3, 8),
  /** A concise, factual description rewritten for AI readability. */
  optimizedDescription: clampStr(1, 4000),
  /** Actionable checklist of what to add/fix to be AI-recommendable. */
  checklist: clampArr(z.object({ label: clampStr(1, 250), done: z.boolean() }), 3, 10),
});
export type ChatgptOptimizerOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are an expert in "AI shopping optimization" — making an Etsy listing easy for AI assistants (ChatGPT Shopping, Gemini, Perplexity) to understand, trust, and RECOMMEND to shoppers.

Unlike classic Etsy SEO (keyword density), AI assistants reward listings that are STRUCTURED, FACTUAL, and CONVERSATIONAL. Given a listing, produce:

1. "optimizedTitle": a clear, factual title (no keyword stuffing) an assistant can quote — product + key attribute + who it's for.
2. "attributes": an ARRAY of 3-12 objects, each {"name": "...", "value": "..."} — structured facts the assistant matches to buyer needs, e.g. [{"name":"Material","value":"stoneware ceramic"},{"name":"Capacity","value":"12 oz"},{"name":"Care","value":"dishwasher safe"}]. NOT a key-value map. Infer sensibly from the listing; never invent specifics you cannot support — if unknown, omit rather than fabricate.
3. "conversationalKeywords": 3-10 natural-language phrases buyers ASK AN AI, not search keywords (e.g. "a personalized housewarming gift under $40", "handmade mug for a tea lover").
4. "qa": 3-8 question/answer pairs an assistant could answer straight from the listing (shipping, personalization, materials, sizing, gifting).
5. "optimizedDescription": a concise, scannable, factual rewrite (short paragraphs or implied bullets) prioritizing facts an AI needs.
6. "checklist": 3-10 concrete actions to make the listing more AI-recommendable; set "done": true for items the current listing ALREADY satisfies, false for gaps to fix.

Be honest and grounded in the provided listing. Return ONLY a JSON object with exactly these keys.`;

export function buildMessages(input: ChatgptOptimizerInput) {
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `Listing (title + description):
${input.listing}

Restructure it for AI shopping assistants and return the JSON.`,
    },
  ];
}
