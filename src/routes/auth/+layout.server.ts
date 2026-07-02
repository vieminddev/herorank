/**
 * /auth/* shared server data — tells the login/signup pages which auth methods are live.
 *
 * `googleEnabled` / `emailEnabled` are derived from the presence of the relevant secrets so the UI
 * only shows a "Continue with Google" button or a "Forgot password?" link when they actually work.
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ platform, locals, url }) => {
  // Already signed in? Don't show the login/signup forms again — bounce into the app.
  // (Password reset / verify pages stay reachable so a logged-in user can still use a link.)
  if (locals.user && (url.pathname === '/auth/login' || url.pathname === '/auth/signup')) {
    const r = url.searchParams.get('redirect');
    const dest = r && r.startsWith('/') && !r.startsWith('//') ? r : '/dashboard';
    throw redirect(302, dest);
  }

  const env = platform?.env;
  return {
    googleEnabled: !!(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET),
    emailEnabled: !!(env?.RESEND_API_KEY && env?.EMAIL_FROM),
  };
};
