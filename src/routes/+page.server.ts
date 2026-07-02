import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Local-dev Etsy OAuth bridge.
 *
 * The Etsy app's registered redirect URI is `http://localhost:3001/` (the root), but the
 * real handler lives at `/api/connect/etsy/callback`. When Etsy bounces the browser back to
 * the root with `?code=…&state=…`, forward those params to the handler so the token exchange
 * runs as usual.
 *
 * In production the redirect URI is the callback route directly, so the root never receives
 * these params and this guard is a no-op.
 */
export const load: PageServerLoad = ({ url }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code && state) {
    throw redirect(302, `/api/connect/etsy/callback${url.search}`);
  }
  return {};
};
