/**
 * Plan credits configuration (Engineer C / PM decision).
 *
 * How many credits each plan grants per billing cycle. Referenced by `creditsService.ts`
 * for grant amounts and by tests for assertions.
 *
 * PRICING MODEL (Cách A, 2026-06-29): credits are a MEDIA-only pool (see `toolCosts.ts` —
 * research/SEO/text tools are free). Grants are sized to AI-media volume so that all-media
 * usage stays ~40% COGS on the yearly price (≈60% margin). At video=50 / image=5:
 *   free 50 (≈1 video / 10 images — trial), side 300 (≈6 / 60), business 500 (≈10 / 100),
 *   enterprise 1500 (≈30 / 300).
 */
import type { PlanSlug } from './types';

export const PLAN_CREDITS: Record<PlanSlug, number> = {
  free: 50,
  side: 300,
  business: 500,
  enterprise: 1500,
};
