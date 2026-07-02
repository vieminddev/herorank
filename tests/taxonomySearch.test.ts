/**
 * Tests for TaxonomyResolver.search (create-draft category picker). Hermetic: a fake client
 * returns a tiny tree and a fake cache always misses, so the resolver builds the maps in-memory.
 */
import { describe, it, expect } from 'vitest';
import { loadTaxonomyResolver } from '../src/lib/server/services/etsy/taxonomyResolver';

const nodes = [
  {
    id: 1, name: 'Jewelry', parent_id: null, full_path_taxonomy_ids: [1],
    children: [
      { id: 10, name: 'Necklaces', parent_id: 1, full_path_taxonomy_ids: [1, 10], children: [] },
      { id: 11, name: 'Statement Necklaces', parent_id: 1, full_path_taxonomy_ids: [1, 11], children: [] },
    ],
  },
  {
    id: 2, name: 'Home & Living', parent_id: null, full_path_taxonomy_ids: [2],
    children: [{ id: 20, name: 'Mugs', parent_id: 2, full_path_taxonomy_ids: [2, 20], children: [] }],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeClient = { getSellerTaxonomyNodes: async () => nodes } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeCache = { get: async () => null, put: async () => {} } as any;

describe('TaxonomyResolver.search', () => {
  it('ranks prefix matches before substring matches and attaches the top-level path', async () => {
    const r = await loadTaxonomyResolver(fakeClient, fakeCache);
    const res = r.search('neck', 10);
    const ids = res.map((x) => x.taxonomyId);
    expect(ids).toContain(10);
    expect(ids).toContain(11);
    // "Necklaces" (prefix) sorts before "Statement Necklaces" (substring).
    expect(res[0].taxonomyId).toBe(10);
    expect(res.find((x) => x.taxonomyId === 10)!.path).toBe('Jewelry');
  });

  it('returns [] for a blank query', async () => {
    const r = await loadTaxonomyResolver(fakeClient, fakeCache);
    expect(r.search('   ')).toEqual([]);
  });

  it('matches case-insensitively', async () => {
    const r = await loadTaxonomyResolver(fakeClient, fakeCache);
    expect(r.search('MUG').map((x) => x.taxonomyId)).toContain(20);
  });
});
