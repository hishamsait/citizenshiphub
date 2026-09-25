#!/usr/bin/env node
/**
 * Generate per-country emergency numbers.
 * Writes: src/data/country-emergency.json
 *
 * Numbers are curated from public emergency-service listings and are a
 * best-effort reference; always verify locally. Countries without a curated
 * entry simply have no emergency data.
 *
 * Run: node scripts/generate-country-emergency.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');

// ISO2 -> [{ service, number, note? }]
// service: 'universal' | 'police' | 'ambulance' | 'fire'
const EMERGENCY = {
  // --- Europe (112 universal) ---
  AT: [{ service: 'universal', number: '112' }],
  AL: [{ service: 'universal', number: '112' }],
  AD: [{ service: 'universal', number: '112' }],
  BE: [{ service: 'universal', number: '112' }],
  BA: [{ service: 'universal', number: '112' }],
  BG: [{ service: 'universal', number: '112' }],
  HR: [{ service: 'universal', number: '112' }],
  CY: [{ service: 'universal', number: '112' }],
  CZ: [{ service: 'universal', number: '112' }],
  DK: [{ service: 'universal', number: '112' }],
  EE: [{ service: 'universal', number: '112' }],
  FI: [{ service: 'universal', number: '112' }],
  FR: [{ service: 'universal', number: '112' }],
  DE: [{ service: 'universal', number: '112' }],
  GR: [{ service: 'universal', number: '112' }],
  HU: [{ service: 'universal', number: '112' }],
  IS: [{ service: 'universal', number: '112' }],
  IT: [{ service: 'universal', number: '112' }],
  LV: [{ service: 'universal', number: '112' }],
  LI: [{ service: 'universal', number: '112' }],
  LT: [{ service: 'universal', number: '112' }],
  LU: [{ service: 'universal', number: '112' }],
  MT: [{ service: 'universal', number: '112' }],
  MD: [{ service: 'universal', number: '112' }],
  MC: [{ service: 'universal', number: '112' }],
  ME: [{ service: 'universal', number: '112' }],
  NL: [{ service: 'universal', number: '112' }],
  MK: [{ service: 'universal', number: '112' }],
  NO: [{ service: 'universal', number: '112' }],
  PL: [{ service: 'universal', number: '112' }],
  PT: [{ service: 'universal', number: '112' }],
  RO: [{ service: 'universal', number: '112' }],
  SM: [{ service: 'universal', number: '112' }],
  RS: [{ service: 'universal', number: '112' }],
  SK: [{ service: 'universal', number: '112' }],
  SI: [{ service: 'universal', number: '112' }],
  ES: [{ service: 'universal', number: '112' }],
  SE: [{ service: 'universal', number: '112' }],
  CH: [{ service: 'universal', number: '112' }],
  VA: [{ service: 'universal', number: '112' }],
  XK: [{ service: 'universal', number: '112' }],
  GE: [{ service: 'universal', number: '112' }],
  TR: [{ service: 'universal', number: '112' }],
  UA: [{ service: 'universal', number: '112' }],
  RU: [{ service: 'universal', number: '112', note: 'Police 102, ambulance 103, fire 101.' }],
  BY: [{ service: 'universal', number: '112', note: 'Police 102, ambulance 103, fire 101.' }],
  GB: [{ service: 'universal', number: '999', note: '112 also works.' }],
  IE: [{ service: 'universal', number: '999', note: '112 also works.' }],

  // --- Americas ---
  US: [{ service: 'universal', number: '911' }],
  CA: [{ service: 'universal', number: '911' }],
  MX: [{ service: 'universal', number: '911' }],
  AR: [{ service: 'universal', number: '911' }],
  BO: [{ service: 'universal', number: '911', note: 'Police 110.' }],
  CL: [
    { service: 'police', number: '133' },
    { service: 'ambulance', number: '131' },
    { service: 'fire', number: '132' },
  ],
  CO: [{ service: 'universal', number: '123' }],
  CR: [{ service: 'universal', number: '911' }],
  CU: [{ service: 'universal', number: '106' }],
  DO: [{ service: 'universal', number: '911' }],
  EC: [{ service: 'universal', number: '911' }],
  SV: [{ service: 'universal', number: '911' }],
  GT: [
    { service: 'police', number: '110' },
    { service: 'ambulance', number: '123' },
    { service: 'fire', number: '122' },
  ],
  HN: [{ service: 'universal', number: '911' }],
  HT: [{ service: 'police', number: '114' }],
  JM: [{ service: 'police', number: '119', note: 'Fire 110.' }],
  NI: [
    { service: 'police', number: '118' },
    { service: 'ambulance', number: '128' },
    { service: 'fire', number: '115' },
  ],
  PA: [{ service: 'universal', number: '911' }],
  PY: [{ service: 'universal', number: '911' }],
  PE: [
    { service: 'police', number: '105' },
    { service: 'ambulance', number: '117' },
    { service: 'fire', number: '116' },
  ],
  UY: [{ service: 'universal', number: '911' }],
  VE: [{ service: 'universal', number: '911' }],
  BR: [
    { service: 'police', number: '190' },
    { service: 'ambulance', number: '192' },
    { service: 'fire', number: '193' },
  ],

  // --- Asia & Middle East ---
  CN: [
    { service: 'police', number: '110' },
    { service: 'fire', number: '119' },
    { service: 'ambulance', number: '120' },
  ],
  JP: [
    { service: 'police', number: '110' },
    { service: 'ambulance', number: '119' },
    { service: 'fire', number: '119' },
  ],
  KR: [
    { service: 'police', number: '112' },
    { service: 'ambulance', number: '119' },
    { service: 'fire', number: '119' },
  ],
  TW: [
    { service: 'police', number: '110' },
    { service: 'ambulance', number: '119' },
    { service: 'fire', number: '119' },
  ],
  HK: [{ service: 'universal', number: '999' }],
  MO: [{ service: 'universal', number: '999' }],
  PH: [{ service: 'universal', number: '911' }],
  VN: [
    { service: 'police', number: '113' },
    { service: 'fire', number: '114' },
    { service: 'ambulance', number: '115' },
  ],
  TH: [
    { service: 'police', number: '191' },
    { service: 'ambulance', number: '1669' },
    { service: 'fire', number: '199' },
  ],
  MY: [{ service: 'universal', number: '999' }],
  SG: [
    { service: 'police', number: '999' },
    { service: 'ambulance', number: '995' },
    { service: 'fire', number: '995' },
  ],
  ID: [{ service: 'universal', number: '112', note: 'Police 110.' }],
  KH: [
    { service: 'police', number: '117' },
    { service: 'fire', number: '118' },
    { service: 'ambulance', number: '119' },
  ],
  LA: [
    { service: 'police', number: '191' },
    { service: 'ambulance', number: '195' },
    { service: 'fire', number: '190' },
  ],
  MM: [{ service: 'universal', number: '199' }],
  BD: [{ service: 'universal', number: '999' }],
  IN: [{ service: 'universal', number: '112', note: 'Police 100, ambulance 102, fire 101.' }],
  PK: [
    { service: 'police', number: '15' },
    { service: 'ambulance', number: '1122' },
    { service: 'fire', number: '16' },
  ],
  LK: [{ service: 'police', number: '119', note: 'Fire & ambulance 110.' }],
  NP: [
    { service: 'police', number: '100' },
    { service: 'fire', number: '101' },
    { service: 'ambulance', number: '102' },
  ],
  BT: [
    { service: 'police', number: '113' },
    { service: 'ambulance', number: '112' },
    { service: 'fire', number: '110' },
  ],
  MV: [{ service: 'police', number: '119' }],
  AF: [{ service: 'police', number: '119' }],
  IR: [
    { service: 'police', number: '110' },
    { service: 'ambulance', number: '115' },
    { service: 'fire', number: '125' },
  ],
  IL: [
    { service: 'police', number: '100' },
    { service: 'ambulance', number: '101' },
    { service: 'fire', number: '102' },
  ],
  JO: [{ service: 'universal', number: '911' }],
  LB: [{ service: 'universal', number: '112' }],
  SA: [
    { service: 'police', number: '999' },
    { service: 'ambulance', number: '997' },
    { service: 'fire', number: '998' },
  ],
  AE: [
    { service: 'police', number: '999' },
    { service: 'ambulance', number: '998' },
    { service: 'fire', number: '997' },
  ],
  QA: [{ service: 'universal', number: '999' }],
  BH: [{ service: 'universal', number: '999' }],
  KW: [{ service: 'universal', number: '112' }],
  OM: [{ service: 'police', number: '9999' }],
  KZ: [{ service: 'universal', number: '112', note: 'Police 102, ambulance 103, fire 101.' }],
  UZ: [
    { service: 'police', number: '102' },
    { service: 'ambulance', number: '103' },
    { service: 'fire', number: '101' },
  ],
  KG: [
    { service: 'police', number: '102' },
    { service: 'ambulance', number: '103' },
    { service: 'fire', number: '101' },
  ],
  MN: [
    { service: 'police', number: '102' },
    { service: 'ambulance', number: '103' },
    { service: 'fire', number: '101' },
  ],

  // --- Africa ---
  EG: [
    { service: 'police', number: '122' },
    { service: 'ambulance', number: '123' },
    { service: 'fire', number: '180' },
  ],
  ZA: [
    { service: 'police', number: '10111' },
    { service: 'ambulance', number: '10177' },
    { service: 'fire', number: '10177', note: '112 works from mobile.' },
  ],
  NG: [{ service: 'universal', number: '112', note: '199 also works.' }],
  KE: [{ service: 'universal', number: '999', note: '112 also works.' }],
  GH: [
    { service: 'police', number: '191' },
    { service: 'fire', number: '192' },
    { service: 'ambulance', number: '193' },
  ],
  MA: [{ service: 'police', number: '19', note: 'Ambulance & fire 15.' }],
  DZ: [{ service: 'police', number: '17', note: 'Ambulance & fire 14.' }],
  TN: [
    { service: 'police', number: '197' },
    { service: 'ambulance', number: '190' },
    { service: 'fire', number: '198' },
  ],
  ET: [
    { service: 'police', number: '991' },
    { service: 'ambulance', number: '907' },
    { service: 'fire', number: '939' },
  ],
  SD: [{ service: 'universal', number: '999' }],
  TZ: [{ service: 'universal', number: '112', note: '999 also works.' }],
  UG: [{ service: 'universal', number: '112', note: '999 also works.' }],
  RW: [{ service: 'universal', number: '112' }],
  AO: [
    { service: 'police', number: '113' },
    { service: 'fire', number: '115' },
    { service: 'ambulance', number: '116' },
  ],
  ZM: [{ service: 'universal', number: '999' }],
  ZW: [{ service: 'universal', number: '999', note: 'Ambulance 994, fire 993.' }],
  MZ: [
    { service: 'police', number: '119' },
    { service: 'fire', number: '198' },
    { service: 'ambulance', number: '117' },
  ],
  BW: [
    { service: 'police', number: '999' },
    { service: 'fire', number: '998' },
    { service: 'ambulance', number: '997' },
  ],
  NA: [{ service: 'police', number: '10111' }],
  LS: [
    { service: 'police', number: '123' },
    { service: 'ambulance', number: '121' },
    { service: 'fire', number: '122' },
  ],
  SZ: [
    { service: 'police', number: '999' },
    { service: 'ambulance', number: '977' },
    { service: 'fire', number: '933' },
  ],
  MG: [
    { service: 'police', number: '117' },
    { service: 'fire', number: '118' },
    { service: 'ambulance', number: '124' },
  ],
  MU: [
    { service: 'police', number: '999' },
    { service: 'ambulance', number: '114' },
    { service: 'fire', number: '115' },
  ],
  SC: [{ service: 'police', number: '999' }],
  CV: [
    { service: 'police', number: '132' },
    { service: 'ambulance', number: '130' },
    { service: 'fire', number: '131' },
  ],

  // --- Oceania ---
  AU: [{ service: 'universal', number: '000', note: '112 works from mobile.' }],
  NZ: [{ service: 'universal', number: '111' }],
  FJ: [{ service: 'universal', number: '911', note: '917 also works.' }],
  PG: [{ service: 'universal', number: '112' }],
  SB: [{ service: 'universal', number: '999' }],
  VU: [{ service: 'universal', number: '111' }],
  WS: [{ service: 'police', number: '999' }],
  TO: [{ service: 'police', number: '911' }],
};

function main() {
  const passports = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'passports.json'), 'utf8')).passports;
  const countries = [];
  for (const p of passports) {
    const iso2 = String(p.code).toUpperCase();
    const services = EMERGENCY[iso2];
    if (!services || services.length === 0) continue;
    countries.push({ iso2, services });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'Curated public emergency-service numbers (best effort).',
    license: 'Public facts; no copyright applies.',
    disclaimer: 'Emergency numbers change and vary by region — always verify locally.',
    totalCountries: countries.length,
  };

  const outFile = path.join(SRC_DATA, 'country-emergency.json');
  fs.writeFileSync(outFile, `${JSON.stringify({ meta, countries }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outFile} (${countries.length} countries)`);
}

main();
