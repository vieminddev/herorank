/**
 * Plan credits configuration (Engineer C / PM decision).
 *
 * How many credits each plan grants per billing cycle. Referenced by `creditsService.ts`
 * for grant amounts and by tests for assertions.
 *
 * Values from pricing page + PM decision (BR-002/003):
 *   free = 30 (signup), side = 750, business = 3000, enterprise = 9000.
 */
import type { PlanSlug } from './types';

export const PLAN_CREDITS: Record<PlanSlug, number> = {
  free: 30,
  side: 750,
  business: 3000,
  enterprise: 9000,
};
