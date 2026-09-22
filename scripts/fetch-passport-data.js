#!/usr/bin/env node
/**
 * Citizenship Hub — passport data ETL.
 *
 * Fetches an open ISO2 passport-destination matrix, classifies each requirement,
 * enriches with country metadata (region/subregion/capital), computes a mobility
 * score, and writes:
 *   src/data/passports.json
 *   src/data/rankings.json
 *   src/data/visa-matrix.json
 *
 * Data sources (MIT-licensed, derived from passportindex.org):
 *   - https://github.com/imorte/passport-index-data      (primary, Feb 2026)
 *   - https://github.com/ilyankou/passport-index-dataset  (fallback, Jan 2025)
 *
 * Usage:
 *   node scripts/fetch-passport-data.js           # fetch (uses 30-day cache)
 *   node scripts/fetch-passport-data.js --fresh   # ignore cache
 *   node scripts/fetch-passport-data.js --offline # bundled seed only
 *   node scripts/fetch-passport-data.js --out=tmp # write JSON elsewhere
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DEFAULT_OUT = path.resolve(ROOT, 'src', 'data');
const NATURAL_EARTH_PATH = path.join(ROOT, 'src', 'data', 'world-countries.geo.json');

const SOURCES = [
  {
    name: 'passport-index-data (imorte)',
    url: 'https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-matrix-iso2.csv',
    updatedAt: '2026-02-17',
  },
  {
    name: 'passport-index-dataset (ilyankou)',
    url: 'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-matrix-iso2.csv',
    updatedAt: '2025-01-12',
  },
];

const METADATA_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';

/** passportindex.org "visa-free score" includes e-visa; set false to exclude. */
const SCORE_INCLUDES_EVISA = true;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ENCODING = {
  F: 'visa free',
  'F:<days>': 'visa free (limited days)',
  A: 'visa on arrival',
  E: 'eta (electronic travel authorisation)',
  V: 'e-visa',
  R: 'visa required',
  N: 'no admission',
  '-': 'home country',
  '?': 'unknown',
};

// Offline fallback — exact counts measured from the Feb-2026 ISO2 matrix.
// [code, name, region, subregion, capital, visaFree, visaOnArrival, eta, eVisa, visaRequired, noAdmission]
const SEED = [
  ['AE', 'United Arab Emirates', 'Asia', 'Western Asia', 'Abu Dhabi', 127, 34, 8, 18, 11, 0],
  ['AR', 'Argentina', 'Americas', 'South America', 'Buenos Aires', 106, 34, 8, 29, 21, 0],
  ['AT', 'Austria', 'Europe', 'Western Europe', 'Vienna', 119, 29, 11, 26, 13, 0],
  ['AU', 'Australia', 'Oceania', 'Australia and New Zealand', 'Canberra', 109, 39, 9, 27, 14, 0],
  ['BE', 'Belgium', 'Europe', 'Western Europe', 'Brussels', 123, 26, 11, 24, 14, 0],
  ['BR', 'Brazil', 'Americas', 'South America', 'Brasília', 110, 31, 8, 27, 22, 0],
  ['CA', 'Canada', 'Americas', 'Northern America', 'Ottawa', 113, 34, 8, 26, 17, 0],
  ['CH', 'Switzerland', 'Europe', 'Western Europe', 'Bern', 120, 29, 11, 25, 13, 0],
  ['CN', 'China', 'Asia', 'Eastern Asia', 'Beijing', 42, 32, 3, 37, 84, 0],
  ['DE', 'Germany', 'Europe', 'Western Europe', 'Berlin', 122, 27, 11, 24, 14, 0],
  ['DK', 'Denmark', 'Europe', 'Northern Europe', 'Copenhagen', 121, 28, 11, 25, 13, 0],
  ['ES', 'Spain', 'Europe', 'Southern Europe', 'Madrid', 122, 28, 11, 25, 12, 0],
  ['FI', 'Finland', 'Europe', 'Northern Europe', 'Helsinki', 122, 27, 11, 25, 13, 0],
  ['FR', 'France', 'Europe', 'Western Europe', 'Paris', 123, 26, 11, 24, 14, 0],
  ['GB', 'United Kingdom', 'Europe', 'Northern Europe', 'London', 115, 32, 9, 24, 18, 0],
  ['GR', 'Greece', 'Europe', 'Southern Europe', 'Athens', 120, 28, 11, 26, 13, 0],
  ['ID', 'Indonesia', 'Asia', 'South-Eastern Asia', 'Jakarta', 43, 28, 6, 42, 79, 0],
  ['IE', 'Ireland', 'Europe', 'Northern Europe', 'Dublin', 118, 32, 10, 25, 13, 0],
  ['IL', 'Israel', 'Asia', 'Western Asia', 'Jerusalem', 105, 28, 7, 31, 15, 12],
  ['IN', 'India', 'Asia', 'Southern Asia', 'New Delhi', 26, 25, 4, 55, 88, 0],
  ['IT', 'Italy', 'Europe', 'Southern Europe', 'Rome', 122, 27, 11, 24, 14, 0],
  ['JP', 'Japan', 'Asia', 'Eastern Asia', 'Tokyo', 114, 37, 11, 21, 15, 0],
  ['KR', 'South Korea', 'Asia', 'Eastern Asia', 'Seoul', 114, 38, 11, 21, 14, 0],
  ['MX', 'Mexico', 'Americas', 'Central America', 'Mexico City', 96, 31, 9, 36, 26, 0],
  ['NG', 'Nigeria', 'Africa', 'Western Africa', 'Abuja', 26, 14, 1, 48, 109, 0],
  ['NL', 'Netherlands', 'Europe', 'Western Europe', 'Amsterdam', 122, 27, 11, 25, 13, 0],
  ['NO', 'Norway', 'Europe', 'Northern Europe', 'Oslo', 118, 31, 11, 25, 13, 0],
  ['NZ', 'New Zealand', 'Oceania', 'Australia and New Zealand', 'Wellington', 113, 36, 9, 26, 14, 0],
  ['PH', 'Philippines', 'Asia', 'South-Eastern Asia', 'Manila', 34, 25, 3, 48, 87, 1],
  ['PL', 'Poland', 'Europe', 'Eastern Europe', 'Warsaw', 120, 28, 11, 26, 13, 0],
  ['PT', 'Portugal', 'Europe', 'Southern Europe', 'Lisbon', 121, 27, 11, 26, 13, 0],
  ['RU', 'Russia', 'Europe', 'Eastern Europe', 'Moscow', 79, 27, 8, 24, 60, 0],
  ['SA', 'Saudi Arabia', 'Asia', 'Western Asia', 'Riyadh', 53, 27, 6, 36, 76, 0],
  ['SE', 'Sweden', 'Europe', 'Northern Europe', 'Stockholm', 122, 27, 11, 25, 13, 0],
  ['SG', 'Singapore', 'Asia', 'South-Eastern Asia', 'Singapore', 129, 26, 8, 22, 13, 0],
  ['TR', 'Turkey', 'Asia', 'Western Asia', 'Ankara', 71, 34, 6, 29, 58, 0],
  ['US', 'United States', 'Americas', 'Northern America', 'Washington, D.C.', 112, 32, 9, 27, 18, 0],
  ['ZA', 'South Africa', 'Africa', 'Southern Africa', 'Pretoria', 60, 29, 5, 35, 69, 0],
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

function classify(raw) {
  const v = raw.trim();
  if (v === '-1') return { status: 'home', days: null };
  if (v === 'visa free') return { status: 'visa-free', days: null };
  if (v === 'visa on arrival') return { status: 'visa-on-arrival', days: null };
  if (v === 'eta') return { status: 'eta', days: null };
  if (v === 'e-visa') return { status: 'e-visa', days: null };
  if (v === 'visa required') return { status: 'visa-required', days: null };
  if (v === 'no admission') return { status: 'no-admission', days: null };
  if (/^\d+$/.test(v)) return { status: 'visa-free', days: Number(v) };
  return { status: 'unknown', days: null };
}

function makeMetadataIndex(metadata) {
  const idx = new Map();
  for (const c of metadata || []) {
    const code = String(c.cca2 ?? '').toUpperCase();
    if (!code) continue;
    idx.set(code, {
      name: c.name?.common ?? c.name?.official ?? c.cca2,
      region: c.region ?? 'Unknown',
      subregion: c.subregion ?? '',
      capital: Array.isArray(c.capital) ? c.capital[0] : c.capital ?? '',
      areaKm2: typeof c.area === 'number' ? c.area : null,
      flag: typeof c.flag === 'string' && c.flag ? c.flag : null,
      demonym: c.demonyms?.eng?.m ?? c.demonyms?.eng?.f ?? null,
      languages: c.languages ? Object.values(c.languages) : [],
      currencies: c.currencies
        ? Object.entries(c.currencies).map(([code, v]) => ({
            code,
            name: v?.name ?? null,
            symbol: v?.symbol ?? null,
          }))
        : [],
      callingCode: c.idd ? formatCallingCode(c.idd) : null,
      latlng: Array.isArray(c.latlng) && c.latlng.length === 2 ? c.latlng : null,
      landlocked: typeof c.landlocked === 'boolean' ? c.landlocked : null,
      borders: Array.isArray(c.borders) ? c.borders : [],
      tld: Array.isArray(c.tld) ? c.tld : [],
      unMember: typeof c.unMember === 'boolean' ? c.unMember : null,
      independent: typeof c.independent === 'boolean' ? c.independent : null,
    });
  }
  return idx;
}

/** Combine mledoze idd ({ root: "+3", suffixes: ["51"] }) into a representative dial code. */
function formatCallingCode(idd) {
  const root = idd?.root ?? '';
  if (!root) return null;
  const suffixes = Array.isArray(idd?.suffixes) ? idd.suffixes : [];
  if (suffixes.length === 1) return `${root}${suffixes[0]}`;
  return root; // multi-suffix plans (e.g. NANP "+1") — show the root
}

/** Index Natural Earth stats (population / GDP / income) already bundled in the repo. */
function makeNaturalEarthIndex() {
  const idx = new Map();
  let geo;
  try {
    geo = JSON.parse(fs.readFileSync(NATURAL_EARTH_PATH, 'utf8'));
  } catch {
    return idx;
  }
  for (const feature of geo?.features ?? []) {
    const p = feature?.properties ?? {};
    const a2 = String(p.ISO_A2 ?? '').toUpperCase();
    const a2eh = String(p.ISO_A2_EH ?? '').toUpperCase();
    const key = a2 && a2 !== '-99' && a2 !== 'NULL' ? a2 : a2eh && a2eh !== '-99' && a2eh !== 'NULL' ? a2eh : null;
    if (!key) continue;
    idx.set(key, {
      population: typeof p.POP_EST === 'number' ? p.POP_EST : null,
      populationYear: typeof p.POP_YEAR === 'number' ? p.POP_YEAR : null,
      gdpUsdM: typeof p.GDP_MD === 'number' ? p.GDP_MD : null,
      gdpYear: typeof p.GDP_YEAR === 'number' ? p.GDP_YEAR : null,
      incomeGroup: p.INCOME_GRP ?? null,
      economy: p.ECONOMY ?? null,
      continent: p.CONTINENT ?? null,
      regionUn: p.REGION_UN ?? null,
    });
  }
  return idx;
}

/** Merge mledoze metadata with Natural Earth statistics into a single profile object. */
function buildProfile(meta, ne) {
  const m = meta ?? {};
  const n = ne ?? {};
  return {
    flag: m.flag ?? null,
    areaKm2: m.areaKm2 ?? null,
    demonym: m.demonym ?? null,
    languages: m.languages ?? [],
    currencies: m.currencies ?? [],
    callingCode: m.callingCode ?? null,
    latlng: m.latlng ?? null,
    landlocked: m.landlocked ?? null,
    borders: m.borders ?? [],
    tld: m.tld ?? [],
    unMember: m.unMember ?? null,
    independent: m.independent ?? null,
    population: n.population ?? null,
    populationYear: n.populationYear ?? null,
    gdpUsdM: n.gdpUsdM ?? null,
    gdpYear: n.gdpYear ?? null,
    incomeGroup: n.incomeGroup ?? null,
    economy: n.economy ?? null,
    continent: n.continent ?? null,
  };
}

function makeSeedIndex() {
  const idx = new Map();
  for (const [code, name, region, subregion, capital] of SEED) {
    idx.set(code, { name, region, subregion, capital });
  }
  return idx;
}

function scoreOf(c) {
  return SCORE_INCLUDES_EVISA
    ? c.visaFree + c.visaOnArrival + c.eta + c.eVisa
    : c.visaFree + c.visaOnArrival + c.eta;
}

function buildFromMatrix(csvText, metaIndex, seedIndex, neIndex) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error('Matrix CSV is empty or missing a header row');
  const header = rows[0].slice(1).map((d) => d.trim().toUpperCase()).filter(Boolean);
  const passports = [];
  const matrix = {};
  let unknownCells = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = (row[0] || '').trim().toUpperCase();
    if (!code) continue;
    const counts = { visaFree: 0, visaOnArrival: 0, eta: 0, eVisa: 0, visaRequired: 0, noAdmission: 0 };
    const cells = {};
    for (let c = 1; c <= header.length; c++) {
      const dest = header[c - 1];
      const cls = classify(row[c] ?? '');
      switch (cls.status) {
        case 'visa-free':
          counts.visaFree++;
          cells[dest] = cls.days ? `F:${cls.days}` : 'F';
          break;
        case 'visa-on-arrival':
          counts.visaOnArrival++;
          cells[dest] = 'A';
          break;
        case 'eta':
          counts.eta++;
          cells[dest] = 'E';
          break;
        case 'e-visa':
          counts.eVisa++;
          cells[dest] = 'V';
          break;
        case 'visa-required':
          counts.visaRequired++;
          cells[dest] = 'R';
          break;
        case 'no-admission':
          counts.noAdmission++;
          cells[dest] = 'N';
          break;
        case 'home':
          cells[dest] = '-';
          break;
        default:
          cells[dest] = '?';
          unknownCells++;
          break;
      }
    }
    const meta = metaIndex.get(code) ?? seedIndex.get(code) ?? { name: code, region: 'Unknown', subregion: '', capital: '' };
    const profile = buildProfile(meta, neIndex.get(code));
    passports.push({
      code,
      name: meta.name,
      region: meta.region,
      subregion: meta.subregion,
      capital: meta.capital,
      profile,
      ...counts,
      mobilityScore: scoreOf(counts),
      coverage: Number((scoreOf(counts) / header.length).toFixed(4)),
    });
    matrix[code] = cells;
  }

  return { passports, matrix, totalDestinations: header.length, unknownCells };
}

function buildFromSeed() {
  const passports = SEED.map(
    ([code, name, region, subregion, capital, visaFree, visaOnArrival, eta, eVisa, visaRequired, noAdmission]) => {
      const counts = { visaFree, visaOnArrival, eta, eVisa, visaRequired, noAdmission };
      return {
        code,
        name,
        region,
        subregion,
        capital,
        profile: null,
        ...counts,
        mobilityScore: scoreOf(counts),
        coverage: null,
      };
    },
  );
  return { passports };
}

function rank(passports) {
  const sorted = [...passports].sort(
    (a, b) => b.mobilityScore - a.mobilityScore || b.visaFree - a.visaFree || a.code.localeCompare(b.code),
  );
  const total = sorted.length;
  let rank = 1;
  let denseRank = 1;
  return sorted.map((p, idx) => {
    if (idx > 0 && sorted[idx - 1].mobilityScore !== p.mobilityScore) {
      rank = idx + 1;
      denseRank += 1;
    }
    return {
      ...p,
      rank,
      denseRank,
      percentile: Number((((total - rank + 1) / total) * 100).toFixed(1)),
    };
  });
}

function makeMeta(source, totalCountries) {
  const sources = [];
  if (source) sources.push({ name: source.name, url: source.url ?? null, updatedAt: source.updatedAt ?? null });
  sources.push({ name: 'countries (mledoze)', url: METADATA_URL, updatedAt: null });
  sources.push({ name: 'Natural Earth (world countries)', url: 'https://www.naturalearthdata.com/', updatedAt: null });
  return {
    generatedAt: new Date().toISOString(),
    sources,
    license:
      'MIT (passport matrix via imorte/passport-index-data); mledoze/countries (MIT, some ODbL-derived fields); Natural Earth (public domain)',
    disclaimer: 'Informational only — not legal, immigration, or travel advice. Verify with official sources.',
    scoreDefinition: SCORE_INCLUDES_EVISA
      ? 'mobilityScore = visaFree + visaOnArrival + eta + eVisa'
      : 'mobilityScore = visaFree + visaOnArrival + eta',
    totalCountries,
  };
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const opts = parseArgs();
  const startedAt = Date.now();
  log(opts, '\nCitizenship Hub — passport data ETL');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(opts.outDir, { recursive: true });

  let metadata = [];
  try {
    metadata = JSON.parse(await fetchText(METADATA_URL));
    log(opts, `✓ Country metadata loaded (${metadata.length} records)`);
  } catch (err) {
    log(opts, `⚠ Could not load country metadata (${err.message}); using built-in names only.`);
  }
  const metaIndex = makeMetadataIndex(metadata);
  const seedIndex = makeSeedIndex();
  const neIndex = makeNaturalEarthIndex();

  let passports = null;
  let matrix = null;
  let source = null;
  let totalDestinations = 0;

  if (!opts.offline) {
    for (const src of SOURCES) {
      const cachePath = path.join(CACHE_DIR, `${slugify(src.name)}.csv`);
      let csv = null;
      try {
        const cacheExists = fs.existsSync(cachePath);
        const cacheFresh = cacheExists && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;
        if (!opts.fresh && cacheFresh) {
          csv = fs.readFileSync(cachePath, 'utf8');
          log(opts, `✓ Loaded cached ${src.name}`);
        } else {
          csv = await fetchText(src.url);
          fs.writeFileSync(cachePath, csv);
          log(opts, `✓ Fetched ${src.name} (${(csv.length / 1024).toFixed(0)} KB)`);
        }
        const built = buildFromMatrix(csv, metaIndex, seedIndex, neIndex);
        passports = built.passports;
        matrix = built.matrix;
        totalDestinations = built.totalDestinations;
        source = src;
        if (built.unknownCells > 0) log(opts, `⚠ ${built.unknownCells} unrecognised cells in ${src.name}`);
        break;
      } catch (err) {
        log(opts, `⚠ ${src.name} failed: ${err.message}`);
      }
    }
  }

  if (!passports || passports.length === 0) {
    log(opts, `⚠ No live data available — falling back to bundled seed (${SEED.length} countries).`);
    passports = buildFromSeed().passports;
    source = { name: 'bundled seed (offline fallback)', url: null, updatedAt: null };
  }

  const rankings = rank(passports);
  const meta = makeMeta(source, passports.length);

  writeJson(path.join(opts.outDir, 'passports.json'), { meta, passports });
  writeJson(path.join(opts.outDir, 'rankings.json'), { meta, rankings });
  log(opts, `✓ Wrote passports.json (${passports.length} records)`);
  log(opts, `✓ Wrote rankings.json (${rankings.length} records)`);

  if (matrix) {
    writeJson(path.join(opts.outDir, 'visa-matrix.json'), {
      meta: { ...meta, encoding: ENCODING, totalDestinations },
      matrix,
    });
    log(opts, `✓ Wrote visa-matrix.json (${Object.keys(matrix).length} passports × ${totalDestinations} destinations)`);
  } else {
    log(opts, '⚠ visa-matrix.json skipped (no live matrix available in this run).');
  }

  log(opts, '\nTop 10 passports:');
  for (const r of rankings.slice(0, 10)) {
    log(
      opts,
      `  #${String(r.rank).padStart(3)}  ${r.code.padEnd(3)} ${r.name.padEnd(24)} ${String(r.mobilityScore).padStart(3)}  (vf ${r.visaFree} · voa ${r.visaOnArrival} · eta ${r.eta} · evisa ${r.eVisa})`,
    );
  }

  log(opts, `\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${path.relative(ROOT, opts.outDir)}/`);
}

main().catch((err) => {
  console.error('\nETL failed:', err);
  process.exit(1);
});
