#!/usr/bin/env node
/**
 * Citizenship Hub immigration & citizenship news ETL.
 *
 * Fetches Google News RSS per country (query: "<country> immigration OR
 * citizenship"), normalises the top headlines, and writes:
 *   src/data/country-news.json
 *
 * Usage:
 *   node scripts/fetch-country-news.js              # fetch (30-day cache)
 *   node scripts/fetch-country-news.js --limit=20   # only the first N countries
 *   node scripts/fetch-country-news.js --fresh      # ignore cache
 *   node scripts/fetch-country-news.js --offline    # cached data only
 *   node scripts/fetch-country-news.js --out=tmp    # write JSON elsewhere
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const DEFAULT_OUT = path.resolve(ROOT, 'src', 'data');
const PASSPORTS_PATH = path.join(ROOT, 'src', 'data', 'passports.json');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PER_COUNTRY_LIMIT = 6;

function parseArgs() {
  const args = process.argv.slice(2);
  const eq = (k) => {
    const hit = args.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(`--${k}=`.length) : null;
  };
  const outEq = eq('out');
  const outIdx = args.indexOf('--out');
  const outDir = outEq ? outEq : outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : null;
  return {
    offline: args.includes('--offline'),
    fresh: args.includes('--fresh'),
    quiet: args.includes('--quiet'),
    limit: eq('limit') ? Number(eq('limit')) : null,
    outDir: outDir ? path.resolve(ROOT, outDir) : DEFAULT_OUT,
  };
}

function log(opts, msg) {
  if (!opts.quiet) console.log(msg);
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hash(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex').slice(0, 12);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'citizenshiphub-etl (+https://citizenshiphub.com)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeXml(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : '';
}

function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const sourceName = decodeXml(tag(block, 'source'));
    let title = decodeXml(tag(block, 'title'));
    // Google News appends " - SourceName" to the title.
    if (sourceName && title.endsWith(` - ${sourceName}`)) {
      title = title.slice(0, -(sourceName.length + 3));
    }
    items.push({
      title,
      url: decodeXml(tag(block, 'link')),
      sourceName,
      publishedAt: decodeXml(tag(block, 'pubDate')),
      snippet: decodeXml(tag(block, 'description')),
    });
  }
  return items;
}

function safeIso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function truncate(s, n) {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || null;
}

async function main() {
  const opts = parseArgs();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const passports = JSON.parse(fs.readFileSync(PASSPORTS_PATH, 'utf8')).passports;
  const countries = passports.map((p) => ({ iso2: String(p.code).toUpperCase(), name: p.name }));
  const total = opts.limit ? Math.min(opts.limit, countries.length) : countries.length;

  const out = [];
  let fetchedLive = 0;

  for (let i = 0; i < total; i++) {
    const c = countries[i];
    const query = `"${c.name}" immigration OR citizenship`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;
    const cachePath = path.join(CACHE_DIR, `news-${slugify(c.iso2)}.xml`);
    const cacheFresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;

    let xml;
    if (!opts.fresh && cacheFresh) {
      xml = fs.readFileSync(cachePath, 'utf8');
    } else {
      if (opts.offline) {
        log(opts, `⚠ ${c.name}: no cache (offline)`);
        continue;
      }
      try {
        xml = await fetchText(url);
        fs.writeFileSync(cachePath, xml);
        fetchedLive++;
      } catch (e) {
        log(opts, `✗ ${c.name}: ${e.message}`);
        continue;
      }
      // Be polite to Google News.
      await new Promise((r) => setTimeout(r, 250));
    }

    const items = parseRss(xml)
      .filter((it) => it.title && it.url)
      .slice(0, PER_COUNTRY_LIMIT)
      .map((it) => ({
        id: `news-${c.iso2.toLowerCase()}-${hash(it.url)}`,
        title: it.title,
        url: it.url,
        sourceName: it.sourceName || 'News',
        publishedAt: safeIso(it.publishedAt),
        snippet: truncate(it.snippet, 220),
      }));

    if (items.length) out.push({ iso2: c.iso2, name: c.name, items });
    log(opts, `✓ ${c.name}: ${items.length} items`);
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'Google News RSS (news.google.com/rss/search)',
    query: '"<country>" immigration OR citizenship',
    totalCountries: out.length,
    perCountryLimit: PER_COUNTRY_LIMIT,
    disclaimer: 'Informational only — headlines are auto-fetched and not verified.',
  };

  const outFile = path.join(opts.outDir, 'country-news.json');
  fs.writeFileSync(outFile, `${JSON.stringify({ meta, countries: out }, null, 2)}\n`, 'utf8');
  log(opts, `\nWrote ${outFile} (${out.length} countries, ${fetchedLive} fetched live)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
