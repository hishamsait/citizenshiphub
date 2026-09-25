#!/usr/bin/env node
/**
 * Generate per-country immigration & citizenship sources plus practical
 * relocation links (jobs, housing, healthcare, banking, education).
 * Writes: src/data/country-sources.json
 *
 * Run: node scripts/generate-country-sources.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');

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
  IT: { name: "Ministero dell'Interno (Italy)", url: 'https://www.interno.gov.it/it/temi/immigrazione-e-asilo' },
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

const GLOBAL_JOBS = [
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/' },
  { name: 'Indeed', url: 'https://www.indeed.com/' },
];

const JOBS = {
  AU: { name: 'SEEK', url: 'https://www.seek.com.au/' },
  NZ: { name: 'Trade Me Jobs', url: 'https://www.trademe.co.nz/a/jobs' },
  GB: { name: 'Totaljobs', url: 'https://www.totaljobs.com/' },
  US: { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job/index.htm' },
  CA: { name: 'Workopolis', url: 'https://www.workopolis.com/' },
  DE: { name: 'StepStone', url: 'https://www.stepstone.de/' },
  FR: { name: 'Welcome to the Jungle', url: 'https://www.welcometothejungle.com/' },
  ES: { name: 'InfoJobs', url: 'https://www.infojobs.net/' },
  IT: { name: 'InfoJobs', url: 'https://www.infojobs.it/' },
  NL: { name: 'Nationale Vacaturebank', url: 'https://www.nationalevacaturebank.nl/' },
  SE: { name: 'Arbetsförmedlingen', url: 'https://arbetsformedlingen.se/' },
  IE: { name: 'IrishJobs.ie', url: 'https://www.irishjobs.ie/' },
  SG: { name: 'MyCareersFuture', url: 'https://www.mycareersfuture.gov.sg/' },
  AE: { name: 'Bayt', url: 'https://www.bayt.com/' },
  ZA: { name: 'CareerJunction', url: 'https://www.careerjunction.co.za/' },
  IN: { name: 'Naukri', url: 'https://www.naukri.com/' },
  BR: { name: 'Catho', url: 'https://www.catho.com.br/' },
  JP: { name: 'doda', url: 'https://doda.jp/' },
  KR: { name: 'Saramin', url: 'https://www.saramin.co.kr/' },
};

const HOUSING = {
  AU: { name: 'Domain', url: 'https://www.domain.com.au/' },
  GB: { name: 'Rightmove', url: 'https://www.rightmove.co.uk/' },
  US: { name: 'Zillow', url: 'https://www.zillow.com/' },
  CA: { name: 'Realtor.ca', url: 'https://www.realtor.ca/' },
  DE: { name: 'ImmobilienScout24', url: 'https://www.immobilienscout24.de/' },
  FR: { name: 'SeLoger', url: 'https://www.seloger.com/' },
  ES: { name: 'Idealista', url: 'https://www.idealista.com/' },
  IT: { name: 'Immobiliare.it', url: 'https://www.immobiliare.it/' },
  PT: { name: 'Idealista Portugal', url: 'https://www.idealista.pt/' },
  NL: { name: 'Funda', url: 'https://www.funda.nl/' },
  IE: { name: 'Daft.ie', url: 'https://www.daft.ie/' },
  SE: { name: 'Hemnet', url: 'https://www.hemnet.se/' },
  DK: { name: 'Boligsiden', url: 'https://www.boligsiden.dk/' },
  NO: { name: 'Finn.no', url: 'https://www.finn.no/realestate' },
  FI: { name: 'Oikotie', url: 'https://asunnot.oikotie.fi/' },
  CH: { name: 'Homegate', url: 'https://www.homegate.ch/' },
  AT: { name: 'Willhaben', url: 'https://www.willhaben.at/' },
  NZ: { name: 'Trade Me Property', url: 'https://www.trademe.co.nz/a/property' },
  SG: { name: 'PropertyGuru', url: 'https://www.propertyguru.com.sg/' },
  AE: { name: 'Property Finder', url: 'https://www.propertyfinder.ae/' },
  ZA: { name: 'Property24', url: 'https://www.property24.com/' },
};

const HEALTHCARE = {
  GB: { name: 'NHS', url: 'https://www.nhs.uk/' },
  AU: { name: 'Healthdirect Australia', url: 'https://www.healthdirect.gov.au/' },
  CA: { name: 'Health Canada', url: 'https://www.canada.ca/en/health-canada.html' },
  US: { name: 'HealthCare.gov', url: 'https://www.healthcare.gov/' },
  DE: { name: 'Federal Ministry of Health', url: 'https://www.bundesgesundheitsministerium.de/' },
  FR: { name: 'Ameli (Assurance Maladie)', url: 'https://www.ameli.fr/' },
  ES: { name: 'Ministerio de Sanidad', url: 'https://www.sanidad.gob.es/' },
  IT: { name: 'Ministero della Salute', url: 'https://www.salute.gov.it/' },
  NL: { name: 'Government.nl — Healthcare', url: 'https://www.government.nl/topics/health-insurance' },
  SE: { name: '1177 Vårdguiden', url: 'https://www.1177.se/' },
  IE: { name: 'HSE', url: 'https://www.hse.ie/' },
  NZ: { name: 'Health NZ', url: 'https://www.tewhatuora.govt.nz/' },
  PT: { name: 'SNS24', url: 'https://www.sns24.gov.pt/' },
};

const BANKING = {
  GB: { name: 'Bank of England', url: 'https://www.bankofengland.co.uk/' },
  US: { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/' },
  CA: { name: 'Bank of Canada', url: 'https://www.bankofcanada.ca/' },
  AU: { name: 'Reserve Bank of Australia', url: 'https://www.rba.gov.au/' },
  NZ: { name: 'Reserve Bank of New Zealand', url: 'https://www.rbnz.govt.nz/' },
  DE: { name: 'Deutsche Bundesbank', url: 'https://www.bundesbank.de/' },
  FR: { name: 'Banque de France', url: 'https://www.banque-france.fr/' },
  ES: { name: 'Banco de España', url: 'https://www.bde.es/' },
  IT: { name: "Banca d'Italia", url: 'https://www.bancaditalia.it/' },
  NL: { name: 'De Nederlandsche Bank', url: 'https://www.dnb.nl/' },
  IE: { name: 'Central Bank of Ireland', url: 'https://www.centralbank.ie/' },
  SG: { name: 'Monetary Authority of Singapore', url: 'https://www.mas.gov.sg/' },
  AE: { name: 'Central Bank of the UAE', url: 'https://www.centralbank.ae/' },
  ZA: { name: 'South African Reserve Bank', url: 'https://www.resbank.co.za/' },
};

const EDUCATION = {
  AU: { name: 'Study Australia', url: 'https://www.studyaustralia.gov.au/' },
  GB: { name: 'UCAS', url: 'https://www.ucas.com/' },
  US: { name: 'EducationUSA', url: 'https://educationusa.state.gov/' },
  CA: { name: 'EduCanada', url: 'https://www.educanada.ca/' },
  DE: { name: 'DAAD', url: 'https://www.daad.de/en/' },
  FR: { name: 'Campus France', url: 'https://www.campusfrance.org/' },
  NL: { name: 'Study in NL', url: 'https://www.studyinnl.org/' },
  SE: { name: 'Study in Sweden', url: 'https://studyinsweden.se/' },
  IE: { name: 'Education in Ireland', url: 'https://www.educationinireland.com/' },
  NZ: { name: 'Study in New Zealand', url: 'https://www.studyinnewzealand.govt.nz/' },
  SG: { name: 'Ministry of Education Singapore', url: 'https://www.moe.gov.sg/' },
  AE: { name: 'KHDA Dubai', url: 'https://www.khda.gov.ae/' },
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
      sources.push({ id: `src-${slugify(iso2)}-wikipedia`, name: `Wikipedia — ${wikiTitle}`, url: wikiUrl(wikiTitle), category: 'Law', note: 'Overview of citizenship-by-descent, naturalisation and dual-citizenship rules.' });
    }

    const gov = GOV[iso2];
    if (gov) {
      sources.push({ id: `src-${slugify(iso2)}-gov`, name: gov.name, url: gov.url, category: 'Government', note: 'Official government source for immigration and citizenship.' });
    }

    for (const j of GLOBAL_JOBS) {
      sources.push({ id: `src-${slugify(iso2)}-jobs-${slugify(j.name)}`, name: j.name, url: j.url, category: 'Jobs', note: 'International job board with local listings.' });
    }
    const job = JOBS[iso2];
    if (job) sources.push({ id: `src-${slugify(iso2)}-jobs`, name: job.name, url: job.url, category: 'Jobs', note: 'Leading local job board.' });
    const housing = HOUSING[iso2];
    if (housing) sources.push({ id: `src-${slugify(iso2)}-housing`, name: housing.name, url: housing.url, category: 'Housing', note: 'Property listings and rentals.' });
    const healthcare = HEALTHCARE[iso2];
    if (healthcare) sources.push({ id: `src-${slugify(iso2)}-healthcare`, name: healthcare.name, url: healthcare.url, category: 'Healthcare', note: 'Public health system portal.' });
    const banking = BANKING[iso2];
    if (banking) sources.push({ id: `src-${slugify(iso2)}-banking`, name: banking.name, url: banking.url, category: 'Banking', note: 'Central bank / banking information.' });
    const education = EDUCATION[iso2];
    if (education) sources.push({ id: `src-${slugify(iso2)}-education`, name: education.name, url: education.url, category: 'Education', note: 'Study and education information.' });

    if (sources.length) countries.push({ iso2, name, sources });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'Curated official government portals, Wikipedia nationality-law pages, and practical relocation links.',
    totalCountries: countries.length,
    disclaimer: 'Reference links only — verify with official sources before acting.',
  };

  const outFile = path.join(SRC_DATA, 'country-sources.json');
  fs.writeFileSync(outFile, `${JSON.stringify({ meta, countries }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outFile} (${countries.length} countries)`);
}

main();
