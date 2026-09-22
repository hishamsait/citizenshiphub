import type { EconomicIndicators } from '../../data/types';
import type { Db } from './client';

interface EconomicsRow {
  iso2: string;
  iso3: string | null;
  gdp_per_capita_usd: number | null;
  gdp_per_capita_year: number | null;
  inflation_pct: number | null;
  inflation_year: number | null;
  life_expectancy: number | null;
  life_expectancy_year: number | null;
  gdp_growth_pct: number | null;
  gdp_growth_year: number | null;
  hdi: number | null;
  hdi_year: number | null;
  hdi_rank: number | null;
}

function mapRow(r: EconomicsRow): EconomicIndicators {
  return {
    iso2: r.iso2,
    iso3: r.iso3,
    gdpPerCapitaUsd: r.gdp_per_capita_usd,
    gdpPerCapitaYear: r.gdp_per_capita_year,
    inflationPct: r.inflation_pct,
    inflationYear: r.inflation_year,
    lifeExpectancy: r.life_expectancy,
    lifeExpectancyYear: r.life_expectancy_year,
    gdpGrowthPct: r.gdp_growth_pct,
    gdpGrowthYear: r.gdp_growth_year,
    hdi: r.hdi,
    hdiYear: r.hdi_year,
    hdiRank: r.hdi_rank,
  };
}

export async function getEconomics(db: Db, iso2: string): Promise<EconomicIndicators | null> {
  const r = await db.prepare('SELECT * FROM country_economics WHERE iso2 = ?').bind(iso2).first<EconomicsRow>();
  return r ? mapRow(r) : null;
}

export async function listEconomics(db: Db): Promise<Record<string, EconomicIndicators>> {
  const { results } = await db.prepare('SELECT * FROM country_economics').all<EconomicsRow>();
  const map: Record<string, EconomicIndicators> = {};
  for (const r of results) map[r.iso2] = mapRow(r);
  return map;
}
