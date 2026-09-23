import type { APIRoute } from 'astro';
import { verifyTotp } from '../../../lib/auth/totp';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../../lib/auth/session';

/** POST /api/console/login verify a TOTP code and issue a signed session cookie. */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const secret = locals.runtime?.env?.ADMIN_TOTP_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    return json({ error: 'Console is not configured.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const rawNext = typeof body.next === 'string' ? body.next : '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/console/';

  if (!/^\d{6}$/.test(code)) {
    return json({ error: 'Enter the 6-digit code from your authenticator app.' }, 400);
  }

  const valid = await verifyTotp(secret, code);
  if (!valid) {
    return json({ error: 'That code is invalid or expired. Please try again.' }, 401);
  }

  const token = await createSessionToken(secret);
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: SESSION_TTL_SECONDS,
  });

  return json({ ok: true, redirect: next });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
