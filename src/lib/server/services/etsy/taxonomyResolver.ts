/**
 * Taxonomy resolver (Engineer F) — flattens Etsy's seller-taxonomy tree into two fast lookups
 * the analyzer routes need:
 *   - `toTopLevel(leafId)` → the root (level-1) taxonomy id for any node, used to pick the
 *     category-specific REVIEW_RATE in `salesEstimate` (a leaf like "Necklaces" maps to "Jewelry").
 *   - `nameOf(id)` → the human category name for any node, used to aggregate a shop's categories.
 *
 * The full tree is fetched once (`getSellerTaxonomyNodes`) and the derived `{ leafToTop, idToName }`
 * maps are cached in KV under `cacheKeys.taxonomy()` (30d TTL) so subsequent analyses skip the walk.
 *
 * Top-level resolution prefers Etsy's `full_path_taxonomy_ids[0]` when present; otherwise it walks
 * `parent_id` up to the root (cycle-guarded). Unknown ids pass through unchanged for `toTopLevel`.
 */
import type { EtsyClient, EtsyTaxonomyNode } from './types';
import { cacheKeys, TTL, type EtsyCache } from './cache';

/** The two lookups a route uses after loading the taxonomy. */
export interface TaxonomyResolver {
  /** Root (level-1) taxonomy id for a leaf/branch id; passes unknown ids through; null in → null. */
  toTopLevel(taxonomyId: number | null | undefined): number | null;
  /** Human category name for a taxonomy id; null when unknown or input is null. */
  nameOf(taxonomyId: number | null | undefined): string | null;
}

/** Cached, derived form of the taxonomy tree (what we persist in KV, not the raw nodes). */
interface TaxonomyMaps {
  /** taxonomyId → top-level (root) id. */
  leafToTop: Record<number, number>;
  /** taxonomyId → display name. */
  idToName: Record<number, string>;
}

/**
 * Build (or load from cache) the taxonomy lookups. Walks the full tree once per cache miss.
 *
 * @param client - Etsy client used to fetch the seller taxonomy on a cache miss.
 * @param cache  - KV cache wrapper; stores the derived maps under `cacheKeys.taxonomy()`.
 * @returns `{ toTopLevel, nameOf }` resolver bound to the loaded maps.
 */
export async function loadTaxonomyResolver(
  client: EtsyClient,
  cache: EtsyCache
): Promise<TaxonomyResolver> {
  const key = cacheKeys.taxonomy();

  let leafToTop: Record<number, number> | null = null;
  let idToName: Record<number, string> | null = null;

  const cached = await cache.get<TaxonomyMaps>(key);
  if (cached) {
    leafToTop = cached.payload.leafToTop;
    idToName = cached.payload.idToName ?? null;
  }

  if (!leafToTop || !idToName) {
    const nodes = await client.getSellerTaxonomyNodes();
    const built: Record<number, number> = {};
    const names: Record<number, string> = {};
    const byId = new Map<number, EtsyTaxonomyNode>();

    const walk = (ns: EtsyTaxonomyNode[]): void => {
      for (const n of ns) {
        byId.set(n.id, n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);

    for (const [, n] of byId) {
      names[n.id] = n.name;
      let top: number;
      if (Array.isArray(n.full_path_taxonomy_ids) && n.full_path_taxonomy_ids.length) {
        top = n.full_path_taxonomy_ids[0];
      } else {
        let cur: EtsyTaxonomyNode = n;
        const seen = new Set<number>();
        while (cur.parent_id != null && byId.has(cur.parent_id) && !seen.has(cur.id)) {
          seen.add(cur.id);
          cur = byId.get(cur.parent_id)!;
        }
        top = cur.id;
      }
      built[n.id] = top;
    }

    leafToTop = built;
    idToName = names;
    await cache.put(key, { leafToTop: built, idToName: names }, TTL.taxonomy);
  }

  const topMap = leafToTop;
  const nameMap = idToName;

  return {
    toTopLevel: (taxonomyId) => {
      if (taxonomyId == null) return null;
      return topMap[taxonomyId] ?? taxonomyId;
    },
    nameOf: (taxonomyId) => {
      if (taxonomyId == null) return null;
      return nameMap[taxonomyId] ?? null;
    },
  };
}
