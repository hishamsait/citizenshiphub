import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client';
import { getCountryDetail } from '../../../../lib/db/countries-console';
import { getCountryAnalytics } from '../../../../lib/db/country-analytics';
import { listCountrySources } from '../../../../lib/db/country-sources';
import { listCountryNews } from '../../../../lib/db/news';
import { listScrapeRuns } from '../../../../lib/db/scrapes';
import { listEmergencyNumbers } from '../../../../lib/db/emergency';
import { getRelocation } from '../../../../lib/db/relocation';
import { trafficFromEnv } from '../../../../lib/analytics/cloudflare';

/** GET /api/console/countries/:iso2 JSON detail + analytics + sources/news/scrapes for the country drawer. */
export const GET: APIRoute = async ({ params, locals }) => {
  const iso2 = (params.iso2 ?? '').toUpperCase();
  const db = getDb(locals);
  const traffic = await trafficFromEnv(locals.runtime.env, 30);
  const pathViews = new Map(traffic.topPaths.map((p) => [p.path, p.views] as const));
  const [country, analytics, sources, news, scrapes, emergency, relocation] = await Promise.all([
    getCountryDetail(db, iso2),
    getCountryAnalytics(db, iso2, pathViews),
    listCountrySources(db, iso2),
    listCountryNews(db, iso2, 6),
    listScrapeRuns(db, iso2, 5),
    listEmergencyNumbers(db, iso2),
    getRelocation(db, iso2),
  ]);
  if (!country) return json({ error: 'Country not found.' }, 404);
  return json({ ...country, analytics, sources, news, scrapes, emergency, relocation });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

