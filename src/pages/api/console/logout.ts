import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../../lib/auth/session';

/** GET /api/console/logout — clear the session cookie and return to the login page. */
export const GET: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/console/login', 302);
};
