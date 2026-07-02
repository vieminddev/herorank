/**
 * `/my-shop` routes — the connected seller's own-shop dashboard + listing editor.
 *
 * Default-exported `Hono<AppEnv>`, mounted by Engineer C via `app.route('/my-shop', myShop)`.
 * Every endpoint is session-authed (`requireAuth`) and operates on the caller's OAuth-connected
 * Etsy shop (`connected(c)` resolves + refreshes the token, returns NOT_CONNECTED → 404 if none).
 *
 * Reads (overview/audit/receipts/listing) use the user-token Etsy client (`createUserEtsyClient`).
 * Writes (listing update/restore) are feature-flagged behind `isWriteEnabled(env)` — until Etsy
 * grants the `listings_w` scope they return 503 WRITE_PENDING_APPROVAL; when on, the prior
 * title/description/tags are snapshotted into `listing_backups` before the PUT so a restore can
 * roll back.
 *
 * Endpoints:
 *   GET  /overview                  — 90-day revenue/units/orders + top listings (real data).
 *   GET  /audit                     — per-listing SEO/quality score (KV-cached 5 min).
 *   GET  /receipts-pending-review   — recent orders + this user's review-outreach status.
 *   POST /review-request-draft      — LLM-drafted thank-you + review request (metered tool).
 *   POST /outreach/:receiptId       — record contacted/skipped outreach for a receipt.
 *   GET  /write-status              — whether listing-write is enabled.
 *   GET  /listing/:id               — one own listing + recent backups + write flag.
 *   POST /listing/:id/update        — edit title/description/tags (snapshots first). Write-gated.
 *   POST /listing/:id/restore       — restore a prior snapshot. Write-gated.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getEnv, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { getEstimation } from '../../services/etsy/estimationContract';
import {
  connected,
  createUserEtsyClient,
  isWriteEnabled,
  type RawListing,
} from '../../services/etsy/etsyWriteClient';
import { getEtsyClientForUser } from '../../services/etsy/provider';
import { createEtsyCache } from '../../services/etsy/cache';
import { loadTaxonomyResolver } from '../../services/etsy/taxonomyResolver';
import { createLlmService } from '../../services/llmService';
import { LlmError } from '../../services/llmService';
import { completeJson } from '../../services/llmJson';

const nowSec = (): number => Math.floor(Date.now() / 1000);
const DAY = 86_400;

/** Returned whenever the caller has no OAuth-connected Etsy shop. */
const NOT_CONNECTED = {
  error: 'NOT_CONNECTED',
  message: 'Connect your Etsy shop to see real data.',
} as const;

/** Returned when a connected shop's OAuth token is dead (401/403) → the user must reconnect. */
const REAUTH = {
  error: 'ETSY_REAUTH',
  message: 'Your Etsy connection has expired. Reconnect your shop to see live data.',
} as const;

/** True when an Etsy client error carries a trailing 401/403 status (auth/token failure). */
function isReauthError(err: unknown): boolean {
  const s = Number(String(err instanceof Error ? err.message : '').match(/(\d{3})\s*$/)?.[1]);
  return s === 401 || s === 403;
}

const router = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /overview — 90-day sales summary + top listings (real shop data)
// ---------------------------------------------------------------------------
router.get('/overview', requireAuth, async (c) => {
  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });

  let receipts;
  try {
    receipts = await client.getShopReceipts({
      shopId: ctx.shop.etsyShopId,
      sinceEpochSec: nowSec() - 90 * DAY,
    });
  } catch (err) {
    if (isReauthError(err)) return c.json(REAUTH, 502);
    return c.json(
      { error: 'ETSY_UNAVAILABLE', message: 'Could not reach Etsy for your shop data. Please try again.' },
      502
    );
  }

  const currency = receipts.find((r) => r.currency)?.currency ?? 'USD';
  const net = (r: (typeof receipts)[number]) => r.total - (r.tax ?? 0);
  const revenue = receipts.reduce((s, r) => s + net(r), 0);
  const units = receipts.reduce((s, r) => s + r.items.reduce((u, i) => u + i.quantity, 0), 0);
  const orders = receipts.length;
  const cut30 = nowSec() - 30 * DAY;
  const last30 = receipts.filter((r) => r.createdAt >= cut30);

  const byListing = new Map<string, { title: string; units: number; orders: number }>();
  for (const r of receipts) {
    for (const it of r.items) {
      const key = it.listingId != null ? String(it.listingId) : it.title ?? 'unknown';
      const cur = byListing.get(key) ?? {
        title: it.title ?? `Listing ${it.listingId ?? '—'}`,
        units: 0,
        orders: 0,
      };
      cur.units += it.quantity;
      cur.orders += 1;
      byListing.set(key, cur);
    }
  }
  const topListings = [...byListing.values()].sort((a, b) => b.units - a.units).slice(0, 5);

  const calRow = await getDb(c)
    .prepare('SELECT COUNT(*) AS n FROM calibration_factors')
    .first<{ n: number }>();
  const calibrated = (calRow?.n ?? 0) > 0;

  return c.json({
    connected: true,
    real: true,
    calibrated,
    shopName: ctx.shop.shopName,
    currency,
    rangeDays: 90,
    totals: {
      orders,
      revenue: Number(revenue.toFixed(2)),
      units,
      aov: orders ? Number((revenue / orders).toFixed(2)) : 0,
    },
    last30: {
      orders: last30.length,
      revenue: Number(last30.reduce((s, r) => s + net(r), 0).toFixed(2)),
    },
    topListings,
  });
});

// ---------------------------------------------------------------------------
// GET /audit — per-listing SEO/quality scores (KV-cached 5 min)
// ---------------------------------------------------------------------------
router.get('/audit', requireAuth, async (c) => {
  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const env = getEnv(c);
  const cacheKey = `myshop:audit:v2:${getUser(c).id}`;
  const cached = await env.KV.get(cacheKey, 'json').catch(() => null);
  if (cached) return c.json({ ...(cached as object), cached: true });

  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });
  let listings;
  try {
    listings = await client.listOwnListings({ shopId: ctx.shop.etsyShopId, limit: 50 });
  } catch (err) {
    if (isReauthError(err)) return c.json(REAUTH, 502);
    return c.json(
      { error: 'ETSY_UNAVAILABLE', message: 'Could not load your listings from Etsy.' },
      502
    );
  }

  const est = await getEstimation();
  const rows = listings.map((listing) => {
    const audit = est.listingAudit(listing);
    const sections = [audit.title, audit.tags, audit.images, audit.video, audit.description];
    const score = Math.round(sections.reduce((s, x) => s + x.score, 0) / sections.length);
    const topIssues = sections
      .flatMap((sec) => [...sec.feedback.clarity, ...sec.feedback.seo])
      .filter((f) => f.status !== 'good')
      .map((f) => f.text)
      .slice(0, 3);
    return {
      listingId: listing.listing_id,
      title: listing.title,
      url: listing.url ?? null,
      imageUrl: listing.images?.[0]?.url_570xN ?? listing.images?.[0]?.url_fullxfull ?? null,
      score,
      topIssues,
    };
  });
  rows.sort((a, b) => a.score - b.score);

  const payload = {
    connected: true,
    shopName: ctx.shop.shopName,
    count: rows.length,
    listings: rows,
    estimated: { score: true },
  };
  await env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 }).catch(() => {});
  return c.json(payload);
});

// ---------------------------------------------------------------------------
// GET /receipts-pending-review — recent orders + this user's outreach status
// ---------------------------------------------------------------------------
router.get('/receipts-pending-review', requireAuth, async (c) => {
  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });

  let receipts;
  try {
    receipts = await client.getShopReceipts({
      shopId: ctx.shop.etsyShopId,
      sinceEpochSec: nowSec() - 60 * DAY,
    });
  } catch (err) {
    if (isReauthError(err)) return c.json(REAUTH, 502);
    return c.json(
      { error: 'ETSY_UNAVAILABLE', message: 'Could not reach Etsy for your orders. Please try again.' },
      502
    );
  }

  const { results } = await getDb(c)
    .prepare('SELECT receipt_id, status FROM review_outreach WHERE user_id = ?')
    .bind(getUser(c).id)
    .all<{ receipt_id: number; status: string }>();
  const statusByReceipt = new Map(results.map((r) => [r.receipt_id, r.status]));

  const orders = receipts
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((r) => ({
      receiptId: r.receiptId,
      createdAt: r.createdAt,
      buyerName: r.buyerName,
      productTitle: r.items[0]?.title ?? null,
      status: statusByReceipt.get(r.receiptId) ?? null,
    }));

  return c.json({ connected: true, shopName: ctx.shop.shopName, orders });
});

// ---------------------------------------------------------------------------
// POST /review-request-draft — LLM-drafted thank-you + review request (metered)
// ---------------------------------------------------------------------------
const inputSchema = z.object({
  shopName: z.string().min(1).max(120),
  buyerName: z.string().max(120).optional(),
  productTitle: z.string().max(300).optional(),
  /** Voice of the message. */
  tone: z.enum(['warm', 'professional', 'playful']).default('warm'),
});

const outputSchema = z.object({
  subject: z.string().min(1).max(160),
  message: z.string().min(1).max(1200),
});

const systemPrompt = `You write short, sincere post-purchase messages for Etsy sellers to send to buyers. The goal: thank the buyer and gently invite an honest review — never pushy, never offering incentives (against Etsy policy).

Rules:
- Keep it brief (2-4 short sentences) and human.
- Match the requested tone (warm / professional / playful).
- Personalize with the buyer's first name and the product when provided; otherwise stay natural without placeholders.
- NEVER promise discounts, refunds, or anything in exchange for a review (Etsy prohibits incentivized reviews).
- No emoji spam; at most one tasteful emoji for warm/playful tones.

Return ONLY a JSON object: {"subject":"...","message":"..."}`;

/** Build the chat messages for the review-request draft from the validated input. */
function buildMessages(input: z.infer<typeof inputSchema>) {
  const parts = [
    `Shop name: ${input.shopName}`,
    input.buyerName ? `Buyer first name: ${input.buyerName}` : 'Buyer name: (unknown — keep it general)',
    input.productTitle ? `Product: ${input.productTitle}` : 'Product: (unspecified)',
    `Tone: ${input.tone}`,
  ];
  return [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: `${parts.join('\n')}\n\nWrite the thank-you + review request as JSON.`,
    },
  ];
}

router.post('/review-request-draft', requireAuth, requireCredits('review-request-draft'), async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const env = getEnv(c);
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    return c.json(
      { error: 'LLM_UNAVAILABLE', message: 'AI service is not configured yet. Please try again later.' },
      503
    );
  }
  const llm = createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeoutMs: 30_000,
  });

  try {
    const draft = await completeJson(llm, {
      messages: buildMessages(parsed.data),
      schema: outputSchema,
      temperature: 0.8,
    });
    if (!draft) {
      return c.json(
        { error: 'LLM_BAD_OUTPUT', message: 'The AI returned an unexpected result. Please try again.' },
        502
      );
    }
    return c.json(draft);
  } catch (err) {
    if (err instanceof LlmError && err.code === 'LLM_RATE_LIMIT') {
      return c.json({ error: 'LLM_BUSY', message: 'AI service is busy. Please retry in a moment.' }, 429);
    }
    return c.json(
      { error: 'LLM_UNAVAILABLE', message: 'AI service is temporarily unavailable. Please try again.' },
      502
    );
  }
});

// ---------------------------------------------------------------------------
// POST /outreach/:receiptId — record contacted/skipped for a receipt
// ---------------------------------------------------------------------------
const outreachBody = z.object({ status: z.enum(['contacted', 'skipped']).default('contacted') });

router.post('/outreach/:receiptId', requireAuth, async (c) => {
  const receiptId = Number(c.req.param('receiptId'));
  if (!Number.isInteger(receiptId)) return c.json({ error: 'VALIDATION', message: 'Bad receipt id' }, 400);

  let raw: unknown = {};
  try {
    raw = await c.req.json();
  } catch {
    /* empty body → default status */
  }
  const status = outreachBody.parse(raw ?? {}).status;

  await getDb(c)
    .prepare(
      `INSERT INTO review_outreach (user_id, receipt_id, status, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, receipt_id) DO UPDATE SET status = excluded.status`
    )
    .bind(getUser(c).id, receiptId, status, nowSec())
    .run();

  return c.json({ ok: true, receiptId, status });
});

// ---------------------------------------------------------------------------
// Listing read + write
// ---------------------------------------------------------------------------

/** Returned for write endpoints while Etsy write-access is still pending approval. */
const WRITE_PENDING = {
  error: 'WRITE_PENDING_APPROVAL',
  message:
    'Editing listings is awaiting Etsy write-access approval. It will switch on automatically once granted.',
} as const;

/**
 * Map an own-listing write failure to a clear, seller-facing JSON error. `updateOwnListing`
 * throws `Error('etsy update <status>')`, so we recover Etsy's HTTP status from the message and
 * distinguish rate-limits (429) and rejected fields (4xx) from generic outages.
 */
function writeError(c: Context<AppEnv>, err: unknown, action: 'update' | 'restore' | 'create') {
  const msg = err instanceof Error ? err.message : '';
  const status = Number(msg.match(/(\d{3})\s*$/)?.[1]);
  if (status === 429) {
    return c.json(
      { error: 'RATE_LIMIT', message: 'Etsy is rate-limiting writes right now. Please wait a moment and try again.' },
      429
    );
  }
  if (status === 400 || status === 409 || status === 422) {
    return c.json(
      {
        error: 'VALIDATION',
        message: 'Etsy rejected the change — a field (title, tags, or description) is invalid. Adjust it and try again.',
      },
      422
    );
  }
  return c.json(
    { error: 'ETSY_UNAVAILABLE', message: `Etsy rejected the ${action}. Please try again.` },
    502
  );
}

router.get('/write-status', requireAuth, async (c) => {
  return c.json({ writeEnabled: isWriteEnabled(getEnv(c)) });
});

router.get('/listing/:id', requireAuth, async (c) => {
  const listingId = Number(c.req.param('id'));
  if (!Number.isInteger(listingId)) return c.json({ error: 'VALIDATION', message: 'Bad listing id' }, 400);
  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });

  let listing;
  try {
    listing = await client.getOwnListing(listingId);
  } catch (err) {
    // A 401/403 from Etsy means the OAuth token is dead (refresh failed) → the user must
    // reconnect. Surface that distinctly so the FE can offer a reconnect path, not a dead
    // "try again". Status stays 502 (not 401) so the client's auth-redirect doesn't fire.
    const status = Number(String(err instanceof Error ? err.message : '').match(/(\d{3})\s*$/)?.[1]);
    if (status === 401 || status === 403) {
      return c.json(
        { error: 'ETSY_REAUTH', message: 'Your Etsy connection has expired. Reconnect your shop to keep editing.' },
        502
      );
    }
    return c.json({ error: 'ETSY_UNAVAILABLE', message: 'Could not load that listing from Etsy.' }, 502);
  }
  if (!listing) return c.json({ error: 'NOT_FOUND', message: 'Listing not found in your shop.' }, 404);

  const { results } = await getDb(c)
    .prepare(
      'SELECT id, created_at FROM listing_backups WHERE user_id = ? AND listing_id = ? ORDER BY created_at DESC LIMIT 10'
    )
    .bind(getUser(c).id, listingId)
    .all<{ id: number; created_at: number }>();

  return c.json({ listing, writeEnabled: isWriteEnabled(getEnv(c)), backups: results });
});

const updateBody = z.object({
  title: z.string().min(1).max(140).optional(),
  description: z.string().max(20_000).optional(),
  tags: z.array(z.string().min(1).max(20)).max(13).optional(),
});

router.post('/listing/:id/update', requireAuth, async (c) => {
  if (!isWriteEnabled(getEnv(c))) return c.json(WRITE_PENDING, 503);
  const listingId = Number(c.req.param('id'));
  if (!Number.isInteger(listingId)) return c.json({ error: 'VALIDATION', message: 'Bad listing id' }, 400);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = updateBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });

  try {
    const current = await client.getOwnListing(listingId);
    if (!current) return c.json({ error: 'NOT_FOUND', message: 'Listing not found in your shop.' }, 404);

    // Snapshot the prior state BEFORE writing so /restore can roll back.
    await getDb(c)
      .prepare('INSERT INTO listing_backups (user_id, listing_id, snapshot_json, created_at) VALUES (?, ?, ?, ?)')
      .bind(
        getUser(c).id,
        listingId,
        JSON.stringify({ title: current.title, description: current.description, tags: current.tags }),
        nowSec()
      )
      .run();

    await client.updateOwnListing({ shopId: ctx.shop.etsyShopId, listingId, ...parsed.data });
    return c.json({ ok: true, listingId });
  } catch (err) {
    return writeError(c, err, 'update');
  }
});

/**
 * GET /listing/:id/backup/:backupId — return a backup snapshot for the restore PREVIEW.
 * Lets the seller see exactly what `Restore` will bring back (title/description/tags) before
 * confirming the write. Read-only, but lives with the restore flow it serves.
 */
router.get('/listing/:id/backup/:backupId', requireAuth, async (c) => {
  const listingId = Number(c.req.param('id'));
  const backupId = Number(c.req.param('backupId'));
  if (!Number.isInteger(listingId) || !Number.isInteger(backupId)) {
    return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  }

  const row = await getDb(c)
    .prepare('SELECT snapshot_json FROM listing_backups WHERE id = ? AND user_id = ? AND listing_id = ?')
    .bind(backupId, getUser(c).id, listingId)
    .first<{ snapshot_json: string }>();
  if (!row) return c.json({ error: 'NOT_FOUND', message: 'Backup not found.' }, 404);

  let snap: { title?: string; description?: string; tags?: string[] };
  try {
    snap = JSON.parse(row.snapshot_json);
  } catch {
    return c.json({ error: 'CORRUPT_BACKUP', message: 'That backup could not be read.' }, 422);
  }
  return c.json({
    backupId,
    snapshot: {
      title: snap.title ?? '',
      description: snap.description ?? '',
      tags: Array.isArray(snap.tags) ? snap.tags : [],
    },
  });
});

router.post('/listing/:id/restore', requireAuth, async (c) => {
  if (!isWriteEnabled(getEnv(c))) return c.json(WRITE_PENDING, 503);
  const listingId = Number(c.req.param('id'));

  let raw: { backupId?: unknown } | null;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const backupId = Number(raw?.backupId);
  if (!Number.isInteger(listingId) || !Number.isInteger(backupId)) {
    return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  }

  const row = await getDb(c)
    .prepare('SELECT snapshot_json FROM listing_backups WHERE id = ? AND user_id = ? AND listing_id = ?')
    .bind(backupId, getUser(c).id, listingId)
    .first<{ snapshot_json: string }>();
  if (!row) return c.json({ error: 'NOT_FOUND', message: 'Backup not found.' }, 404);

  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });

  try {
    const snap = JSON.parse(row.snapshot_json);
    await client.updateOwnListing({ shopId: ctx.shop.etsyShopId, listingId, ...snap });
    return c.json({ ok: true, listingId, restoredFrom: backupId });
  } catch (err) {
    return writeError(c, err, 'restore');
  }
});

// ---------------------------------------------------------------------------
// Create-draft listing: meta + taxonomy search + create (write-gated)
// ---------------------------------------------------------------------------

/** First defined `readiness_state_id` across the shop's listings (mandatory for new physical listings). */
function firstReadiness(raw: RawListing[]): number | undefined {
  for (const l of raw) if (typeof l.readiness_state_id === 'number') return l.readiness_state_id;
  return undefined;
}

/**
 * GET /listing/create-meta — everything the Builder's "Create draft" form needs in one call:
 * the shop's shipping profiles (dropdown), the categories it already uses (quick-pick chips), and
 * a resolved readiness_state_id (server-side; not user-facing).
 */
router.get('/create-listing/meta', requireAuth, async (c) => {
  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });
  const shopId = ctx.shop.etsyShopId;

  let shippingProfiles: Array<{ id: number; title: string }> = [];
  let raw: RawListing[] = [];
  try {
    [shippingProfiles, raw] = await Promise.all([
      client.getShippingProfiles(shopId),
      client.listOwnListingsRaw({ shopId, limit: 50 }),
    ]);
  } catch (err) {
    if (isReauthError(err)) return c.json(REAUTH, 502);
    return c.json({ error: 'ETSY_UNAVAILABLE', message: 'Could not load your shop settings from Etsy.' }, 502);
  }

  // Distinct taxonomy ids the shop already uses → names via the public taxonomy resolver.
  const env = getEnv(c);
  const taxoIds = [
    ...new Set(
      raw
        .map((l) => (typeof l.taxonomy_id === 'number' ? l.taxonomy_id : null))
        .filter((x): x is number => x != null)
    ),
  ];
  let shopCategories: Array<{ taxonomyId: number; name: string }> = taxoIds.map((id) => ({
    taxonomyId: id,
    name: `Category ${id}`,
  }));
  try {
    const resolver = await loadTaxonomyResolver(getEtsyClientForUser(env), createEtsyCache(env.KV));
    shopCategories = taxoIds.map((id) => ({ taxonomyId: id, name: resolver.nameOf(id) ?? `Category ${id}` }));
  } catch {
    /* keep the id-only fallback names */
  }

  return c.json({
    shippingProfiles,
    shopCategories,
    readinessStateId: firstReadiness(raw) ?? null,
    writeEnabled: isWriteEnabled(env),
  });
});

/** GET /create-listing/taxonomy-search?q= — search Etsy's seller taxonomy for the category picker. */
router.get('/create-listing/taxonomy-search', requireAuth, async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ results: [] });
  try {
    const env = getEnv(c);
    const resolver = await loadTaxonomyResolver(getEtsyClientForUser(env), createEtsyCache(env.KV));
    return c.json({ results: resolver.search(q, 20) });
  } catch {
    return c.json({ results: [] });
  }
});

const createBody = z.object({
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(20_000),
  tags: z.array(z.string().min(1).max(20)).max(13).optional(),
  price: z.number().positive().max(1_000_000),
  quantity: z.number().int().positive().max(999).default(1),
  taxonomyId: z.number().int().positive(),
  shippingProfileId: z.number().int().positive(),
  imageUrls: z.array(z.string()).max(10).optional(),
});

/**
 * POST /listing/create — create a DRAFT listing on the connected shop from Builder output.
 * Write-gated. readiness_state_id is resolved server-side from an existing listing. Images are
 * uploaded best-effort (a failed image never fails the draft). Returns the new listing + Etsy URL.
 */
router.post('/create-listing', requireAuth, async (c) => {
  if (!isWriteEnabled(getEnv(c))) return c.json(WRITE_PENDING, 503);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = createBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const ctx = await connected(c);
  if (!ctx) return c.json(NOT_CONNECTED, 404);
  const client = createUserEtsyClient({ clientId: ctx.clientId, accessToken: ctx.accessToken });
  const shopId = ctx.shop.etsyShopId;

  // readiness_state_id is mandatory for physical listings — copy from an existing listing.
  let readinessStateId: number | undefined;
  try {
    readinessStateId = firstReadiness(await client.listOwnListingsRaw({ shopId, limit: 20 }));
  } catch (err) {
    if (isReauthError(err)) return c.json(REAUTH, 502);
  }

  let created: { listingId: number; url: string | null; state: string };
  try {
    created = await client.createDraftListing({
      shopId,
      title: parsed.data.title,
      description: parsed.data.description,
      tags: parsed.data.tags,
      price: parsed.data.price,
      quantity: parsed.data.quantity,
      taxonomyId: parsed.data.taxonomyId,
      shippingProfileId: parsed.data.shippingProfileId,
      readinessStateId,
    });
  } catch (err) {
    return writeError(c, err, 'create');
  }

  // Best-effort image upload — resolve relative builder URLs against this request's origin.
  let imagesUploaded = 0;
  if (parsed.data.imageUrls?.length) {
    const origin = new URL(c.req.url).origin;
    let rank = 1;
    for (const u of parsed.data.imageUrls.slice(0, 10)) {
      try {
        const abs = u.startsWith('http') ? u : new URL(u, origin).toString();
        const r = await fetch(abs);
        if (!r.ok) continue;
        const bytes = await r.arrayBuffer();
        if (await client.uploadListingImage(shopId, created.listingId, bytes, rank)) {
          imagesUploaded += 1;
          rank += 1;
        }
      } catch {
        /* skip a bad image; the draft still stands */
      }
    }
  }

  return c.json({
    ok: true,
    listingId: created.listingId,
    url: created.url,
    state: created.state,
    imagesUploaded,
  });
});

export default router;
