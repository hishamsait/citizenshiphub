import type { CountryRelocation } from '../../data/types';
import type { Db } from './client';

interface RelocationRow {
  iso2: string;
  internet_penetration_pct: number | null;
  internet_year: number | null;
  avg_broadband_mbps: number | null;
  broadband_year: number | null;
  minimum_wage_usd: number | null;
  minimum_wage_year: number | null;
  avg_net_salary_usd: number | null;
  avg_net_salary_year: number | null;
  cost_of_living_index: number | null;
  rent_index: number | null;
  col_year: number | null;
  safety_index: number | null;
  safety_year: number | null;
  healthcare_system: string | null;
  climate: string | null;
  timezone: string | null;
  driving_side: string | null;
  plug_voltage: string | null;
}

function mapRow(r: RelocationRow): CountryRelocation {
  return {
    iso2: r.iso2,
    internetPenetrationPct: r.internet_penetration_pct,
    internetYear: r.internet_year,
    avgBroadbandMbps: r.avg_broadband_mbps,
    broadbandYear: r.broadband_year,
    minimumWageUsd: r.minimum_wage_usd,
    minimumWageYear: r.minimum_wage_year,
    avgNetSalaryUsd: r.avg_net_salary_usd,
    avgNetSalaryYear: r.avg_net_salary_year,
    costOfLivingIndex: r.cost_of_living_index,
    rentIndex: r.rent_index,
    colYear: r.col_year,
    safetyIndex: r.safety_index,
    safetyYear: r.safety_year,
    healthcareSystem: r.healthcare_system,
    climate: r.climate,
    timezone: r.timezone,
    drivingSide: r.driving_side,
    plugVoltage: r.plug_voltage,
  };
}

export async function getRelocation(db: Db, iso2: string): Promise<CountryRelocation | null> {
  const r = await db.prepare('SELECT * FROM country_relocation WHERE iso2 = ?').bind(iso2).first<RelocationRow>();
  return r ? mapRow(r) : null;
}

export async function listRelocation(db: Db): Promise<Record<string, CountryRelocation>> {
  const { results } = await db.prepare('SELECT * FROM country_relocation').all<RelocationRow>();
  const map: Record<string, CountryRelocation> = {};
  for (const r of results) map[r.iso2] = mapRow(r);
  return map;
}
