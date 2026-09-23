/**
 * Generate a per-country social share (OpenGraph) image for every citizenship
 * guide, keyed by URL slug: public/og/countries/<slug>.png (1200x630).
 *
 * Reads src/data/rankings.json (name, region, rank, visa-free count) — the same
 * dataset the guides are generated from — and renders one branded card per
 * country. Long country names are auto-shrunk to fit on a single line.
 *
 * Run: npm run generate:og:countries   (or: node scripts/generate-country-og-images.mjs)
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { escapeXml, loadFontFaces, renderPng } from './og-shared.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public', 'og', 'countries');

const slugify = (value) =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const rankings = JSON.parse(readFileSync(resolve(root, 'src', 'data', 'rankings.json'), 'utf8')).rankings;

const fontFaces = await loadFontFaces();

/** Pick a title font-size that fits long country names on one line. */
function titleSize(name) {
  const maxWidth = 860;
  const base = 92;
  const min = 44;
  const estimated = name.length * 0.55 * base;
  if (estimated <= maxWidth) return base;
  return Math.max(min, Math.floor((base * maxWidth) / estimated));
}

function cardSvg({ name, region, rankLine, titlePx }) {
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050505"/>
      <stop offset="0.55" stop-color="#121211"/>
      <stop offset="1" stop-color="#1c1c1a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.18" r="0.7">
      <stop offset="0" stop-color="#c9a24e" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#c9a24e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c9a24e"/>
      <stop offset="1" stop-color="#b1873a"/>
    </linearGradient>
    <style>
      ${fontFaces}
      .brand { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; }
      .sans  { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    </style>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="8" fill="url(#gold)"/>

  <g transform="translate(962 150)" stroke="#c9a24e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    <circle cx="56" cy="56" r="48"/>
    <path d="M8 56h96"/>
    <path d="M56 8a48 48 0 0 1 19 48 48 48 0 0 1-19 48 48 48 0 0 1-19-48 48 48 0 0 1 19-48z"/>
  </g>

  <text x="80" y="132" class="sans" font-size="24" font-weight="600" fill="#c9a24e" letter-spacing="5">CITIZENSHIP HUB</text>
  <text x="78" y="280" class="brand" font-size="${titlePx}" font-weight="700" fill="#fbfaf7">${name}</text>
  <rect x="82" y="322" width="64" height="5" fill="url(#gold)"/>
  <text x="82" y="382" class="sans" font-size="32" font-weight="500" fill="#a79e90">${rankLine}</text>
  <text x="82" y="430" class="sans" font-size="22" font-weight="500" fill="#736c60">${region}</text>
  <text x="80" y="562" class="sans" font-size="22" font-weight="600" fill="#736c60" letter-spacing="5">CITIZENSHIPHUB.COM</text>
</svg>
`;
}

let written = 0;
for (const r of rankings) {
  const rankLine =
    typeof r.rank === 'number' && typeof r.visaFree === 'number'
      ? `Ranked #${r.rank} globally \u00b7 ${r.visaFree} visa-free destinations`
      : 'Citizenship &amp; visa guide';
  const svg = cardSvg({
    name: escapeXml(r.name),
    region: escapeXml(r.region ?? ''),
    rankLine,
    titlePx: titleSize(r.name),
  });
  await renderPng(svg, join(outDir, `${slugify(r.name)}.png`));
  written += 1;
}

console.log(`\u2713 wrote ${written} country OG images to ${outDir}`);
