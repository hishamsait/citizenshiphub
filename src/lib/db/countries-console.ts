import type { Db } from './client';
import { COUNTRY_DATASETS } from '../country-datasets';

export interface CountryCoverage {
  iso2: string;
  name: string;
  region: string;
  flag: string | null;
  slug: string | null;
  datasets: Record<string, boolean>;
  connectedCount: number;
  lastRefreshedAt: string | null;
}

export interface DataPoint {
  id: string;
  label: string;
  includes: string;
  present: boolean;
  fetchedAt: string | null;
  verifiedAt: string | null;
  vintage: string[];
}

export interface CountryDetail {
  iso2: string;
  name: string;
  region: string;
  flag: string | null;
  slug: string | null;
  lastRefreshedAt: string | null;
  points: DataPoint[];
}

interface CoverageRow {
  iso2: string;
  name: string;
  region: string;
  slug: string | null;
  flag: string | null;
  has_visa: number;
  has_rankings: number;
  has_profile: number;
  has_economics: number;
  has_freedom: number;
  has_tax: number;
  has_citizenship: number;
  has_guide: number;
  has_relocation: number;
  has_emergency: number;
}

interface MetaRow {
  dataset_id: string;
  generated_at: string | null;
  verified_at: string | null;
}

type MetaMap = Map<string, { generatedAt: string | null; verifiedAt: string | null }>;

const COVERAGE_SELECT = `
  SELECT
    c.iso2, c.name, c.region, c.slug, pr.flag,
    CASE WHEN EXISTS (SELECT 1 FROM visa_rules v WHERE v.passport_iso = c.iso2 LIMIT 1) THEN 1 ELSE 0 END AS has_visa,
    CASE WHEN r.passport_iso IS NOT NULL THEN 1 ELSE 0 END AS has_rankings,
    CASE WHEN pr.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_profile,
    CASE WHEN e.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_economics,
    CASE WHEN f.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_freedom,
    CASE WHEN t.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_tax,
    CASE WHEN cc.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_citizenship,
    CASE WHEN g.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_guide,
    CASE WHEN rl.iso2 IS NOT NULL THEN 1 ELSE 0 END AS has_relocation,
    CASE WHEN EXISTS (SELECT 1 FROM country_emergency em WHERE em.iso2 = c.iso2 LIMIT 1) THEN 1 ELSE 0 END AS has_emergency
  FROM countries c
  LEFT JOIN passport_rankings r ON r.passport_iso = c.iso2
  LEFT JOIN country_profiles pr ON pr.iso2 = c.iso2
  LEFT JOIN country_economics e ON e.iso2 = c.iso2
  LEFT JOIN country_freedom f ON f.iso2 = c.iso2
  LEFT JOIN country_tax t ON t.iso2 = c.iso2
  LEFT JOIN country_citizenship cc ON cc.iso2 = c.iso2
  LEFT JOIN country_guides g ON g.iso2 = c.iso2
  LEFT JOIN country_relocation rl ON rl.iso2 = c.iso2`;

async function listDatasetMeta(db: Db): Promise<MetaMap> {
  const { results } = await db
    .prepare('SELECT dataset_id, generated_at, verified_at FROM dataset_meta')
    .all<MetaRow>();
  const map: MetaMap = new Map();
  for (const r of results) map.set(r.dataset_id, { generatedAt: r.generated_at, verifiedAt: r.verified_at });
  return map;
}

function presence(row: CoverageRow): Record<string, boolean> {
  return {
    visa: !!row.has_visa,
    rankings: !!row.has_rankings,
    profile: !!row.has_profile,
    economics: !!row.has_economics,
    freedom: !!row.has_freedom,
    tax: !!row.has_tax,
    citizenship: !!row.has_citizenship,
    guide: !!row.has_guide,
    relocation: !!row.has_relocation,
    emergency: !!row.has_emergency,
  };
}

/**
 * Single source of truth for "when was a country last updated". Today it is
 * the most recent dataset `generated_at` among the datasets the country has.
 * When per-country fetch tracking is added (a future migration + ETL change),
 * it can be preferred here without touching any page.
 */
function latestRefresh(present: Record<string, boolean>, meta: MetaMap): string | null {
  let latest: string | null = null;
  for (const ds of COUNTRY_DATASETS) {
    if (!present[ds.id] || !ds.datasetId) continue;
    const g = meta.get(ds.datasetId)?.generatedAt ?? null;
    if (g && (!latest || g > latest)) latest = g;
  }
  return latest;
}

export async function listCountriesWithCoverage(db: Db, q = ''): Promise<CountryCoverage[]> {
  const like = `%${q}%`;
  const { results } = await db
    .prepare(`${COVERAGE_SELECT} WHERE c.name LIKE ? OR c.iso2 LIKE ? ORDER BY c.name ASC`)
    .bind(like, like)
    .all<CoverageRow>();
  const meta = await listDatasetMeta(db);

  return results.map((r) => {
    const present = presence(r);
    return {
      iso2: r.iso2,
      name: r.name,
      region: r.region,
      flag: r.flag,
      slug: r.slug,
      datasets: present,
      connectedCount: COUNTRY_DATASETS.filter((d) => present[d.id]).length,
      lastRefreshedAt: latestRefresh(present, meta),
    };
  });
}

export async function getCountryDetail(db: Db, iso2: string): Promise<CountryDetail | null> {
  const row = await db
    .prepare(`${COVERAGE_SELECT} WHERE c.iso2 = ?`)
    .bind(iso2)
    .first<CoverageRow>();
  if (!row) return null;

  const [meta, vintage] = await Promise.all([listDatasetMeta(db), listVintage(db, iso2)]);
  const present = presence(row);

  const points: DataPoint[] = COUNTRY_DATASETS.map((ds) => {
    const timestamps = ds.datasetId ? meta.get(ds.datasetId) : undefined;
    return {
      id: ds.id,
      label: ds.label,
      includes: ds.includes,
      present: present[ds.id] ?? false,
      fetchedAt: timestamps?.generatedAt ?? null,
      verifiedAt: timestamps?.verifiedAt ?? null,
      vintage: vintage[ds.id] ?? [],
    };
  });

  return {
    iso2: row.iso2,
    name: row.name,
    region: row.region,
    flag: row.flag,
    slug: row.slug,
    lastRefreshedAt: latestRefresh(present, meta),
    points,
  };
}

const VINTAGE_FIELDS: Record<string, { label: string; column: string }[]> = {
  profile: [
    { label: 'Population', column: 'population_year' },
    { label: 'GDP', column: 'gdp_year' },
  ],
  economics: [
    { label: 'GDP per capita', column: 'gdp_per_capita_year' },
    { label: 'Inflation', column: 'inflation_year' },
    { label: 'Life expectancy', column: 'life_expectancy_year' },
    { label: 'GDP growth', column: 'gdp_growth_year' },
    { label: 'HDI', column: 'hdi_year' },
  ],
  freedom: [
    { label: 'CPI', column: 'cpi_year' },
    { label: 'Freedom', column: 'fiw_year' },
    { label: 'Human rights', column: 'human_rights_year' },
    { label: 'Democracy', column: 'democracy_year' },
    { label: 'Happiness', column: 'happiness_year' },
  ],
};

async function listVintage(db: Db, iso2: string): Promise<Record<string, string[]>> {
  type YearRow = Record<string, number | null>;

  const [profile, economics, freedom] = await Promise.all([
    db
      .prepare('SELECT population_year, gdp_year FROM country_profiles WHERE iso2 = ?')
      .bind(iso2)
      .first<YearRow>(),
    db
      .prepare(
        'SELECT gdp_per_capita_year, inflation_year, life_expectancy_year, gdp_growth_year, hdi_year FROM country_economics WHERE iso2 = ?',
      )
      .bind(iso2)
      .first<YearRow>(),
    db
      .prepare(
        'SELECT cpi_year, fiw_year, human_rights_year, democracy_year, happiness_year FROM country_freedom WHERE iso2 = ?',
      )
      .bind(iso2)
      .first<YearRow>(),
  ]);

  const rows: Record<string, YearRow | null> = { profile, economics, freedom };
  const result: Record<string, string[]> = {};

  for (const id of COUNTRY_DATASETS.map((d) => d.id)) {
    const fields = VINTAGE_FIELDS[id] ?? [];
    const row = rows[id];
    const labels: string[] = [];
    if (row) {
      for (const f of fields) {
        const year = row[f.column];
        if (typeof year === 'number' && year > 0) labels.push(`${f.label} ${year}`);
      }
    }
    result[id] = labels;
  }

  return result;
}

