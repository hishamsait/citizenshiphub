import type { Db } from './client';

/** A passport joined with its ranking + profile summary (flattened for table/list pages). */
export interface RankedCountry {
  code: string;
  name: string;
  region: string;
  subregion: string | null;
  capital: string | null;
  flag: string | null;
  continent: string | null;
  population: number | null;
  areaKm2: number | null;
  incomeGroup: string | null;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  visaRequired: number;
  noAdmission: number;
  mobilityScore: number;
  coverage: number | null;
  rank: number;
  denseRank: number;
  percentile: number;
}

export async function listRankings(db: Db): Promise<RankedCountry[]> {
  const { results } = await db
    .prepare(`
      SELECT
        c.iso2 AS code, c.name, c.region, c.subregion, c.capital, c.coverage,
        p.flag, p.continent, p.population, p.area_km2 AS areaKm2, p.income_group AS incomeGroup,
        r.rank_position AS rank, r.mobility_score AS mobilityScore,
        r.visa_free_count AS visaFree, r.voa_count AS visaOnArrival, r.eta_count AS eta,
        r.evisa_count AS eVisa, r.visa_required_count AS visaRequired,
        r.no_admission_count AS noAdmission, r.dense_rank AS denseRank, r.percentile
      FROM countries c
      JOIN passport_rankings r ON r.passport_iso = c.iso2
      LEFT JOIN country_profiles p ON p.iso2 = c.iso2
      ORDER BY r.rank_position ASC`)
    .all<RankedCountry>();
  return results;
}
