#!/usr/bin/env node
/**
 * Generate per-country immigration & citizenship sources.
 * Writes: src/data/country-sources.json
 *
 * Each country gets a Wikipedia nationality-law link (derived from its
 * demonym, with a curated override map for the cases where the page title
 * differs) plus an official government immigration portal where known.
 *
 * Run: node scripts/generate-country-sources.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');

// Wikipedia nationality-law page titles that differ from `{demonym} nationality law`.
const WIKI_TITLE_OVERRIDES = {
  US: 'United States nationality law',
  CD: 'Democratic Republic of the Congo nationality law',
  CG: 'Republic of the Congo nationality law',
  CF: 'Central African Republic nationality law',
  DO: 'Dominican Republic nationality law',
  TL: 'East Timorese nationality law',
  VA: 'Vatican City citizenship',
  KN: 'Saint Kitts and Nevis nationality law',
  VC: 'Saint Vincent and the Grenadines nationality law',
  CV: 'Cape Verdean nationality law',
  ST: 'São Toméan nationality law',
};

// Official government immigration / citizenship portals (best effort).
const GOV = {
  US: { name: 'U.S. Citizenship and Immigration Services', url: 'https://www.uscis.gov/' },
  GB: { name: 'UK Visas and Immigration', url: 'https://www.gov.uk/browse/visas-immigration' },
  CA: { name: 'Immigration, Refugees and Citizenship Canada', url: 'https://www.canada.ca/en/immigration-refugees-citizenship.html' },
  AU: { name: 'Department of Home Affairs (Australia)', url: 'https://immi.homeaffairs.gov.au/' },
  NZ: { name: 'Immigration New Zealand', url: 'https://www.immigration.govt.nz/' },
  IE: { name: 'Irish Immigration', url: 'https://www.irishimmigration.ie/' },
  DE: { name: 'Federal Office for Migration and Refugees (Germany)', url: 'https://www.bamf.de/EN/Home/home_node.html' },
  FR: { name: 'France-Visas / Service Public', url: 'https://www.service-public.fr/particuliers/vosdroits/N111' },
  ES: { name: 'Ministerio de Inclusión — Extranjería', url: 'https://extranjeros.inclusion.gob.es/' },
  PT: { name: 'AIMA — Agência para a Integração, Migrações e Asilo', url: 'https://aima.gov.pt/' },
  IT: { name: 'Ministero dell\'Interno (Italy)', url: 'https://www.interno.gov.it/it/temi/immigrazione-e-asilo' },
  NL: { name: 'Immigration and Naturalisation Service (Netherlands)', url: 'https://ind.nl/en' },
  BE: { name: 'Immigration Office (Belgium)', url: 'https://www.ibz.be/' },
  SE: { name: 'Swedish Migration Agency', url: 'https://www.migrationsverket.se/English/' },
  NO: { name: 'Norwegian Directorate of Immigration', url: 'https://www.udi.no/en/' },
  DK: { name: 'Danish Immigration Service', url: 'https://www.nyidanmark.dk/en-GB' },
  FI: { name: 'Finnish Immigration Service', url: 'https://migri.fi/en/home' },
  CH: { name: 'State Secretariat for Migration (Switzerland)', url: 'https://www.sem.admin.ch/sem/en/home.html' },
  AT: { name: 'Migration.gv.at (Austria)', url: 'https://www.migration.gv.at/en/' },
  GR: { name: 'Ministry of Migration and Asylum (Greece)', url: 'https://migration.gov.gr/en/' },
  PL: { name: 'Office for Foreigners (Poland)', url: 'https://www.gov.pl/web/udsc-en' },
  JP: { name: 'Immigration Services Agency of Japan', url: 'https://www.moj.go.jp/isa/' },
  KR: { name: 'Korea Immigration Service', url: 'https://www.immigration.go.kr/immigration_eng/index.do' },
  SG: { name: 'Immigration & Checkpoints Authority (Singapore)', url: 'https://www.ica.gov.sg/' },
  AE: { name: 'Federal Authority for Identity & Citizenship (UAE)', url: 'https://icp.gov.ae/' },
  BR: { name: 'Ministério da Justiça — Migrações (Brazil)', url: 'https://www.gov.br/mj/pt-br/assuntos/seus-direitos/estrangeiro' },
  MX: { name: 'Instituto Nacional de Migración (Mexico)', url: 'https://www.gob.mx/inm' },
  AR: { name: 'Dirección Nacional de Migraciones (Argentina)', url: 'https://www.argentina.gob.ar/interior/migraciones' },
  IN: { name: 'Indian Citizenship Online', url: 'https://indiancitizenshiponline.nic.in/' },
  ZA: { name: 'Department of Home Affairs (South Africa)', url: 'https://www.dha.gov.za/' },
  NG: { name: 'Nigeria Immigration Service', url: 'https://immigration.gov.ng/' },
};

const slugify = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const wikiUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

function main() {
  const passports = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'passports.json'), 'utf8')).passports;
  const countries = [];

  for (const p of passports) {
    const iso2 = String(p.code).toUpperCase();
    const name = p.name;
    const demonym = p.profile?.demonym;
    const sources = [];

    const wikiTitle = WIKI_TITLE_OVERRIDES[iso2] ?? (demonym ? `${demonym} nationality law` : null);
    if (wikiTitle) {
      sources.push({
        id: `src-${slugify(iso2)}-wikipedia`,
        name: `Wikipedia — ${wikiTitle}`,
        url: wikiUrl(wikiTitle),
        category: 'Law',
        note: 'Overview of citizenship-by-descent, naturalisation and dual-citizenship rules.',
      });
    }

    const gov = GOV[iso2];
    if (gov) {
      sources.push({
        id: `src-${slugify(iso2)}-gov`,
        name: gov.name,
        url: gov.url,
        category: 'Government',
        note: 'Official government source for immigration and citizenship.',
      });
    }

    if (sources.length) countries.push({ iso2, name, sources });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'Curated official government portals + Wikipedia nationality-law pages.',
    totalCountries: countries.length,
    disclaimer: 'Reference links only — verify with official sources before acting.',
  };

  const outFile = path.join(SRC_DATA, 'country-sources.json');
  fs.writeFileSync(outFile, `${JSON.stringify({ meta, countries }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outFile} (${countries.length} countries)`);
}

main();
