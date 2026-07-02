/**
 * Tool credit costs (Engineer C) — how many credits each tool invocation costs.
 *
 * `getToolCost(tool)` returns `undefined` for unknown tools (the middleware rejects
 * them as 500 INTERNAL rather than allowing a free invocation). A cost of `0` is allowed
 * and always passes the credit gate (balance < 0 is never true).
 *
 * PRICING MODEL (Cách A, 2026-06-29): credits are now a MEDIA pool only. All research /
 * SEO / text tools are FREE (0 credits) — marketed as "unlimited" — because their COGS is
 * negligible (LLM + free Etsy reads). Credits are spent ONLY on AI media, the one place with
 * real per-unit cost:
 *   - image-studio = 5 / image  (provider COGS ~$0.04)
 *   - video-studio = 50 / video (VEO3 COGS ~$0.40) — 10:1 ratio mirrors the cost ratio.
 * Plan grants in `planConfig.ts` are sized to this media pool (free 50 / side 300 / business
 * 500 / enterprise 1500). Re-price media here if provider costs change; keep the ratio = cost ratio.
 */

export const TOOL_COSTS: Record<string, number> = {
  // Phase 1 demo (not user-facing)
  echo: 1,

  // --- Metered tools (real per-op COGS) ---
  'image-studio': 5, // PER IMAGE — billed 5 × n (requireCredits units resolver in routes/image.ts)
  'video-studio': 50, // AI video (VEO3 ~$0.40/clip); charged on submit, refunded on failure
  'shop-analysis-deep': 8, // heavy async full-shop crawl + LLM (consumer-deducted, BR-P4-01)

  // --- Unlimited research / SEO / text tools — FREE (0 credits) ---
  // LLM generators
  title: 0,
  description: 0,
  tag: 0,
  keyword: 0,
  'assistant': 0,
  'chatgpt-optimizer': 0,
  'bulk-keywords': 0,
  // Etsy data tools
  'listing-analyzer': 0,
  'shop-analyzer': 0,
  'rank-check': 0,
  'niche-finder': 0,
  'best-sellers': 0,
  'buyer-check': 0,
  'listing-compare': 0,
  'review-request-draft': 0,
  'tag-gap': 0,
  // Video Maker — AI on-video captions (one LLM call; the render itself is free)
  'video-captions': 0,
  // Strategy views over cron-built cache (cache reads, no live Etsy fetch)
  'etsy-trends': 0,
  'whitespace-finder': 0,
  'selling-now': 0,
};

/** Returns the credit cost for a tool, or `undefined` if the tool is not priced. */
export function getToolCost(tool: string): number | undefined {
  return TOOL_COSTS[tool];
}
