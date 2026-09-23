/**
 * Shared helpers for generating Citizenship Hub OpenGraph images with Sharp.
 *
 * Fonts are embedded as base64 data URIs so cards render identically on any
 * machine (CI included), falling back to generic serif/sans when they cannot
 * be fetched. Used by generate-og-image.mjs and generate-country-og-images.mjs.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const FONT_SOURCES = [
  {
    family: 'Playfair Display',
    weight: '400 900',
    url: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
  },
  {
    family: 'Inter',
    weight: '400 700',
    url: 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
  },
];

let fontFacesPromise;

/** @returns {Promise<string>} CSS @font-face rules, fetched once and cached. */
export function loadFontFaces() {
  if (!fontFacesPromise) {
    fontFacesPromise = (async () => {
      const faces = await Promise.all(
        FONT_SOURCES.map(async (font) => {
          try {
            const res = await fetch(font.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 1000) throw new Error('suspiciously small font file');
            const b64 = buf.toString('base64');
            return `@font-face{font-family:'${font.family}';font-weight:${font.weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
          } catch (err) {
            console.warn(`\u26a0 skipping ${font.family}: ${err.message}`);
            return '';
          }
        }),
      );
      return faces.filter(Boolean).join('\n');
    })();
  }
  return fontFacesPromise;
}

/** Render a 1200x630 SVG string to a PNG file (creating parent dirs as needed). */
export async function renderPng(svg, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return sharp(outPath).metadata();
}

/** Escape a value for safe interpolation into an SVG/XML text node. */
export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
