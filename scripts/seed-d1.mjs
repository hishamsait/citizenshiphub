#!/usr/bin/env node
/**
 * Generate an idempotent SQL seed file for Cloudflare D1 from the static
 * datasets in `src/data`.
 *
 *   npm run db:seed:generate   -> write scripts/.generated/seed.sql
 *   npm run db:seed            -> generate + apply to the remote D1 database
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const passports = readJson('src/data/passports.json').passports;
const rankings = readJson('src/data/rankings.json').rankings;
const matrix = readJson('src/data/visa-matrix.json').matrix;
const laws = readJson('src/data/citizenship-laws.json').countries;

const lawByCode = new Map(laws.map((c) => [String(c.iso2).toUpperCase(), c]));

/** Escape a value as a SQL literal (or NULL). */
function lit(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
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

// countries
const countryRows = passports.map((p) => {
  const law = lawByCode.get(p.code);
  return `(${lit(p.code)}, ${lit(p.name)}, ${lit(p.capital ?? null)}, ${lit(p.region)}, ${
    law?.citizenshipByDescent ? 1 : 0
  }, ${lit(law?.naturalizationYears ?? null)}, ${lit(law?.officialFeeEUR ?? null)})`;
});
statements.push(
  `INSERT OR REPLACE INTO countries (iso2, name, capital, region, citizenship_by_descent, naturalization_years, official_fee_eur) VALUES\n${countryRows.join(',\n')};`,
);

// passport_rankings
const rankingRows = rankings.map(
  (r) => `(${lit(r.code)}, ${r.rank}, ${r.mobilityScore}, ${r.visaFree}, ${r.visaOnArrival}, ${r.eta})`,
);
statements.push(
  `INSERT OR REPLACE INTO passport_rankings (passport_iso, rank_position, mobility_score, visa_free_count, voa_count, eta_count) VALUES\n${rankingRows.join(',\n')};`,
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

const outDir = resolve(root, 'scripts', '.generated');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'seed.sql');
writeFileSync(outFile, `${statements.join('\n\n')}\n`, 'utf8');

console.log(`Generated ${outFile}`);
console.log(`  countries:         ${countryRows.length}`);
console.log(`  passport_rankings: ${rankingRows.length}`);
console.log(`  visa_rules:        ${visaRows.length}`);
console.log('Apply to the remote D1 database with: npm run db:seed');
