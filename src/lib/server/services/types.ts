/**
 * Shared types for the service + repository layers (Engineer C).
 *
 * Keep this file tiny — only types referenced by multiple modules. Service-specific
 * types live next to their service.
 */

/** The four plan slugs used throughout the billing + credits system. */
export type PlanSlug = 'free' | 'side' | 'business' | 'enterprise';
