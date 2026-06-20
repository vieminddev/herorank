/**
 * Tool credit costs (Engineer C) — how many credits each tool invocation costs.
 *
 * `getToolCost(tool)` returns `undefined` for unknown tools (the middleware rejects
 * them as 500 INTERNAL rather than allowing a free invocation).
 *
 * Cost table from PM decisions + spec references:
 *   echo = 1 (Phase 1 demo), title/tag/keyword = 1, description = 2, rankhero-ai = 2,
 *   listing-analyzer/shop-analyzer/rank-check/niche-finder/best-sellers/etsy-trends/buyer-check = 3,
 *   shop-analysis-deep = 8 (deducted by consumer on success, BR-P4-01).
 */

export const TOOL_COSTS: Record<string, number> = {
  // Phase 1
  echo: 1,
  // Phase 2 — LLM tools
  title: 1,
  description: 2,
  tag: 1,
  keyword: 1,
  'rankhero-ai': 2,
  // restructure a listing for AI shopping assistants
  'chatgpt-optimizer': 2,
  // charged PER seed (manual deduct in the loop)
  'bulk-keywords': 1,
  // Phase 3 — Etsy data tools
  'listing-analyzer': 3,
  'shop-analyzer': 3,
  'rank-check': 3,
  'niche-finder': 3,
  'best-sellers': 3,
  'etsy-trends': 3,
  'buyer-check': 3,
  // Phase 4 — deep analysis (consumer-deducted)
  'shop-analysis-deep': 8,
  // Phase 5 — competitor-gap features
  'image-studio': 5, // AI image generation is expensive
  'listing-compare': 3, // batch fetch + estimation across 2-4 listings
  'review-request-draft': 1, // LLM message template for a review request
  // Phase 6
  'tag-gap': 3, // top-listings tag analysis vs your own
};

/** Returns the credit cost for a tool, or `undefined` if the tool is not priced. */
export function getToolCost(tool: string): number | undefined {
  return TOOL_COSTS[tool];
}
