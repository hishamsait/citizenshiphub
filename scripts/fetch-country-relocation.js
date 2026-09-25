#!/usr/bin/env node
/**
 * Citizenship Hub relocation & living ETL.
 *
 * Fetches World Bank internet penetration (individuals using the Internet, %)
 * and merges curated static reference facts (driving side, healthcare system,
 * climate, primary timezone) to write:
 *   src/data/country-relocation.json
 *
 * Numbeo cost-of-living/salary and safety-index fields are intentionally left
 * NULL pending a licensing decision; the columns exist in the schema already.
 *
 * Usage:
 *   node scripts/fetch-country-relocation.js           # fetch (30-day cache)
 *   node scripts/fetch-country-relocation.js --fresh   # ignore cache
 *   node scripts/fetch-country-relocation.js --offline # static facts only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DEFAULT_OUT = path.resolve(ROOT, 'src', 'data');
const PASSPORTS_PATH = path.join(ROOT, 'src', 'data', 'passports.json');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INTERNET_INDICATOR = 'IT.NET.USER.ZS';

const SOURCES = [
  { name: 'World Bank Individuals using the Internet (% of population)', url: 'https://data.worldbank.org/indicator/IT.NET.USER.ZS', updatedAt: null },
];

const LEFT_DRIVING = new Set([
  'GB','IE','MT','CY',
  'JP','IN','PK','BD','LK','NP','BT','MY','SG','ID','TH','BN','HK','MO','MV','TL',
  'ZA','SZ','LS','BW','ZW','ZM','MW','TZ','KE','UG','NA','MZ','MU','SC',
  'AU','NZ','FJ','PG','SB','WS',
  'JM','TT','BB','BS','GD','VC','LC','DM','AG','KN','GY','SR',
]);

const HEALTHCARE = {
  GB: 'Universal public (NHS)', IE: 'Universal public', CA: 'Universal public', AU: 'Universal public (Medicare)',
  NZ: 'Universal public', IT: 'Universal public', ES: 'Universal public', PT: 'Universal public', GR: 'Universal public',
  DK: 'Universal public', SE: 'Universal public', NO: 'Universal public', FI: 'Universal public', IS: 'Universal public',
  CU: 'Universal public', BR: 'Universal public (SUS)',
  DE: 'Social insurance', FR: 'Social insurance', NL: 'Social insurance (mandatory)', CH: 'Social insurance (mandatory)',
  AT: 'Social insurance', BE: 'Social insurance', LU: 'Social insurance', JP: 'Social insurance', KR: 'Social insurance',
  TW: 'Social insurance', CZ: 'Social insurance', SK: 'Social insurance', SI: 'Social insurance', EE: 'Social insurance',
  LT: 'Social insurance', LV: 'Social insurance', HU: 'Social insurance', PL: 'Social insurance', IL: 'Social insurance',
  US: 'Private / market', SG: 'Mixed (public + mandatory savings)',
  IN: 'Mixed (public + private)', MX: 'Mixed (public + private)', CN: 'Mixed (public insurance)',
  TH: 'Mixed', MY: 'Mixed', PH: 'Mixed', ID: 'Mixed', TR: 'Mixed', AR: 'Mixed', CL: 'Mixed', CO: 'Mixed', PE: 'Mixed',
};

const CLIMATE = {
  GB: 'Temperate oceanic', IE: 'Temperate oceanic', FR: 'Temperate / Mediterranean', DE: 'Temperate',
  NL: 'Temperate oceanic', BE: 'Temperate oceanic', DK: 'Temperate oceanic', ES: 'Mediterranean', PT: 'Mediterranean',
  IT: 'Mediterranean', GR: 'Mediterranean', TR: 'Mediterranean / continental', SE: 'Continental / subarctic',
  NO: 'Temperate / subarctic', FI: 'Continental / subarctic', IS: 'Subarctic / oceanic', CH: 'Alpine / temperate',
  AT: 'Alpine / temperate', CA: 'Continental / subarctic', US: 'Varied (continental to subtropical)',
  AU: 'Varied (desert to temperate)', NZ: 'Temperate oceanic', BR: 'Tropical / subtropical', MX: 'Varied (desert to tropical)',
  JP: 'Temperate', KR: 'Temperate', CN: 'Varied (continental to subtropical)', IN: 'Tropical / subtropical',
  TH: 'Tropical', VN: 'Tropical', ID: 'Tropical', MY: 'Tropical', PH: 'Tropical', SG: 'Tropical',
  AE: 'Desert', SA: 'Desert', QA: 'Desert', EG: 'Desert', ZA: 'Temperate / subtropical', KE: 'Tropical', NG: 'Tropical',
};

const TIMEZONE = {
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin', NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels', ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome', GR: 'Europe/Athens',
  SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki', DK: 'Europe/Copenhagen', IS: 'Atlantic/Reykjavik',
  CH: 'Europe/Zurich', AT: 'Europe/Vienna', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest', BG: 'Europe/Sofia', TR: 'Europe/Istanbul', IL: 'Asia/Jerusalem', AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh', QA: 'Asia/Qatar', SG: 'Asia/Singapore', HK: 'Asia/Hong_Kong', JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul', TW: 'Asia/Taipei', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', ID: 'Asia/Jakarta',
  PH: 'Asia/Manila', MY: 'Asia/Kuala_Lumpur', NZ: 'Pacific/Auckland', FJ: 'Pacific/Fiji', EG: 'Africa/Cairo',
  ZA: 'Africa/Johannesburg', KE: 'Africa/Nairobi', NG: 'Africa/Lagos', MA: 'Africa/Casablanca',
  AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima',
  MX: 'America/Mexico_City', BR: 'America/Sao_Paulo',
};

function parseArgs() {
  const args = process.argv.slice(2);
  return { offline: args.includes('--offline'), fresh: args.includes('--fresh'), quiet: args.includes('--quiet') };
}

function log(opts, msg) { if (!opts.quiet) console.log(msg); }

async function fetchWorldBank(opts) {
  const cachePath = path.join(CACHE_DIR, `${INTERNET_INDICATOR}.json`);
  const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
  if (!opts.fresh && cacheFresh) {
    log(opts, `✓ Loaded cached World Bank ${INTERNET_INDICATOR}`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  if (opts.offline) throw new Error(`no fresh cache for ${INTERNET_INDICATOR} (offline)`);
  const rows = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `https://api.worldbank.org/v2/country/all/indicator/${INTERNET_INDICATOR}?format=json&mrnev=1&per_page=400&page=${page}`;
    const res = await fetch(url, { headers: { 'user-agent': 'citizenshiphub-etl (+https://citizenshiphub.com)' }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (page === 1) totalPages = json[0]?.pages ?? 1;
    rows.push(...(json[1] ?? []));
    page += 1;
  } while (page <= totalPages);
  fs.writeFileSync(cachePath, JSON.stringify(rows, null, 2));
  log(opts, `✓ Fetched World Bank ${INTERNET_INDICATOR} (${rows.length} records)`);
  return rows;
}

function normalizeInternet(rows, iso2Set) {
  const byIso2 = new Map();
  for (const row of rows ?? []) {
    const iso2 = String(row?.country?.id ?? '').toUpperCase();
    if (!iso2Set.has(iso2)) continue;
    const value = typeof row?.value === 'number' ? row.value : null;
    const year = row?.date ? Math.round(Number(row.date)) : null;
    byIso2.set(iso2, { value, year });
  }
  return byIso2;
}

async function main() {
  const opts = parseArgs();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(DEFAULT_OUT, { recursive: true });
  const { passports } = JSON.parse(fs.readFileSync(PASSPORTS_PATH, 'utf8'));
  const iso2List = passports.map((p) => String(p.code ?? '').toUpperCase()).filter(Boolean);
  const iso2Set = new Set(iso2List);

  let internet = new Map();
  try {
    internet = normalizeInternet(await fetchWorldBank(opts), iso2Set);
  } catch (err) {
    log(opts, `⚠ World Bank ${INTERNET_INDICATOR}: ${err.message}`);
  }

  const countries = iso2List.map((iso2) => {
    const net = internet.get(iso2) ?? { value: null, year: null };
    return {
      iso2,
      internetPenetrationPct: net.value,
      internetYear: net.year,
      avgBroadbandMbps: null,
      broadbandYear: null,
      minimumWageUsd: null,
      minimumWageYear: null,
      avgNetSalaryUsd: null,
      avgNetSalaryYear: null,
      costOfLivingIndex: null,
      rentIndex: null,
      colYear: null,
      safetyIndex: null,
      safetyYear: null,
      healthcareSystem: HEALTHCARE[iso2] ?? null,
      climate: CLIMATE[iso2] ?? null,
      timezone: TIMEZONE[iso2] ?? null,
      drivingSide: LEFT_DRIVING.has(iso2) ? 'left' : 'right',
      plugVoltage: null,
    };
  });

  const meta = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    license: 'World Bank (CC BY 4.0); curated public reference facts.',
    disclaimer: 'Informational only. Cost-of-living, salary and safety indices are omitted pending a data-licensing review.',
    totalCountries: countries.length,
  };

  const outFile = path.join(DEFAULT_OUT, 'country-relocation.json');
  fs.writeFileSync(outFile, `${JSON.stringify({ meta, countries }, null, 2)}\n`, 'utf8');
  const withNet = countries.filter((c) => c.internetPenetrationPct !== null).length;
  const withHealth = countries.filter((c) => c.healthcareSystem !== null).length;
  const withClimate = countries.filter((c) => c.climate !== null).length;
  log(opts, `✓ Wrote country-relocation.json (${countries.length} records)`);
  log(opts, `  coverage internet: ${withNet} · healthcare: ${withHealth} · climate: ${withClimate}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
