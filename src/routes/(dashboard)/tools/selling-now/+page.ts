import { redirect } from '@sveltejs/kit';
export const load = () => { throw redirect(301, '/tools/best-sellers?view=selling-now'); };
