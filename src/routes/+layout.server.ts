import type { LayoutServerLoad } from './$types';

/**
 * Global auth state for every page (incl. the marketing homepage). Without this the public
 * header had no idea a visitor was already signed in, so it always showed "Log in" / "Start
 * free" — making a logged-in user think they were logged out. `locals.user` is populated in
 * hooks.server.ts from the session cookie.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  const u = locals.user;
  return {
    user: u ? { id: u.id, name: u.name, email: u.email } : null,
  };
};
