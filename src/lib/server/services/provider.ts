/**
 * Service provider / resolver seam (Engineer A) — lazy service construction from env/DB.
 *
 * Routes that can't directly construct a service (e.g. billing.ts needs credits but owns
 * neither the repo nor the service) call `getCreditsService(db)` to get a wired instance.
 * This keeps billing decoupled from the credits implementation.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { createCreditsRepo } from '../repositories/creditsRepo';
import { createCreditsService, type CreditsService } from './creditsService';

/** Build a request-scoped CreditsService from a D1 binding. */
export async function getCreditsService(db: D1Database): Promise<CreditsService> {
  const repo = createCreditsRepo(db);
  return createCreditsService(repo);
}
