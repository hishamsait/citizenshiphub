#!/usr/bin/env node
/**
 * Citizenship Hub country economic & development profile ETL.
 *
 * Fetches World Bank indicators (GDP per capita, inflation) and the UNDP
 * Human Development Index, normalises every value to ISO2, and writes:
 *   src/data/country-profiles.json
 *
 * Data sources:
 *   - World Bank API (CC BY 4.0)
 *       GDP per capita (current US$)  NY.GDP.PCAP.CD
 *       Inflation, consumer prices    FP.CPI.TOTL.ZG
 *   - UNDP Human Development Report composite indices CSV (CC BY 3.0 IGO)
 *
 * Usage:
 *   node scripts/fetch-country-profiles.js           # fetch (30-day cache)
 *   node scripts/fetch-country-profiles.js --fresh   # ignore cache
 *   node scripts/fetch-country-profiles.js --offline # cached data only
 *   node scripts/fetch-country-profiles.js --out=tmp # write JSON elsewhere
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DEFAULT_OUT = path.resolve(ROOT, 'src', 'data');
const PASSPORTS_PATH = path.join(ROOT, 'src', 'data', 'passports.json');
const GEO_PATH = path.join(ROOT, 'src', 'data', 'world-countries.geo.json');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const WB_INDICATORS = [
  { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)' },
  { id: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)' },
  { id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth (years)' },
  { id: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)' },
];

const UNDP_URL =
  'https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv';

const SOURCES = [
  { name: 'World Bank GDP per capita (current US$)', url: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.CD', updatedAt: null },
  { name: 'World Bank Inflation, consumer prices (annual %)', url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG', updatedAt: null },
  { name: 'World Bank Life expectancy at birth (years)', url: 'https://data.worldbank.org/indicator/SP.DYN.LE00.IN', updatedAt: null },
  { name: 'World Bank GDP growth (annual %)', url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG', updatedAt: null },
  { name: 'UNDP Human Development Report HDI', url: 'https://hdr.undp.org/data-center/documentation-and-downloads', updatedAt: null },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const outEq = args.find((a) => a.startsWith('--out='));
  const outIdx = args.indexOf('--out');
  const outDir = outEq
    ? outEq.slice('--out='.length)
    : outIdx !== -1 && args[outIdx + 1]
      ? args[outIdx + 1]
      : null;
  return {
    offline: args.includes('--offline'),
    fresh: args.includes('--fresh'),
    quiet: args.includes('--quiet'),
    outDir: outDir ? path.resolve(ROOT, outDir) : DEFAULT_OUT,
  };
}

function log(opts, msg) {
  if (!opts.quiet) console.log(msg);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'citizenshiphub-etl (+https://citizenshiphub.com)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Minimal RFC-4180 CSV parser (handles quoted fields, commas, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNumber(v);
  return n === null ? null : Math.round(n);
}

/** ISO2 → ISO3, built from the bundled Natural Earth shapes (public domain). */
function makeIso3Index(iso2Set) {
  const idx = new Map();
  let geo;
  try {
    geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
  } catch {
    return idx;
  }
  const code = (v) => {
    const s = String(v ?? '').toUpperCase();
    return s && s !== '-99' && s !== 'NULL' ? s : null;
  };
  for (const feature of geo?.features ?? []) {
    const p = feature?.properties ?? {};
    const iso3 = code(p.ISO_A3) ?? code(p.ISO_A3_EH);
    if (!iso3) continue;
    // Register both the primary and EH ISO2 codes (e.g. TW via ISO_A2_EH "TW").
    for (const key of [code(p.ISO_A2), code(p.ISO_A2_EH)]) {
      if (key && iso2Set.has(key) && !idx.has(key)) idx.set(key, iso3);
    }
  }
  return idx;
}

/** Fetch a World Bank indicator (all countries, most-recent non-empty value). */
async function fetchWorldBank(indicatorId, opts) {
  const cachePath = path.join(CACHE_DIR, `${indicatorId}.json`);
  const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
  if (!opts.fresh && cacheFresh) {
    log(opts, `✓ Loaded cached World Bank ${indicatorId}`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  if (opts.offline) throw new Error(`no fresh cache for ${indicatorId} (offline)`);

  const rows = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `https://api.worldbank.org/v2/country/all/indicator/${indicatorId}?format=json&mrnev=1&per_page=400&page=${page}`;
    const json = JSON.parse(await fetchText(url));
    if (page === 1) totalPages = json[0]?.pages ?? 1;
    rows.push(...(json[1] ?? []));
    page += 1;
  } while (page <= totalPages);

  fs.writeFileSync(cachePath, JSON.stringify(rows, null, 2));
  log(opts, `✓ Fetched World Bank ${indicatorId} (${rows.length} records)`);
  return rows;
}

/** Reduce raw World Bank rows to Map<ISO2, { value, year, iso3 }> for our countries only. */
function normalizeWorldBank(rows, iso2Set) {
  const byIso2 = new Map();
  for (const row of rows ?? []) {
    const iso2 = String(row?.country?.id ?? '').toUpperCase();
    if (!iso2Set.has(iso2)) continue; // skips aggregate regions (ZH, EU, 1A, …)
    const value = typeof row?.value === 'number' ? row.value : null;
    const year = row?.date ? toInt(row.date) : null;
    byIso2.set(iso2, { value, year, iso3: row?.countryiso3code ? String(row.countryiso3code).toUpperCase() : null });
  }
  return byIso2;
}

/** Fetch (or load) the UNDP HDI composite-indices CSV and index by ISO3. */
async function loadHdi(opts) {
  const cachePath = path.join(CACHE_DIR, 'undp-hdi.csv');
  const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
  let csv;
  if (!opts.fresh && cacheFresh) {
    csv = fs.readFileSync(cachePath, 'utf8');
    log(opts, '✓ Loaded cached UNDP HDI');
  } else {
    if (opts.offline) throw new Error('no fresh cache for UNDP HDI (offline)');
    csv = await fetchText(UNDP_URL);
    fs.writeFileSync(cachePath, csv);
    log(opts, `✓ Fetched UNDP HDI (${(csv.length / 1024).toFixed(0)} KB)`);
  }
  return parseHdi(csv);
}

function parseHdi(csvText) {
  const rows = parseCsv(csvText);
  const empty = { latestYear: null, byIso3: new Map() };
  if (rows.length < 2) return empty;

  const header = rows[0].map((h) => h.trim());
  const colIdx = new Map(header.map((h, i) => [h, i]));

  let latestYear = null;
  for (const h of header) {
    const m = /^hdi_(\d{4})$/.exec(h);
    if (m) {
      const y = Number(m[1]);
      if (latestYear === null || y > latestYear) latestYear = y;
    }
  }

  const iso3Col = colIdx.get('iso3');
  const hdiCol = latestYear === null ? undefined : colIdx.get(`hdi_${latestYear}`);
  if (iso3Col === undefined || hdiCol === undefined) return { latestYear, byIso3: new Map() };

  const rankCol = colIdx.get(`hdi_rank_${latestYear}`) ?? colIdx.get('hdi_rank_2022');

  const byIso3 = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const iso3 = (row[iso3Col] ?? '').trim().toUpperCase();
    if (!iso3) continue;
    const hdi = toNumber(row[hdiCol]);
    const hdiRank = rankCol === undefined ? null : toInt(row[rankCol]);
    byIso3.set(iso3, { hdi, hdiYear: hdi === null ? null : latestYear, hdiRank });
  }
  return { latestYear, byIso3 };
}

function combine(iso2List, gdpByIso2, inflByIso2, lifeByIso2, growthByIso2, hdiByIso3, iso3ByIso2) {
  return iso2List.map((iso2) => {
    const iso3 = iso3ByIso2.get(iso2) ?? null;
    const gdp = gdpByIso2?.get(iso2);
    const infl = inflByIso2?.get(iso2);
    const life = lifeByIso2?.get(iso2);
    const growth = growthByIso2?.get(iso2);
    const hdi = iso3 ? hdiByIso3.get(iso3) : null;
    return {
      iso2,
      iso3,
      gdpPerCapitaUsd: gdp?.value ?? null,
      gdpPerCapitaYear: gdp?.year ?? null,
      inflationPct: infl?.value ?? null,
      inflationYear: infl?.year ?? null,
      lifeExpectancy: life?.value ?? null,
      lifeExpectancyYear: life?.year ?? null,
      gdpGrowthPct: growth?.value ?? null,
      gdpGrowthYear: growth?.year ?? null,
      hdi: hdi?.hdi ?? null,
      hdiYear: hdi?.hdiYear ?? null,
      hdiRank: hdi?.hdiRank ?? null,
    };
  });
}

function makeMeta(totalCountries) {
  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    license: 'World Bank (CC BY 4.0); UNDP Human Development Report (CC BY 3.0 IGO)',
    disclaimer: 'Informational only not investment, financial, or legal advice. Indicators are point-in-time and may be revised by the source.',
    totalCountries,
  };
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  const opts = parseArgs();
  const startedAt = Date.now();
  log(opts, '\nCitizenship Hub country profiles ETL');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(opts.outDir, { recursive: true });

  const { passports } = JSON.parse(fs.readFileSync(PASSPORTS_PATH, 'utf8'));
  const iso2List = passports.map((p) => String(p.code ?? '').toUpperCase()).filter(Boolean);
  const iso2Set = new Set(iso2List);
  log(opts, `✓ Loaded ${iso2List.length} ISO2 codes from passports.json`);

  const iso3ByIso2 = makeIso3Index(iso2Set);

  const wb = {};
  for (const ind of WB_INDICATORS) {
    try {
      const rows = await fetchWorldBank(ind.id, opts);
      wb[ind.id] = normalizeWorldBank(rows, iso2Set);
      log(opts, `✓ ${ind.label}: ${wb[ind.id].size} countries`);
    } catch (err) {
      log(opts, `⚠ World Bank ${ind.id}: ${err.message}`);
      wb[ind.id] = new Map();
    }
  }

  // Prefer World Bank's canonical ISO3 codes (covers territories Natural Earth omits).
  for (const key of WB_INDICATORS.map((i) => i.id)) {
    for (const [iso2, rec] of wb[key] ?? new Map()) {
      if (rec.iso3 && !iso3ByIso2.has(iso2)) iso3ByIso2.set(iso2, rec.iso3);
    }
  }

  let hdi = { latestYear: null, byIso3: new Map() };
  try {
    hdi = await loadHdi(opts);
    log(opts, `✓ UNDP HDI: ${hdi.byIso3.size} countries (latest year ${hdi.latestYear})`);
  } catch (err) {
    log(opts, `⚠ UNDP HDI: ${err.message}`);
  }

  const countries = combine(
    iso2List,
    wb['NY.GDP.PCAP.CD'],
    wb['FP.CPI.TOTL.ZG'],
    wb['SP.DYN.LE00.IN'],
    wb['NY.GDP.MKTP.KD.ZG'],
    hdi.byIso3,
    iso3ByIso2,
  );
  const meta = makeMeta(countries.length);

  writeJson(path.join(opts.outDir, 'country-profiles.json'), { meta, countries });
  log(opts, `✓ Wrote country-profiles.json (${countries.length} records)`);

  const withGdp = countries.filter((c) => c.gdpPerCapitaUsd !== null).length;
  const withInflation = countries.filter((c) => c.inflationPct !== null).length;
  const withLife = countries.filter((c) => c.lifeExpectancy !== null).length;
  const withGrowth = countries.filter((c) => c.gdpGrowthPct !== null).length;
  const withHdi = countries.filter((c) => c.hdi !== null).length;
  log(opts, `  coverage GDP/capita: ${withGdp} · inflation: ${withInflation} · life expectancy: ${withLife} · GDP growth: ${withGrowth} · HDI: ${withHdi}`);

  log(opts, `\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${path.relative(ROOT, opts.outDir)}/`);
}

main().catch((err) => {
  console.error('\nETL failed:', err);
  process.exit(1);
});


