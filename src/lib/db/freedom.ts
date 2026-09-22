import type { CountryFreedom, FreedomMetric } from '../../data/types';
import type { Db } from './client';

interface FreedomRow {
  iso2: string;
  cpi_score: number | null;
  cpi_rank: number | null;
  cpi_year: number | null;
  fiw_score: number | null;
  fiw_rank: number | null;
  fiw_year: number | null;
  fiw_status: string | null;
  human_rights_score: number | null;
  human_rights_rank: number | null;
  human_rights_year: number | null;
  democracy_score: number | null;
  democracy_rank: number | null;
  democracy_year: number | null;
  happiness_score: number | null;
  happiness_rank: number | null;
  happiness_year: number | null;
}

function metric(
  score: number | null,
  rank: number | null,
  year: number | null,
  note: string | null = null,
): FreedomMetric | null {
  if (score === null && rank === null && year === null && note === null) return null;
  return { score, rank, year, note };
}

function mapRow(r: FreedomRow): CountryFreedom {
  return {
    iso2: r.iso2,
    cpi: metric(r.cpi_score, r.cpi_rank, r.cpi_year),
    fiw: metric(r.fiw_score, r.fiw_rank, r.fiw_year, r.fiw_status),
    humanRights: metric(r.human_rights_score, r.human_rights_rank, r.human_rights_year),
    democracy: metric(r.democracy_score, r.democracy_rank, r.democracy_year),
    happiness: metric(r.happiness_score, r.happiness_rank, r.happiness_year),
  };
}

export async function getFreedom(db: Db, iso2: string): Promise<CountryFreedom | null> {
  const r = await db.prepare('SELECT * FROM country_freedom WHERE iso2 = ?').bind(iso2).first<FreedomRow>();
  return r ? mapRow(r) : null;
}

export async function listFreedom(db: Db): Promise<Record<string, CountryFreedom>> {
  const { results } = await db.prepare('SELECT * FROM country_freedom').all<FreedomRow>();
  const map: Record<string, CountryFreedom> = {};
  for (const r of results) map[r.iso2] = mapRow(r);
  return map;
}
