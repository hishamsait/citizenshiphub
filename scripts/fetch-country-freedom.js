#!/usr/bin/env node
/**
 * Citizenship Hub freedom & governance ETL.
 *
 * Fetches the Corruption Perceptions Index (Transparency International, via
 * Our World in Data) and Freedom in the World (Freedom House), normalises
 * every value to ISO2, and writes:
 *   src/data/country-freedom.json
 *
 * Data sources:
 *   - Transparency International Corruption Perceptions Index (via OWID)
 *       https://ourworldindata.org/grapher/corruption-perception-index
 *   - V-Dem Human Rights Index & Liberal Democracy Index (via OWID)
 *       https://ourworldindata.org/grapher/human-rights-index-vdem
 *       https://ourworldindata.org/grapher/liberal-democracy-index
 *   - Freedom House Freedom in the World 2024 (All_data_FIW_2013-2024.xlsx)
 *       https://freedomhouse.org/report/freedom-world
 *
 * Usage:
 *   node scripts/fetch-country-freedom.js           # fetch (30-day cache)
 *   node scripts/fetch-country-freedom.js --fresh   # ignore cache
 *   node scripts/fetch-country-freedom.js --offline # cached data only
 *   node scripts/fetch-country-freedom.js --out=tmp # write JSON elsewhere
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DEFAULT_OUT = path.resolve(ROOT, 'src', 'data');
const PASSPORTS_PATH = path.join(ROOT, 'src', 'data', 'passports.json');
const GEO_PATH = path.join(ROOT, 'src', 'data', 'world-countries.geo.json');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const OWID_BASE = 'https://ourworldindata.org/grapher/';
const OWID_SOURCES = [
  { slug: 'corruption-perception-index', column: 'Corruption Perceptions Index', cache: 'owid-corruption-perception-index.csv', label: 'Corruption Perceptions Index' },
  { slug: 'human-rights-index-vdem', column: 'Human Rights Index', cache: 'owid-human-rights-index.csv', label: 'Human Rights Index' },
  { slug: 'liberal-democracy-index', column: 'Liberal democracy index', cache: 'owid-liberal-democracy-index.csv', label: 'Liberal Democracy Index' },
  { slug: 'happiness-cantril-ladder', column: 'Self-reported life satisfaction', cache: 'owid-happiness.csv', label: 'Life satisfaction' },
];

const FIW_URL = 'https://freedomhouse.org/sites/default/files/2024-02/All_data_FIW_2013-2024.xlsx';

const SOURCES = [
  { name: 'Transparency International Corruption Perceptions Index (via Our World in Data)', url: 'https://www.transparency.org/en/cpi/2024', updatedAt: null },
  { name: 'V-Dem Human Rights Index (via Our World in Data)', url: 'https://v-dem.net/', updatedAt: null },
  { name: 'V-Dem Liberal Democracy Index (via Our World in Data)', url: 'https://v-dem.net/', updatedAt: null },
  { name: 'World Happiness Report Life satisfaction (Cantril ladder, via Our World in Data)', url: 'https://worldhappiness.report/', updatedAt: null },
  { name: 'Freedom House Freedom in the World 2024', url: 'https://freedomhouse.org/report/freedom-world', updatedAt: null },
];

const FIW_STATUS = { F: 'Free', PF: 'Partly Free', NF: 'Not Free' };

// Country-name → ISO2 aliases for spellings that differ from mledoze common names.
const ALIASES = {
  'Congo (Brazzaville)': 'CG',
  'Republic of the Congo': 'CG',
  'Congo (Kinshasa)': 'CD',
  'Democratic Republic of the Congo': 'CD',
  'DR Congo': 'CD',
  'Côte d’Ivoire': 'CI',
  'Cote d’Ivoire': 'CI',
  'Ivory Coast': 'CI',
  'Cape Verde': 'CV',
  'Cabo Verde': 'CV',
  'Eswatini': 'SZ',
  'Swaziland': 'SZ',
  'Türkiye': 'TR',
  'Turkey': 'TR',
  'Czechia': 'CZ',
  'Czech Republic': 'CZ',
  'North Macedonia': 'MK',
  'Timor-Leste': 'TL',
  'East Timor': 'TL',
  'Brunei Darussalam': 'BN',
  'Laos': 'LA',
  'South Korea': 'KR',
  'North Korea': 'KP',
  'United States': 'US',
  'United Kingdom': 'GB',
  'Russia': 'RU',
  'St. Kitts and Nevis': 'KN',
  'St. Lucia': 'LC',
  'St. Vincent and the Grenadines': 'VC',
  'The Gambia': 'GM',
};

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

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'citizenshiphub-etl (+https://citizenshiphub.com)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Minimal RFC-4180 CSV parser (quoted fields, commas, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
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

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ISO3 → ISO2, from the bundled Natural Earth shapes (public domain). */
function makeIso3ToIso2() {
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
    for (const key of [code(p.ISO_A2), code(p.ISO_A2_EH)]) {
      if (key && /^[A-Z]{2}$/.test(key) && !idx.has(iso3)) idx.set(iso3, key);
    }
  }
  return idx;
}

/** Country-name → ISO2, from passports.json (mledoze) plus explicit aliases. */
function makeNameIndex(passports, iso2Set) {
  const idx = new Map();
  for (const p of passports) {
    if (!iso2Set.has(p.code)) continue;
    const key = norm(p.name);
    if (key && !idx.has(key)) idx.set(key, p.code);
  }
  for (const [alias, iso2] of Object.entries(ALIASES)) {
    const key = norm(alias);
    if (!idx.has(key)) idx.set(key, iso2);
  }
  return idx;
}

/** Fetch (or load) an OWID grapher CSV and reduce to latest value per ISO3. */
async function fetchOwid(opts, source) {
  const cachePath = path.join(CACHE_DIR, source.cache);
  const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
  let csv;
  if (!opts.fresh && cacheFresh) {
    csv = fs.readFileSync(cachePath, 'utf8');
    log(opts, `✓ Loaded cached ${source.label}`);
  } else {
    if (opts.offline) throw new Error(`no fresh cache for ${source.label} (offline)`);
    const url = `${OWID_BASE}${source.slug}.csv?v=1&csvType=full`;
    csv = await fetchText(url);
    fs.writeFileSync(cachePath, csv);
    log(opts, `✓ Fetched ${source.label} (${(csv.length / 1024).toFixed(0)} KB)`);
  }
  return parseOwid(csv, source.column);
}

function parseOwid(csvText, column) {
  const rows = parseCsv(csvText);
  const byIso3 = new Map();
  if (rows.length < 2) return byIso3;
  const header = rows[0].map((h) => h.trim());
  const iCode = header.indexOf('Code');
  const iYear = header.indexOf('Year');
  const iVal = header.indexOf(column);
  if (iCode < 0 || iYear < 0 || iVal < 0) return byIso3;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = String(row[iCode] ?? '').trim().toUpperCase();
    const year = toInt(row[iYear]);
    const score = toNumber(row[iVal]);
    if (!code || year === null || score === null) continue;
    const prev = byIso3.get(code);
    if (!prev || year > prev.year) byIso3.set(code, { score, year });
  }
  return byIso3;
}

/** Fetch (or load) the Freedom House FIW xlsx and keep the latest edition. */
async function fetchFiw(opts) {
  const cachePath = path.join(CACHE_DIR, 'freedom-house-fiw.xlsx');
  const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
  let buf;
  if (!opts.fresh && cacheFresh) {
    buf = fs.readFileSync(cachePath);
    log(opts, '✓ Loaded cached Freedom House FIW');
  } else {
    if (opts.offline) throw new Error('no fresh cache for FIW (offline)');
    buf = await fetchBinary(FIW_URL);
    fs.writeFileSync(cachePath, buf);
    log(opts, `✓ Fetched Freedom House FIW (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  return parseFiw(buf);
}

function parseFiw(buf) {
  const result = { byName: new Map(), year: null };
  let wb;
  try {
    wb = XLSX.read(buf);
  } catch {
    return result;
  }
  const ws = wb.Sheets['FIW13-24'];
  if (!ws) return result;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if ((rows[i] ?? []).includes('Country/Territory') && (rows[i] ?? []).includes('Edition')) { hIdx = i; break; }
  }
  if (hIdx < 0) return result;

  const header = rows[hIdx];
  const iName = header.indexOf('Country/Territory');
  const iEdition = header.indexOf('Edition');
  const iStatus = header.indexOf('Status');
  const iTotal = header.indexOf('Total');

  let maxYear = 0;
  const byName = new Map();
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = String(row[iName] ?? '').trim();
    const edition = toInt(row[iEdition]);
    if (!name || edition === null) continue;
    if (edition > maxYear) maxYear = edition;
    const rec = {
      edition,
      status: String(row[iStatus] ?? '').trim(),
      score: toNumber(row[iTotal]),
    };
    // Keep the most-recent edition per country (sheet is ordered newest→oldest).
    const prev = byName.get(name);
    if (!prev || edition > prev.edition) byName.set(name, rec);
  }

  for (const [name, rec] of byName) {
    if (rec.edition === maxYear) result.byName.set(name, rec);
  }
  result.year = maxYear;
  return result;
}

function statusLabel(code) {
  return FIW_STATUS[code] ?? (code || null);
}

/** Compute 1-based ranks (1 = best) from a Map<iso2, { score }>. */
function rankByScore(map) {
  const entries = [...map.entries()].filter(([, v]) => v && v.score !== null);
  entries.sort((a, b) => b[1].score - a[1].score);
  const rankByIso2 = new Map();
  entries.forEach(([iso2], i) => rankByIso2.set(iso2, i + 1));
  return rankByIso2;
}

function combine(iso2List, cpiByIso2, hriByIso2, ldiByIso2, happinessByIso2, fiwByIso2, fiwYear) {
  const cpiRank = rankByScore(cpiByIso2);
  const hriRank = rankByScore(hriByIso2);
  const ldiRank = rankByScore(ldiByIso2);
  const happinessRank = rankByScore(happinessByIso2);
  const fiwRank = rankByScore(fiwByIso2);
  return iso2List.map((iso2) => {
    const metric = (rec, rankMap, note = null) =>
      rec ? { score: rec.score, rank: rankMap.get(iso2) ?? null, year: rec.year, note } : null;
    const cpi = cpiByIso2.get(iso2);
    const hri = hriByIso2.get(iso2);
    const ldi = ldiByIso2.get(iso2);
    const happiness = happinessByIso2.get(iso2);
    const fiw = fiwByIso2.get(iso2);
    return {
      iso2,
      cpi: metric(cpi, cpiRank),
      humanRights: metric(hri, hriRank),
      democracy: metric(ldi, ldiRank),
      happiness: metric(happiness, happinessRank),
      fiw: fiw ? { score: fiw.score, rank: fiwRank.get(iso2) ?? null, year: fiwYear, note: statusLabel(fiw.status) } : null,
    };
  });
}

function makeMeta(totalCountries) {
  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    license: 'Transparency International CPI (CC BY-ND 4.0, via Our World in Data CC BY); V-Dem (CC BY); Freedom House Freedom in the World 2024 (© Freedom House, informational use)',
    disclaimer: 'Informational only indices reflect the methodologies of the external organisations. Verify with the original sources.',
    totalCountries,
  };
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  const opts = parseArgs();
  const startedAt = Date.now();
  log(opts, '\nCitizenship Hub freedom & governance ETL');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(opts.outDir, { recursive: true });

  const { passports } = JSON.parse(fs.readFileSync(PASSPORTS_PATH, 'utf8'));
  const iso2List = passports.map((p) => String(p.code ?? '').toUpperCase()).filter(Boolean);
  const iso2Set = new Set(iso2List);
  log(opts, `✓ Loaded ${iso2List.length} ISO2 codes from passports.json`);

  const iso3ToIso2 = makeIso3ToIso2();
  const nameIndex = makeNameIndex(passports, iso2Set);

  const owidByIso2 = {};
  for (const src of OWID_SOURCES) {
    const byIso3 = await fetchOwid(opts, src).catch((e) => {
      log(opts, `⚠ ${src.label}: ${e.message}`);
      return new Map();
    });
    const byIso2 = new Map();
    for (const [iso3, rec] of byIso3) {
      const iso2 = iso3ToIso2.get(iso3);
      if (iso2 && iso2Set.has(iso2)) byIso2.set(iso2, rec);
    }
    owidByIso2[src.slug] = byIso2;
    log(opts, `✓ ${src.label}: ${byIso2.size} countries mapped`);
  }

  const fiw = await fetchFiw(opts).catch((e) => {
    log(opts, `⚠ Freedom House FIW: ${e.message}`);
    return { byName: new Map(), year: null };
  });
  const fiwByIso2 = new Map();
  const unmatched = new Set();
  for (const [name, rec] of fiw.byName) {
    const iso2 = nameIndex.get(norm(name));
    if (iso2 && iso2Set.has(iso2)) fiwByIso2.set(iso2, rec);
    else unmatched.add(name);
  }
  log(opts, `✓ Freedom in the World (${fiw.year}): ${fiwByIso2.size} countries mapped`);
  if (unmatched.size) log(opts, `⚠ ${unmatched.size} unmatched FIW names: ${[...unmatched].sort().join(', ')}`);

  const countries = combine(
    iso2List,
    owidByIso2['corruption-perception-index'],
    owidByIso2['human-rights-index-vdem'],
    owidByIso2['liberal-democracy-index'],
    owidByIso2['happiness-cantril-ladder'],
    fiwByIso2,
    fiw.year,
  );
  const meta = makeMeta(countries.length);
  writeJson(path.join(opts.outDir, 'country-freedom.json'), { meta, countries });
  log(opts, `✓ Wrote country-freedom.json (${countries.length} records)`);

  const withCpi = countries.filter((c) => c.cpi !== null).length;
  const withHri = countries.filter((c) => c.humanRights !== null).length;
  const withLdi = countries.filter((c) => c.democracy !== null).length;
  const withHappiness = countries.filter((c) => c.happiness !== null).length;
  const withFiw = countries.filter((c) => c.fiw !== null).length;
  log(opts, `  coverage CPI: ${withCpi} · Human Rights: ${withHri} · Liberal Democracy: ${withLdi} · Life satisfaction: ${withHappiness} · Freedom in the World: ${withFiw}`);

  log(opts, `\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${path.relative(ROOT, opts.outDir)}/`);
}

main().catch((err) => {
  console.error('\nETL failed:', err);
  process.exit(1);
});



