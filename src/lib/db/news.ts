import type { Db } from './client';

export interface NewsItem {
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  snippet: string | null;
}

interface NewsRow {
  title: string;
  url: string | null;
  source_name: string | null;
  published_at: string | null;
  snippet: string | null;
}

export async function listCountryNews(db: Db, iso2: string, limit = 6): Promise<NewsItem[]> {
  const { results } = await db
    .prepare(
      'SELECT title, url, source_name, published_at, snippet FROM country_news WHERE iso2 = ? ORDER BY published_at DESC LIMIT ?',
    )
    .bind(iso2, limit)
    .all<NewsRow>();
  return results.map((r) => ({
    title: r.title,
    url: r.url ?? '',
    sourceName: r.source_name ?? '',
    publishedAt: r.published_at,
    snippet: r.snippet,
  }));
}
