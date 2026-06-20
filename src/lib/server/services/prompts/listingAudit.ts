/**
 * listing-audit prompt + schema (Engineer D/F) — the LLM-powered audit behind `/listing-analyzer`.
 *
 * Where the rule-based `est.listingAudit(...)` scores a listing structurally, this asks a senior
 * Etsy SEO model to read the listing's REAL content (title, tags, description, image count, video
 * flag, price, category) and return content-aware, section-by-section feedback in the SAME shape as
 * the rule-based audit (`ListingAuditResult`), so the route can swap one for the other transparently.
 *
 * `llmListingAudit` is best-effort: any failure (config/timeout/parse) returns `null` and the route
 * falls back to the rule-based audit — the analyzer must never fail because the LLM is unavailable.
 */
import { z } from 'zod';
import { completeJson } from '../llmJson';
import type { LlmService } from '../llmService';

/** Structured input describing the live listing the model should audit. */
export interface ListingAuditInput {
  title: string;
  tags: string[];
  description: string;
  imageCount: number;
  hasVideo: boolean;
  /** Price in major currency units (already divided by divisor); 0/undefined = unknown. */
  price?: number;
  currency?: string;
  /** Listing taxonomy id as a string (or null when absent) — surfaced to the model as context. */
  category?: string | null;
}

const feedbackItem = z.object({
  status: z.enum(['good', 'warning', 'error']),
  text: z.string().min(1).max(280),
});

const auditSection = z.object({
  score: z.number().int().min(0).max(100),
  feedback: z.object({
    clarity: z.array(feedbackItem).max(6),
    seo: z.array(feedbackItem).max(6),
  }),
});

export const outputSchema = z.object({
  title: auditSection,
  tags: auditSection,
  images: auditSection,
  video: auditSection,
  description: auditSection,
});

export type ListingAuditOutput = z.infer<typeof outputSchema>;

export const systemPrompt = `You are a senior Etsy SEO expert auditing ONE live Etsy listing.

You will read the listing's REAL title, tags, description, image count, video flag, price and
category, then score five sections and give SPECIFIC, content-aware feedback.

Score EACH section 0-100 and split feedback into "clarity" (buyer readability/completeness) and
"seo" (search ranking). Every feedback item has a "status" ("good" | "warning" | "error") and a
short "text". Give 1-4 items per list. Prefer CONCRETE, content-referencing advice over generic
rules. Examples of GOOD feedback:
- "Title leads with 'Handmade' instead of the high-intent keyword 'ceramic mug' — front-load it."
- "Tags repeat 'gift' three times ('gift', 'gift idea', 'best gift'); diversify to cover materials."
- "Description never states the material or dimensions a buyer needs before purchasing."
AVOID generic verdicts like "title too short" or "add more tags" with no reference to the content.

Apply Etsy's real rules when scoring:
- Title: max 140 chars. Front-load high-intent keywords; use separators (•, |, ,) between phrases;
  include material + occasion/audience; avoid keyword stuffing and repeated words.
- Tags: Etsy allows 13 tags, each <=20 chars. Full 13 distinct, multi-word, non-redundant tags
  covering materials, styles, occasions and audiences score highest. Fewer/redundant tags lose points.
- Images: aim for >=5 photos (angles, scale, in-use). Images drive click-through, not search rank.
- Video: a short video boosts engagement/dwell time. Present = strong; absent = a warning, not an error.
- Description: should be keyword-rich and complete (materials, sizing, use cases, care). The first
  line front-loads keywords for the preview snippet.

If a section's input is empty (e.g. no tags, no video, no description), score it low and say why
specifically. score must be an integer 0-100.

Return ONLY a JSON object with EXACTLY this shape, no prose:
{"title":{"score":0,"feedback":{"clarity":[{"status":"good","text":"..."}],"seo":[]}},"tags":{"score":0,"feedback":{"clarity":[],"seo":[]}},"images":{"score":0,"feedback":{"clarity":[],"seo":[]}},"video":{"score":0,"feedback":{"clarity":[],"seo":[]}},"description":{"score":0,"feedback":{"clarity":[],"seo":[]}}}`;

/** Build the chat messages for an audit from the live listing content. */
export function buildMessages(input: ListingAuditInput) {
  const tagsLine = input.tags.length
    ? input.tags.map((t, i) => `${i + 1}. ${t} (${t.length} chars)`).join('\n')
    : '(no tags set)';
  const priceLine =
    typeof input.price === 'number' && input.price > 0
      ? `${input.currency ?? 'USD'} ${input.price.toFixed(2)}`
      : '(unknown)';

  const user = `Audit this Etsy listing. Reference its ACTUAL content in your feedback.

CATEGORY: ${input.category ?? '(unknown)'}
PRICE: ${priceLine}

TITLE (${input.title.length} chars):
${input.title || '(empty)'}

TAGS (${input.tags.length} of 13):
${tagsLine}

IMAGE COUNT: ${input.imageCount}
HAS VIDEO: ${input.hasVideo ? 'yes' : 'no'}

DESCRIPTION (${input.description.length} chars):
${input.description || '(empty)'}

Return the audit as JSON in the exact required shape.`;

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: user },
  ];
}

/**
 * Run the LLM listing audit. Best-effort: returns the parsed audit, or `null` on ANY failure
 * (the caller falls back to the rule-based `est.listingAudit`). Low temperature (0.3) keeps the
 * judgement consistent rather than creative.
 */
export async function llmListingAudit(
  llm: Pick<LlmService, 'complete'>,
  input: ListingAuditInput
): Promise<ListingAuditOutput | null> {
  let result: ListingAuditOutput | null;
  try {
    result = await completeJson(llm, {
      messages: buildMessages(input),
      schema: outputSchema,
      temperature: 0.3,
    });
  } catch {
    return null;
  }
  return result;
}
