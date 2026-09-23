#!/usr/bin/env node
/**
 * Generate an idempotent SQL seed file for Cloudflare D1 from the static
 * datasets in `src/data`.
 *
 *   npm run db:seed:generate   -> write scripts/.generated/seed.sql
 *   npm run db:seed            -> generate + apply to the remote D1 database
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const passports = readJson('src/data/passports.json').passports;
const rankings = readJson('src/data/rankings.json').rankings;
const matrix = readJson('src/data/visa-matrix.json').matrix;
const laws = readJson('src/data/citizenship-laws.json').countries;
const economics = readJson('src/data/country-profiles.json').countries;
const freedom = readJson('src/data/country-freedom.json').countries;
const tax = readJson('src/data/country-tax.json').countries;
const documents = readJson('src/data/citizenship-documents.json');

const lawByCode = new Map(laws.map((c) => [String(c.iso2).toUpperCase(), c]));
const sources = readJson('src/data/sources.json');
const countryNews = readJson('src/data/country-news.json');
const countrySources = readJson('src/data/country-sources.json');

/** URL-safe slug (mirrors `slugify` in src/lib/utils.ts). */
function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Parse a flat YAML frontmatter block + Markdown body from a guide file. */
function parseMarkdown(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { frontmatter: {}, body: raw.trim() };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null' || value === '~') value = null;
    else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    else value = value.replace(/^['"]|['"]$/g, '');
    frontmatter[key] = value;
  }
  return { frontmatter, body: match[2].trim() };
}

/** Escape a value as a SQL literal (or NULL). */
function lit(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Serialise an array/object as a JSON text literal (or NULL when empty/absent). */
function jsonLit(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value) && value.length === 0) return 'NULL';
  return lit(JSON.stringify(value));
}

/** Serialise a boolean as a 0/1 literal (or NULL when absent). */
function boolLit(value) {
  if (value === null || value === undefined) return 'NULL';
  return value ? '1' : '0';
}

/** Map a compact visa-matrix token to a requirement + allowed stay. */
function requirementFor(token) {
  if (token === 'F' || token.startsWith('F:')) {
    return {
      requirement: 'Visa Free',
      days: token.startsWith('F:') ? Number(token.slice(2)) : null,
    };
  }
  const map = {
    A: 'VOA',
    E: 'eTA',
    V: 'eVisa',
    R: 'Visa Required',
    N: 'No Admission',
    '-': 'Home Country',
    '?': 'Unknown',
  };
  return { requirement: map[token] ?? 'Unknown', days: null };
}

const statements = [];

// countries (incl. slug, subregion, dual-citizenship, coverage)
const countryRows = passports.map((p) => {
  const law = lawByCode.get(p.code);
  return `(${lit(p.code)}, ${lit(p.name)}, ${lit(p.capital ?? null)}, ${lit(p.region)}, ${
    law?.citizenshipByDescent ? 1 : 0
  }, ${lit(law?.naturalizationYears ?? null)}, ${lit(law?.officialFeeEUR ?? null)}, ${lit(slugify(p.name))}, ${lit(
    p.subregion ?? null,
  )}, ${law?.dualCitizenshipAllowed ? 1 : 0}, ${lit(p.coverage ?? null)})`;
});
statements.push(
  `INSERT OR REPLACE INTO countries (iso2, name, capital, region, citizenship_by_descent, naturalization_years, official_fee_eur, slug, subregion, dual_citizenship_allowed, coverage) VALUES\n${countryRows.join(',\n')};`,
);

// passport_rankings (incl. remaining counts + dense rank / percentile)
const rankingRows = rankings.map(
  (r) =>
    `(${lit(r.code)}, ${r.rank}, ${r.mobilityScore}, ${r.visaFree}, ${r.visaOnArrival}, ${r.eta}, ${lit(r.eVisa)}, ${lit(
      r.visaRequired,
    )}, ${lit(r.noAdmission)}, ${lit(r.denseRank)}, ${lit(r.percentile)})`,
);
statements.push(
  `INSERT OR REPLACE INTO passport_rankings (passport_iso, rank_position, mobility_score, visa_free_count, voa_count, eta_count, evisa_count, visa_required_count, no_admission_count, dense_rank, percentile) VALUES\n${rankingRows.join(',\n')};`,
);

// visa_rules
statements.push('DELETE FROM visa_rules;');
const visaRows = [];
for (const [passportIso, destinations] of Object.entries(matrix)) {
  for (const [destIso, token] of Object.entries(destinations)) {
    const { requirement, days } = requirementFor(token);
    visaRows.push(`(${lit(passportIso)}, ${lit(destIso)}, ${lit(requirement)}, ${lit(days)})`);
  }
}
for (let i = 0; i < visaRows.length; i += 200) {
  const chunk = visaRows.slice(i, i + 200);
  statements.push(
    `INSERT INTO visa_rules (passport_iso, destination_iso, requirement, allowed_stay_days) VALUES\n${chunk.join(',\n')};`,
  );
}

// country_profiles (Phase 1 enrichment)
const profileRows = passports
  .filter((p) => p.profile)
  .map((p) => {
    const pr = p.profile;
    return `(${lit(p.code)}, ${lit(pr.flag)}, ${lit(pr.areaKm2)}, ${lit(pr.demonym)}, ${jsonLit(pr.languages)}, ${jsonLit(pr.currencies)}, ${lit(pr.callingCode)}, ${jsonLit(pr.latlng)}, ${boolLit(pr.landlocked)}, ${jsonLit(pr.borders)}, ${jsonLit(pr.tld)}, ${boolLit(pr.unMember)}, ${boolLit(pr.independent)}, ${lit(pr.population)}, ${lit(pr.populationYear)}, ${lit(pr.gdpUsdM)}, ${lit(pr.gdpYear)}, ${lit(pr.incomeGroup)}, ${lit(pr.economy)}, ${lit(pr.continent)})`;
  });
statements.push(
  `INSERT OR REPLACE INTO country_profiles (iso2, flag, area_km2, demonym, languages, currencies, calling_code, latlng, landlocked, borders, tld, un_member, independent, population, population_year, gdp_usd_m, gdp_year, income_group, economy, continent) VALUES\n${profileRows.join(',\n')};`,
);

// country_economics (Phase 2)
const economicsRows = economics.map(
  (e) => `(${lit(e.iso2)}, ${lit(e.iso3)}, ${lit(e.gdpPerCapitaUsd)}, ${lit(e.gdpPerCapitaYear)}, ${lit(e.inflationPct)}, ${lit(e.inflationYear)}, ${lit(e.lifeExpectancy)}, ${lit(e.lifeExpectancyYear)}, ${lit(e.gdpGrowthPct)}, ${lit(e.gdpGrowthYear)}, ${lit(e.hdi)}, ${lit(e.hdiYear)}, ${lit(e.hdiRank)})`,
);
statements.push(
  `INSERT OR REPLACE INTO country_economics (iso2, iso3, gdp_per_capita_usd, gdp_per_capita_year, inflation_pct, inflation_year, life_expectancy, life_expectancy_year, gdp_growth_pct, gdp_growth_year, hdi, hdi_year, hdi_rank) VALUES\n${economicsRows.join(',\n')};`,
);

// country_freedom (Phase 3)
const metric3 = (x) => (x ? `${lit(x.score)}, ${lit(x.rank)}, ${lit(x.year)}` : 'NULL, NULL, NULL');
const freedomRows = freedom.map((c) => {
  const fiwStatus = c.fiw ? lit(c.fiw.note) : 'NULL';
  return `(${lit(c.iso2)}, ${metric3(c.cpi)}, ${metric3(c.fiw)}, ${fiwStatus}, ${metric3(c.humanRights)}, ${metric3(c.democracy)}, ${metric3(c.happiness)})`;
});
statements.push(
  `INSERT OR REPLACE INTO country_freedom (iso2, cpi_score, cpi_rank, cpi_year, fiw_score, fiw_rank, fiw_year, fiw_status, human_rights_score, human_rights_rank, human_rights_year, democracy_score, democracy_rank, democracy_year, happiness_score, happiness_rank, happiness_year) VALUES\n${freedomRows.join(',\n')};`,
);

// country_tax (Phase 4b)
const taxRows = tax.map(
  (t) => `(${lit(t.iso2)}, ${lit(t.personalIncomeTax)}, ${lit(t.corporateTax)}, ${lit(t.vat)}, ${boolLit(t.territorial)}, ${boolLit(t.wealth)}, ${boolLit(t.nonDom)})`,
);
statements.push(
  `INSERT OR REPLACE INTO country_tax (iso2, personal_income_tax, corporate_tax, vat, territorial, wealth, non_dom) VALUES\n${taxRows.join(',\n')};`,
);

// country_citizenship (Phase 4a + Phase 5)
const citizenshipRows = laws.map(
  (c) =>
    `(${lit(c.iso2)}, ${c.cbi ? 1 : 0}, ${c.goldenVisa ? 1 : 0}, ${lit(c.marriageYears)}, ${boolLit(c.languageRequired)}, ${lit(c.maxGenerations)}, ${c.birthright ? 1 : 0}, ${lit(c.cbiMinInvestmentEUR)}, ${lit(c.goldenVisaMinInvestmentEUR)}, ${c.digitalNomadVisa ? 1 : 0}, ${lit(c.languageLevel)})`,
);
statements.push(
  `INSERT OR REPLACE INTO country_citizenship (iso2, cbi, golden_visa, marriage_years, language_required, max_generations, birthright, cbi_min_investment_eur, golden_visa_min_investment_eur, digital_nomad_visa, language_level) VALUES\n${citizenshipRows.join(',\n')};`,
);

// citizenship_documents global route templates + per-country overrides
const docRows = [];
for (const [route, c] of Object.entries(documents.routes ?? {})) {
  docRows.push(`('*', ${lit(route)}, ${lit(c.title ?? null)}, ${lit(c.description ?? null)}, ${lit(c.note ?? null)}, ${jsonLit(c.documents ?? [])})`);
}
for (const [iso2, routes] of Object.entries(documents.countries ?? {})) {
  for (const [route, c] of Object.entries(routes ?? {})) {
    docRows.push(`(${lit(iso2)}, ${lit(route)}, ${lit(c.title ?? null)}, ${lit(c.description ?? null)}, ${lit(c.note ?? null)}, ${jsonLit(c.documents ?? [])})`);
  }
}
statements.push('DELETE FROM citizenship_documents;');
statements.push(
  `INSERT INTO citizenship_documents (iso2, route, title, description, note, documents) VALUES\n${docRows.join(',\n')};`,
);

// country_guides editorial guide bodies rendered to HTML at ETL time
const guidesDir = resolve(root, 'src', 'content', 'countries');
const guideFiles = readdirSync(guidesDir).filter((f) => f.endsWith('.md'));
const guideRows = [];
for (const file of guideFiles) {
  const slug = file.replace(/\.md$/, '');
  const raw = readFileSync(join(guidesDir, file), 'utf8');
  const { frontmatter, body } = parseMarkdown(raw);
  const iso2 = String(frontmatter.iso2 ?? '').toUpperCase();
  if (!iso2) continue;
  const bodyHtml = await marked.parse(body);
  guideRows.push(`(${lit(iso2)}, ${lit(slug)}, ${lit(frontmatter.summary ?? null)}, ${lit(body)}, ${lit(bodyHtml)})`);
}
for (let i = 0; i < guideRows.length; i += 20) {
  const chunk = guideRows.slice(i, i + 20);
  statements.push(
    `INSERT OR REPLACE INTO country_guides (iso2, slug, summary, body_md, body_html) VALUES\n${chunk.join(',\n')};`,
  );
}

// dataset_meta datasource metadata (generatedAt, sources, license, encoding, …)
const metaRows = [];
const pushMeta = (id, meta, extra = {}) =>
  metaRows.push(
    `(${lit(id)}, ${lit(meta.generatedAt ?? null)}, ${lit(extra.verifiedAt ?? null)}, ${lit(extra.source ?? null)}, ${lit(
      meta.license ?? null,
    )}, ${lit(meta.disclaimer ?? null)}, ${lit(meta.scoreDefinition ?? null)}, ${lit(meta.totalCountries ?? null)}, ${lit(
      extra.totalDestinations ?? null,
    )}, ${jsonLit(extra.encoding ?? null)}, ${jsonLit(meta.sources ?? null)})`,
  );
pushMeta('passports', readJson('src/data/passports.json').meta);
pushMeta('rankings', readJson('src/data/rankings.json').meta);
const matrixMeta = readJson('src/data/visa-matrix.json').meta;
pushMeta('visa-matrix', matrixMeta, { totalDestinations: matrixMeta.totalDestinations, encoding: matrixMeta.encoding });
const lawsMeta = readJson('src/data/citizenship-laws.json').meta;
pushMeta('citizenship-laws', lawsMeta, { verifiedAt: lawsMeta.verifiedAt, source: lawsMeta.source });
pushMeta('country-profiles', readJson('src/data/country-profiles.json').meta);
pushMeta('country-freedom', readJson('src/data/country-freedom.json').meta);
pushMeta('country-tax', readJson('src/data/country-tax.json').meta);
statements.push(
  `INSERT OR REPLACE INTO dataset_meta (dataset_id, generated_at, verified_at, source, license, disclaimer, score_definition, total_countries, total_destinations, encoding, sources) VALUES\n${metaRows.join(',\n')};`,
);

// data_sources attribution registry
const sourceRows = sources.map(
  (s) =>
    `(${lit(s.id)}, ${lit(s.name)}, ${lit(s.url ?? null)}, ${lit(s.provides ?? null)}, ${lit(s.license?.name ?? null)}, ${lit(
      s.license?.url ?? null,
    )}, ${lit(s.license?.restrictions ?? null)}, ${lit(s.attribution ?? null)}, ${lit(s.note ?? null)})`,
);
statements.push(
  `INSERT OR REPLACE INTO data_sources (id, name, url, provides, license_name, license_url, license_restrictions, attribution, note) VALUES\n${sourceRows.join(',\n')};`,
);

// country_news (RSS-fetched immigration & citizenship headlines)
const newsRows = [];
for (const c of countryNews.countries ?? []) {
  for (const item of c.items ?? []) {
    newsRows.push(
      `(${lit(item.id)}, ${lit(c.iso2)}, ${lit(item.title)}, ${lit(item.url ?? null)}, ${lit(item.sourceName ?? null)}, ${lit(item.publishedAt ?? null)}, ${lit(item.snippet ?? null)})`,
    );
  }
}
if (newsRows.length) {
  statements.push(
    `INSERT OR REPLACE INTO country_news (id, iso2, title, url, source_name, published_at, snippet) VALUES\n${newsRows.join(',\n')};`,
  );
}

// country_immigration_sources (curated reference links)
const countrySourceRows = [];
for (const c of countrySources.countries ?? []) {
  for (const s of c.sources ?? []) {
    countrySourceRows.push(
      `(${lit(s.id)}, ${lit(c.iso2)}, ${lit(s.name)}, ${lit(s.url ?? null)}, ${lit(s.category ?? null)}, ${lit(s.note ?? null)})`,
    );
  }
}
if (countrySourceRows.length) {
  statements.push(
    `INSERT OR REPLACE INTO country_immigration_sources (id, iso2, name, url, category, note) VALUES\n${countrySourceRows.join(',\n')};`,
  );
}

const outDir = resolve(root, 'scripts', '.generated');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'seed.sql');
writeFileSync(outFile, `${statements.join('\n\n')}\n`, 'utf8');

console.log(`Generated ${outFile}`);
console.log(`  countries:         ${countryRows.length}`);
console.log(`  passport_rankings: ${rankingRows.length}`);
console.log(`  visa_rules:        ${visaRows.length}`);
console.log(`  country_profiles:  ${profileRows.length}`);
console.log(`  country_economics: ${economicsRows.length}`);
console.log(`  country_freedom:   ${freedomRows.length}`);
console.log(`  country_tax:       ${taxRows.length}`);
console.log(`  country_citizenship: ${citizenshipRows.length}`);
console.log(`  citizenship_documents: ${docRows.length}`);
console.log(`  country_guides:    ${guideRows.length}`);
console.log(`  dataset_meta:      ${metaRows.length}`);
console.log(`  data_sources:      ${sourceRows.length}`);
console.log(`  country_news:      ${newsRows.length}`);
console.log(`  country_immigration_sources: ${countrySourceRows.length}`);
console.log('Apply to the remote D1 database with: npm run db:seed');
