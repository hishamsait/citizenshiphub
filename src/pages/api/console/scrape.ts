import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db/client';
import { scrapeCountry } from '../../../lib/ai/scraper';

/** POST /api/console/scrape — run an AI-assisted scrape for a single country. */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb(locals);
  const body = (await request.json().catch(() => ({}))) as { iso2?: unknown };
  const iso2 = String(body?.iso2 ?? '').trim().toUpperCase();
  if (!iso2) return json({ error: 'Missing "iso2".' }, 400);

  const run = await scrapeCountry(locals.runtime.env, db, iso2);
  return json(run);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
