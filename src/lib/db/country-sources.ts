import type { Db } from './client';

export interface CountrySource {
  name: string;
  url: string;
  category: string;
  note: string | null;
}

interface CountrySourceRow {
  name: string;
  url: string | null;
  category: string | null;
  note: string | null;
}

export async function listCountrySources(db: Db, iso2: string): Promise<CountrySource[]> {
  const { results } = await db
    .prepare(
      'SELECT name, url, category, note FROM country_immigration_sources WHERE iso2 = ? ORDER BY rowid ASC',
    )
    .bind(iso2)
    .all<CountrySourceRow>();
  return results.map((r) => ({
    name: r.name,
    url: r.url ?? '',
    category: r.category ?? '',
    note: r.note,
  }));
}
