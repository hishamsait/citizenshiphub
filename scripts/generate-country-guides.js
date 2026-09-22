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
import { TAX } from './laws-tax.js';
import { RESIDENCY } from './laws-residency.js';

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
  const profileByCode = new Map(passports.map((p) => [p.code, p.profile]));

  const countries = [];
  const missing = [];
  for (const p of passports) {
    const law = LAWS[p.code];
    if (!law) {
      missing.push(p.code);
      continue;
    }
    const res = RESIDENCY[p.code];
    countries.push({
      iso2: p.code,
      name: p.name,
      citizenshipByDescent: law.d,
      naturalizationYears: law.y,
      dualCitizenshipAllowed: law.c,
      officialFeeEUR: law.f ?? null,
      ...(law.n ? { note: law.n } : {}),
      cbi: law.cbi === true,
      goldenVisa: law.goldenVisa === true,
      marriageYears: law.marriageYears ?? null,
      languageRequired: law.languageRequired ?? null,
      maxGenerations: law.maxGenerations !== undefined ? law.maxGenerations : 1,
      birthright: res?.birthright === true,
      cbiMinInvestmentEUR: res?.cbiMinInvestmentEUR ?? null,
      goldenVisaMinInvestmentEUR: res?.goldenVisaMinInvestmentEUR ?? null,
      digitalNomadVisa: res?.digitalNomadVisa === true,
      languageLevel: res?.languageLevel ?? null,
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

  // Tax dataset (Phase 4b)
  const taxMeta = {
    generatedAt: new Date().toISOString(),
    sources: [
      { name: 'Tax Foundation', url: 'https://taxfoundation.org/', updatedAt: null },
      { name: 'OECD Tax Database', url: 'https://www.oecd.org/tax/tax-policy/tax-database/', updatedAt: null },
      { name: 'KPMG Tax Rates Online', url: 'https://kpmg.com/xx/en/services/tax/tax-tools-and-resources/tax-rates-online.html', updatedAt: null },
    ],
    license: 'Compiled from public sources (approximate); not tax advice.',
    disclaimer: 'Informational only — tax rates change frequently; verify with a qualified tax adviser.',
    totalCountries: passports.length,
  };
  const taxCountries = passports.map((p) => {
    const t = TAX[p.code];
    return {
      iso2: p.code,
      personalIncomeTax: t?.pit ?? null,
      corporateTax: t?.cit ?? null,
      vat: t?.vat ?? null,
      territorial: t?.territorial ?? null,
      wealth: t?.wealth ?? null,
      nonDom: t?.nonDom ?? null,
    };
  });
  fs.writeFileSync(path.join(SRC_DATA, 'country-tax.json'), JSON.stringify({ meta: taxMeta, countries: taxCountries }, null, 2) + '\n');
  console.log(`✓ Wrote country-tax.json (${taxCountries.length} countries)`);

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
    const profile = profileByCode.get(c.iso2);
    fs.writeFileSync(file, renderGuide(c, p, rankByCode.get(c.iso2), profile, TAX[c.iso2]));
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
  if (c.cbi) parts.push('citizenship by investment is available');
  if (c.goldenVisa) parts.push('a golden visa (residency by investment) is available');
  return parts.join('; ') + '.';
}

function renderGuide(c, p, rank, profile, tax) {
  const mobility = p
    ? `The ${c.name} passport offers visa-free, visa-on-arrival, ETA, or e-visa access to **${p.mobilityScore}** destinations, ranking it **#${rank}** globally.`
    : '';

  const descent = c.citizenshipByDescent
    ? c.maxGenerations === null
      ? `${c.name} applies jus sanguinis with no generational limit — citizenship can be passed down indefinitely through ancestry.`
      : c.maxGenerations === 2
        ? `${c.name} applies jus sanguinis — citizenship can be acquired by descent from a parent or grandparent.`
        : c.maxGenerations >= 3
          ? `${c.name} applies jus sanguinis — citizenship can be acquired by descent across multiple generations.`
          : `${c.name} applies jus sanguinis — citizenship can be acquired by descent from a citizen parent.`
    : `${c.name} does not generally offer citizenship by descent.`;

  const naturalisation =
    c.naturalizationYears === null
      ? `Naturalisation in ${c.name} is restricted or not standardised — there is no straightforward residency-based route for most people.`
      : `Naturalisation typically requires **${c.naturalizationYears} years** of residence${
          c.marriageYears != null ? ` (reduced to **${c.marriageYears} years** for spouses)` : ''
        }.`;

  const language =
    c.languageLevel
      ? `${c.name} typically requires **${c.languageLevel}** language proficiency for naturalisation.`
      : c.languageRequired === false
        ? `${c.name} does not require a formal language test for naturalisation.`
        : c.languageRequired === true
          ? `A language or integration requirement usually applies to naturalisation.`
          : '';

  const dual = c.dualCitizenshipAllowed
    ? `${c.name} generally permits dual citizenship.`
    : `${c.name} generally does not permit dual citizenship — naturalising usually requires renouncing your existing nationality.`;

  const fees =
    c.officialFeeEUR === null
      ? `There is no standard published application fee — costs vary, so check with official sources.`
      : c.officialFeeEUR === 0
        ? `There is no application fee.`
        : `The application fee is around **€${c.officialFeeEUR}** (approximate).`;

  const investment = [];
  if (c.cbi) {
    investment.push(
      `${c.name} offers **citizenship by investment**${
        c.cbiMinInvestmentEUR != null
          ? ` (from ≈ **€${c.cbiMinInvestmentEUR.toLocaleString('en-US')}** in qualifying investment)`
          : ''
      } — a direct route to citizenship through investment.`,
    );
  }
  if (c.goldenVisa) {
    investment.push(
      `${c.name} offers a **golden visa** (residency by investment)${
        c.goldenVisaMinInvestmentEUR != null
          ? ` (from ≈ **€${c.goldenVisaMinInvestmentEUR.toLocaleString('en-US')}** in qualifying investment)`
          : ''
      } — a residence permit leading to naturalisation.`,
    );
  }

  const taxPoints = [];
  if (tax) {
    if (tax.pit != null) taxPoints.push(`Top personal income tax rate: **${tax.pit}%**`);
    if (tax.cit != null) taxPoints.push(`Corporate income tax rate: **${tax.cit}%**`);
    if (tax.vat != null) taxPoints.push(`Standard VAT/GST rate: **${tax.vat}%**`);
    if (tax.territorial === true) taxPoints.push('Taxation basis: **territorial** (residents are generally taxed only on domestic-source income)');
    else if (tax.territorial === false) taxPoints.push('Taxation basis: **worldwide** (residents are generally taxed on worldwide income)');
    if (tax.wealth === true) taxPoints.push('A recurring **wealth tax** applies');
    if (tax.nonDom === true) taxPoints.push('A **non-domiciled (remittance-basis)** tax regime is available to certain residents');
  }

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
  );

  if (language) {
    body.push('', language);
  }

  body.push('', '## Dual citizenship', '', dual);

  if (investment.length > 0) {
    body.push('', '## Investment routes', '', investment.join('\n\n'));
  }

  const otherRoutes = [];
  if (c.birthright) otherRoutes.push(`Citizenship is granted by **birth in the territory** (jus soli).`);
  if (c.digitalNomadVisa) otherRoutes.push(`A **digital-nomad / remote-work visa** is available.`);
  if (otherRoutes.length > 0) {
    body.push('', '## Other routes', '', otherRoutes.join('\n\n'));
  }

  body.push('', '## Fees & timeline', '', fees);

  if (taxPoints.length > 0) {
    body.push('', '## Tax considerations', '', taxPoints.map((t) => `- ${t}`).join('\n'));
  }

  body.push(
    '',
    '---',
    '_Compiled from the Citizenship Hub law dataset (approximate). Verify with official government sources before relying on this information._',
  );

  let frontmatter = `---
name: ${str(c.name)}
iso2: ${str(c.iso2)}
capital: ${str(p?.capital ?? '')}
region: ${str(p?.region ?? '')}
citizenshipByDescent: ${c.citizenshipByDescent}
naturalizationYears: ${c.naturalizationYears === null ? 'null' : c.naturalizationYears}
dualCitizenshipAllowed: ${c.dualCitizenshipAllowed}
officialFeeEUR: ${c.officialFeeEUR === null ? 'null' : c.officialFeeEUR}
cbi: ${c.cbi}
goldenVisa: ${c.goldenVisa}
marriageYears: ${c.marriageYears === null ? 'null' : c.marriageYears}
languageRequired: ${c.languageRequired === null ? 'null' : c.languageRequired}
maxGenerations: ${c.maxGenerations === null ? 'null' : c.maxGenerations}
birthright: ${c.birthright}
cbiMinInvestmentEUR: ${c.cbiMinInvestmentEUR === null ? 'null' : c.cbiMinInvestmentEUR}
goldenVisaMinInvestmentEUR: ${c.goldenVisaMinInvestmentEUR === null ? 'null' : c.goldenVisaMinInvestmentEUR}
digitalNomadVisa: ${c.digitalNomadVisa}
languageLevel: ${c.languageLevel === null ? 'null' : str(c.languageLevel)}
summary: ${str(buildSummary(c))}`;

  // Phase 1: add profile fields
  if (profile) {
    if (profile.flag) frontmatter += `\nflag: ${str(profile.flag)}`;
    if (profile.areaKm2 !== null) frontmatter += `\nareaKm2: ${profile.areaKm2}`;
    if (profile.population !== null) frontmatter += `\npopulation: ${profile.population}`;
    if (profile.languages && profile.languages.length > 0) {
      frontmatter += `\nlanguages:\n${profile.languages.map((l) => `  - ${str(l)}`).join('\n')}`;
    }
    if (profile.demonym) frontmatter += `\ndemonym: ${str(profile.demonym)}`;
  }

  frontmatter += '\n---';

  return `${frontmatter}

${body.join('\n')}
`;
}

main();
