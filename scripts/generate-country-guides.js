#!/usr/bin/env node
/**
 * Generate an editorial citizenship guide (.md) for every country from the
 * curated law dataset + passport/ranking data. Writes:
 *   src/data/citizenship-laws.json   - normalised, typed law dataset
 *   src/content/countries/<slug>.md  - one editorial guide per country
 *
 * Hand-written/editorial guides (EDITORIAL_SKIP) are left untouched.
 * Run: node scripts/generate-country-guides.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAWS as EUROPE } from './laws-europe.js';
import { LAWS as ASIA } from './laws-asia.js';
import { LAWS as AFRICA } from './laws-africa.js';
import { LAWS as AMERICAS } from './laws-americas.js';
import { LAWS as OCEANIA } from './laws-oceania.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const COUNTRIES_DIR = path.join(ROOT, 'src', 'content', 'countries');

const LAWS = { ...EUROPE, ...ASIA, ...AFRICA, ...AMERICAS, ...OCEANIA };

// Guides written by hand (already editorial) - never overwritten.
const EDITORIAL_SKIP = new Set(['ireland', 'germany', 'japan', 'united-arab-emirates', 'spain']);

const str = (s) => JSON.stringify(s ?? '');
const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function main() {
  const passports = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'passports.json'), 'utf8')).passports;
  const rankings = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'rankings.json'), 'utf8')).rankings;
  const byCode = new Map(passports.map((p) => [p.code, p]));
  const rankByCode = new Map(rankings.map((r) => [r.code, r.rank]));

  const countries = [];
  const missing = [];
  for (const p of passports) {
    const law = LAWS[p.code];
    if (!law) {
      missing.push(p.code);
      continue;
    }
    countries.push({
      iso2: p.code,
      name: p.name,
      citizenshipByDescent: law.d,
      naturalizationYears: law.y,
      dualCitizenshipAllowed: law.c,
      officialFeeEUR: law.f ?? null,
      ...(law.n ? { note: law.n } : {}),
    });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    verifiedAt: '2026-09-21',
    source: 'Compiled from Wikipedia nationality-law pages (approximate; verify against official sources before reliance).',
    disclaimer: 'Informational only; not legal or immigration advice.',
    totalCountries: countries.length,
  };

  fs.writeFileSync(path.join(SRC_DATA, 'citizenship-laws.json'), JSON.stringify({ meta, countries }, null, 2) + '\n');
  console.log(`✓ Wrote citizenship-laws.json (${countries.length} countries)`);
  if (missing.length) console.log(`⚠ Missing law data for: ${missing.join(', ')}`);

  let written = 0;
  let skipped = 0;
  for (const c of countries) {
    const p = byCode.get(c.iso2);
    const slug = slugify(p?.name ?? c.name);
    const file = path.join(COUNTRIES_DIR, `${slug}.md`);
    if (EDITORIAL_SKIP.has(slug)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, renderGuide(c, p, rankByCode.get(c.iso2)));
    written++;
  }
  console.log(`✓ Generated ${written} editorial guides (${skipped} hand-written skipped)`);
}

function buildSummary(c) {
  const parts = [];
  parts.push(
    c.citizenshipByDescent
      ? 'Citizenship by descent is available'
      : 'Citizenship by descent is generally not available',
  );
  parts.push(
    c.naturalizationYears === null
      ? 'naturalisation is restricted'
      : `naturalisation requires ${c.naturalizationYears} years`,
  );
  parts.push(c.dualCitizenshipAllowed ? 'dual citizenship is permitted' : 'dual citizenship is generally not permitted');
  return parts.join('; ') + '.';
}

function renderGuide(c, p, rank) {
  const mobility = p
    ? `The ${c.name} passport offers visa-free, visa-on-arrival, ETA, or e-visa access to **${p.mobilityScore}** destinations, ranking it **#${rank}** globally.`
    : '';

  const descent = c.citizenshipByDescent
    ? `${c.name} applies jus sanguinis — citizenship can be acquired by descent from a citizen parent, and in some cases from grandparents or more distant ancestors.`
    : `${c.name} does not generally offer citizenship by descent.`;

  const naturalisation =
    c.naturalizationYears === null
      ? `Naturalisation in ${c.name} is restricted or not standardised — there is no straightforward residency-based route for most people.`
      : `Naturalisation typically requires **${c.naturalizationYears} years** of residence, usually alongside language and integration requirements.`;

  const dual = c.dualCitizenshipAllowed
    ? `${c.name} generally permits dual citizenship.`
    : `${c.name} generally does not permit dual citizenship — naturalising usually requires renouncing your existing nationality.`;

  const fees =
    c.officialFeeEUR === null
      ? `There is no standard published application fee — costs vary, so check with official sources.`
      : c.officialFeeEUR === 0
        ? `There is no application fee.`
        : `The application fee is around **€${c.officialFeeEUR}** (approximate).`;

  const body = [`## Why ${c.name}?`, '', mobility];

  if (c.note) {
    body.push('', `> ${c.note}`);
  }

  body.push(
    '',
    '## Citizenship by descent',
    '',
    descent,
    '',
    '## Naturalisation',
    '',
    naturalisation,
    '',
    '## Dual citizenship',
    '',
    dual,
    '',
    '## Fees & timeline',
    '',
    fees,
  );

  body.push(
    '',
    '---',
    '_Compiled from the Citizenship Hub law dataset (approximate). Verify with official government sources before relying on this information._',
  );

  return `---
name: ${str(c.name)}
iso2: ${str(c.iso2)}
capital: ${str(p?.capital ?? '')}
region: ${str(p?.region ?? '')}
citizenshipByDescent: ${c.citizenshipByDescent}
naturalizationYears: ${c.naturalizationYears === null ? 'null' : c.naturalizationYears}
dualCitizenshipAllowed: ${c.dualCitizenshipAllowed}
officialFeeEUR: ${c.officialFeeEUR === null ? 'null' : c.officialFeeEUR}
summary: ${str(buildSummary(c))}
---

${body.join('\n')}
`;
}

main();
