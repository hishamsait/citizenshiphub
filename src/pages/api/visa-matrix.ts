import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db/client';
import { getMatrixForPassport } from '../../lib/db/visa';

/** GET /api/visa-matrix?passport=IE visa matrix row for a single passport. */
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const passport = (url.searchParams.get('passport') ?? '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(passport)) {
    return json({ error: 'passport must be a two-letter ISO code.' }, 400);
  }

  const db = getDb(locals);
  const cells = await getMatrixForPassport(db, passport);
  return json({ passport, cells });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
