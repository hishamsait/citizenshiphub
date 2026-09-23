import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db/client';

interface SearchRow {
  code: string;
  name: string;
  region: string;
  slug: string | null;
  summary: string | null;
}

/** GET /api/search?q=ireland DB-backed search across countries and guides. */
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return json({ results: [] });

  const db = getDb(locals);
  const like = `%${q}%`;
  const { results } = await db
    .prepare(
      `SELECT c.iso2 AS code, c.name, c.region, g.slug, g.summary
       FROM countries c
       LEFT JOIN country_guides g ON g.iso2 = c.iso2
       WHERE c.name LIKE ? OR c.iso2 LIKE ? OR g.summary LIKE ?
       ORDER BY c.name ASC
       LIMIT 20`,
    )
    .bind(like, like, like)
    .all<SearchRow>();

  return json({
    results: results.map((r) => ({
      code: r.code,
      name: r.name,
      region: r.region,
      slug: r.slug,
      summary: r.summary,
    })),
  });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
