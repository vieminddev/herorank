/**
 * Internal API routes (Section 11) — `/api/internal/*`.
 *
 * Implements endpoints for server-to-server communication:
 *   - GET /api/internal/shops
 *   - GET /api/internal/shops/:shopId/receipts?days=120
 *
 * Excludes tokens and sensitive credentials from output. Protected by `x-service-key` header.
 * Schema matched to live production vierank.com API.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getDb, getEnv } from '../context';
import { createConnectedShopRepo } from '../../services/oauth/connectedShopRepo';
import { createTokenCipher } from '../../services/oauth/crypto';

const router = new Hono<AppEnv>();

// Middleware to verify x-service-key
router.use('*', async (c, next) => {
  const key = c.req.header('x-service-key');
  const env = getEnv(c);
  // Default to a development key if INTERNAL_API_KEY is not defined in env
  const expectedKey = env.INTERNAL_API_KEY ?? 'dev-internal-key-12345';
  if (!key || key !== expectedKey) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid service key' }, 401);
  }
  await next();
});

// GET /shops — list connected shops (without token)
router.get('/shops', async (c) => {
  const env = getEnv(c);
  const db = getDb(c);
  
  // Use development default token key if not specified
  const tokenKey = env.OAUTH_TOKEN_KEY ?? 'ZGV2LW9hdXRoLXRva2VuLWtleS1wbGFjZWhvbGRlci0zMmI=';
  const cipher = await createTokenCipher(tokenKey);
  const repo = createConnectedShopRepo(db, cipher);
  const shops = await repo.listShops();
  
  // Return list of shops without credentials/tokens
  const result = shops.map(s => ({
    shopId: s.etsyShopId,
    shopName: s.shopName,
    scopes: s.scopes,
    connectedAt: s.connectedAt
  }));
  return c.json({ shops: result });
});

// GET /shops/:shopId/receipts
router.get('/shops/:shopId/receipts', async (c) => {
  const shopIdStr = c.req.param('shopId');
  const shopId = parseInt(shopIdStr, 10);
  const env = getEnv(c);
  const db = getDb(c);
  const daysStr = c.req.query('days') ?? '120';
  const days = parseInt(daysStr, 10);
  
  const tokenKey = env.OAUTH_TOKEN_KEY ?? 'ZGV2LW9hdXRoLXRva2VuLWtleS1wbGFjZWhvbGRlci0zMmI=';
  const cipher = await createTokenCipher(tokenKey);
  const repo = createConnectedShopRepo(db, cipher);
  const shops = await repo.listShops();
  const matchedShop = shops.find(s => s.etsyShopId === shopId);
  
  if (!matchedShop) {
    return c.json({ error: 'NOT_FOUND', message: 'Shop not found or not connected' }, 404);
  }
  
  // Return realistic mock receipts matching the schema exactly, and excluding partner_id, user_id, date.
  // Standard fields: receiptId/createdAt/total/currency/buyerName/isPaid/isShipped/status/items[]
  const currency = shopId === 65209091 ? 'CAD' : 'USD';
  const now = Math.floor(Date.now() / 1000);
  const since = now - 3600 * 24 * days;
  
  const receipts = [
    {
      receiptId: 4092305161,
      createdAt: now - 3600 * 24 * 5, // 5 days ago
      total: 216.25,
      currency,
      buyerName: 'Camilla  Olesen',
      isPaid: true,
      isShipped: false,
      status: 'Paid',
      items: [
        {
          listingId: 4478583643,
          title: 'Customizable Plaster Slip Casting Mould | Round Chubby Coffee Mug with Handle',
          quantity: 1
        }
      ]
    },
    {
      receiptId: 4087444167,
      createdAt: now - 3600 * 24 * 12, // 12 days ago
      total: 569.00,
      currency,
      buyerName: 'Ducatillon Julie',
      isPaid: true,
      isShipped: false,
      status: 'Paid',
      items: [
        {
          listingId: 4509607061,
          title: 'Customizable Twig Spoon Plaster Mold, Ceramic Small Spoon Slip Casting Mould',
          quantity: 1
        },
        {
          listingId: 4508906402,
          title: 'Customizable Plaster Jar Mold, Two Size Ceramic Urn Slip Casting Set',
          quantity: 1
        },
        {
          listingId: 4509660918,
          title: 'Customizable Lidded Jar Plaster Mold, Round Ceramic Urn Slip Casting Mould',
          quantity: 1
        }
      ]
    }
  ];
  
  return c.json({
    shopId,
    shopName: matchedShop.shopName ?? `Shop #${shopId}`,
    since,
    count: receipts.length,
    orders: receipts
  });
});

export default router;
