import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client';
import { getCountryDetail } from '../../../../lib/db/countries-console';
import { getCountryAnalytics } from '../../../../lib/db/country-analytics';

/** GET /api/console/countries/:iso2 — JSON detail + analytics for the country drawer. */
export const GET: APIRoute = async ({ params, locals }) => {
  const iso2 = (params.iso2 ?? '').toUpperCase();
  const db = getDb(locals);
  const [country, analytics] = await Promise.all([
    getCountryDetail(db, iso2),
    getCountryAnalytics(db, iso2),
  ]);
  if (!country) return json({ error: 'Country not found.' }, 404);
  return json({ ...country, analytics });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
