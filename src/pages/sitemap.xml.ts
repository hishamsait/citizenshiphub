import type { APIRoute } from 'astro';
import { getDb } from '../lib/db/client';
import { listGuideSlugs } from '../lib/db/guides';

const SITE = 'https://citizenshiphub.com';

const STATIC_PAGES: Array<[path: string, priority: string]> = [
  ['/', '1.0'],
  ['/countries/', '0.9'],
  ['/passports/', '0.9'],
  ['/explore/', '0.9'],
  ['/compare/', '0.8'],
  ['/best/', '0.8'],
  ['/destinations/', '0.8'],
  ['/terms/', '0.3'],
  ['/privacy/', '0.3'],
];

function url(loc: string, priority: string): string {
  return `  <url><loc>${loc}</loc><priority>${priority}</priority></url>`;
}

/**
 * GET /sitemap.xml — generated at request time from D1 so it always reflects
 * the live set of citizenship guides (the country pages are on-demand SSR and
 * have no `getStaticPaths`, so a static sitemap would go stale).
 */
export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals);
  const slugs = await listGuideSlugs(db);

  const entries = [
    ...STATIC_PAGES.map(([path, priority]) => url(new URL(path, SITE).href, priority)),
    ...slugs.map((slug) => url(`${SITE}/countries/${slug}/`, '0.8')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
