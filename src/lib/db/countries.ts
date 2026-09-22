import type { Db } from './client';

/** Minimal country reference used by explorers, comparison and destination pages. */
export interface CountryRef {
  code: string;
  name: string;
  region: string;
  subregion: string | null;
  capital: string | null;
  slug: string | null;
  flag: string | null;
}

const SELECT = `
  SELECT c.iso2 AS code, c.name, c.region, c.subregion, c.capital, c.slug, p.flag
  FROM countries c
  LEFT JOIN country_profiles p ON p.iso2 = c.iso2`;

export async function listCountries(db: Db): Promise<CountryRef[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY c.name ASC`).all<CountryRef>();
  return results;
}

export async function getCountryBySlug(db: Db, slug: string): Promise<CountryRef | null> {
  return db.prepare(`${SELECT} WHERE c.slug = ?`).bind(slug).first<CountryRef>();
}

export async function getCountryByIso2(db: Db, iso2: string): Promise<CountryRef | null> {
  return db.prepare(`${SELECT} WHERE c.iso2 = ?`).bind(iso2).first<CountryRef>();
}
