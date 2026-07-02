/**
 * Tests for the own-shop WRITE client additions (create-draft feature).
 *
 * Covers the new methods on `createUserEtsyClient`: getShippingProfiles, listOwnListingsRaw,
 * createDraftListing, uploadListingImage. All hermetic — a stub `fetchImpl` records calls and
 * returns canned responses; no network. Mirrors the injected-fetch convention in tests/etsy.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { createUserEtsyClient } from '../src/lib/server/services/etsy/etsyWriteClient';

const BASE = 'https://api.etsy.test/v3/application';

type Call = { url: string; init?: RequestInit };

function harness(responder: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const { status, body } = responder(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createUserEtsyClient({
    clientId: 'keystr:secret',
    accessToken: 'tok-123',
    fetchImpl,
    apiBase: BASE,
  });
  return { calls, client };
}

describe('getShippingProfiles', () => {
  it('GETs the shop shipping-profiles and maps to {id,title}', async () => {
    const { calls, client } = harness(() => ({
      status: 200,
      body: {
        results: [
          { shipping_profile_id: 111, title: 'Standard' },
          { shipping_profile_id: 222, title: 'Express' },
        ],
      },
    }));
    const profiles = await client.getShippingProfiles(99);
    expect(profiles).toEqual([
      { id: 111, title: 'Standard' },
      { id: 222, title: 'Express' },
    ]);
    expect(calls[0].url).toBe(`${BASE}/shops/99/shipping-profiles`);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers['x-api-key']).toBe('keystr:secret');
  });

  it('returns [] when Etsy responds non-ok', async () => {
    const { client } = harness(() => ({ status: 403, body: { error: 'nope' } }));
    expect(await client.getShippingProfiles(1)).toEqual([]);
  });
});

describe('listOwnListingsRaw', () => {
  it('returns the raw active listings (with taxonomy/readiness/shipping fields intact)', async () => {
    const { calls, client } = harness(() => ({
      status: 200,
      body: {
        results: [
          { listing_id: 5, taxonomy_id: 1049, readiness_state_id: 777, shipping_profile_id: 111 },
        ],
      },
    }));
    const raw = await client.listOwnListingsRaw({ shopId: 99, limit: 1 });
    expect(raw[0].taxonomy_id).toBe(1049);
    expect(raw[0].readiness_state_id).toBe(777);
    expect(calls[0].url).toContain('/shops/99/listings/active?limit=1');
  });

  it('throws etsy own-listings-raw <status> on failure (so the caller can surface reauth)', async () => {
    const { client } = harness(() => ({ status: 401, body: {} }));
    await expect(client.listOwnListingsRaw({ shopId: 1 })).rejects.toThrow(/401/);
  });
});

describe('createDraftListing', () => {
  it('POSTs a form with every required field and returns {listingId,url,state}', async () => {
    const { calls, client } = harness(() => ({
      status: 201,
      body: { listing_id: 4242, state: 'draft', url: 'https://etsy.test/listing/4242' },
    }));
    const out = await client.createDraftListing({
      shopId: 99,
      title: 'A handmade mug',
      description: 'Nice mug',
      tags: ['mug', 'ceramic'],
      price: 9.99,
      quantity: 2,
      taxonomyId: 1049,
      shippingProfileId: 111,
      readinessStateId: 777,
    });
    expect(out).toEqual({ listingId: 4242, url: 'https://etsy.test/listing/4242', state: 'draft' });

    expect(calls[0].url).toBe(`${BASE}/shops/99/listings`);
    expect(calls[0].init?.method).toBe('POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const form = new URLSearchParams(calls[0].init?.body as string);
    expect(form.get('quantity')).toBe('2');
    expect(form.get('title')).toBe('A handmade mug');
    expect(form.get('description')).toBe('Nice mug');
    expect(form.get('price')).toBe('9.99');
    expect(form.get('who_made')).toBe('i_did');
    expect(form.get('when_made')).toBe('made_to_order');
    expect(form.get('taxonomy_id')).toBe('1049');
    expect(form.get('shipping_profile_id')).toBe('111');
    expect(form.get('readiness_state_id')).toBe('777');
    expect(form.get('tags')).toBe('mug,ceramic');
  });

  it('omits readiness_state_id / tags when not provided', async () => {
    const { calls, client } = harness(() => ({ status: 201, body: { listing_id: 1, state: 'draft' } }));
    await client.createDraftListing({
      shopId: 1,
      title: 't',
      description: 'd',
      price: 5,
      quantity: 1,
      taxonomyId: 2,
      shippingProfileId: 3,
    });
    const form = new URLSearchParams(calls[0].init?.body as string);
    expect(form.has('readiness_state_id')).toBe(false);
    expect(form.has('tags')).toBe(false);
  });

  it('throws etsy create-listing <status> on a rejected write', async () => {
    const { client } = harness(() => ({ status: 400, body: { error: 'bad' } }));
    await expect(
      client.createDraftListing({
        shopId: 1, title: 't', description: 'd', price: 5, quantity: 1, taxonomyId: 2, shippingProfileId: 3,
      })
    ).rejects.toThrow(/etsy create-listing 400/);
  });
});

describe('uploadListingImage', () => {
  it('POSTs multipart to the listing images endpoint and returns true on success', async () => {
    const { calls, client } = harness(() => ({ status: 201, body: { listing_image_id: 1 } }));
    const ok = await client.uploadListingImage(99, 4242, new Uint8Array([1, 2, 3]).buffer, 1);
    expect(ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/shops/99/listings/4242/images`);
    expect(calls[0].init?.method).toBe('POST');
    // Must NOT hand-set Content-Type — fetch sets the multipart boundary itself.
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('returns false (best-effort) when the upload fails', async () => {
    const { client } = harness(() => ({ status: 500, body: {} }));
    expect(await client.uploadListingImage(1, 2, new Uint8Array([1]).buffer, 1)).toBe(false);
  });
});
