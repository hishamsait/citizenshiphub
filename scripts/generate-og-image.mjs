/**
 * Generate the default social share (OpenGraph) image for Citizenship Hub.
 *
 * Renders a 1200x630 PNG to public/og-default.png using Sharp. The brand fonts
 * (Playfair Display + Inter) are embedded as base64 data URIs so the card
 * renders identically regardless of the fonts installed on the build machine,
 * falling back to generic serif/sans if they cannot be fetched.
 *
 * Run: npm run generate:og   (or: node scripts/generate-og-image.mjs)
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFontFaces, renderPng } from './og-shared.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public', 'og-default.png');

const fontFaces = await loadFontFaces();

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
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

  <g transform="translate(946 178)" stroke="#c9a24e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    <circle cx="58" cy="58" r="50"/>
    <path d="M8 58h100"/>
    <path d="M58 8a50 50 0 0 1 20 50 50 50 0 0 1-20 50 50 50 0 0 1-20-50 50 50 0 0 1 20-50z"/>
  </g>

  <text x="80" y="286" class="brand" font-size="92" font-weight="700" fill="#fbfaf7">Citizenship Hub</text>
  <text x="82" y="362" class="sans" font-size="33" font-weight="500" fill="#a79e90">Global passport rankings &amp; citizenship guides</text>

  <rect x="84" y="404" width="64" height="5" fill="url(#gold)"/>

  <text x="80" y="562" class="sans" font-size="22" font-weight="600" fill="#736c60" letter-spacing="5">CITIZENSHIPHUB.COM</text>
</svg>
`;

const meta = await renderPng(svg, outFile);
console.log(`\u2713 wrote ${outFile} (${meta.width}x${meta.height}, ${meta.format})`);
