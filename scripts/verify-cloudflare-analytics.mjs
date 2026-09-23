#!/usr/bin/env node
// One-off check that the Cloudflare GraphQL Analytics API returns the traffic
// fields the Console provider expects. Reads config from `.dev.vars` and/or
// shell env, then prints a human-readable summary.
//
// Usage: node scripts/verify-cloudflare-analytics.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDevVars() {
  const out = {};
  try {
    for (const line of readFileSync(join(root, '.dev.vars'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
}

const env = { ...loadDevVars(), ...process.env };
const token = env.CF_API_TOKEN || env.CF_ANALYTICS_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
const accountId = env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
const zoneId = env.CF_ZONE_ID;
const siteTag = env.CF_SITE_TAG;

if (!token || !zoneId) {
  console.error('\nMissing configuration. Add these to `.dev.vars` (gitignored), then re-run:\n');
  console.error('  CF_ZONE_ID=<your zone id>');
  console.error('  CF_ACCOUNT_ID=<your account id>');
  console.error('  CF_ANALYTICS_API_TOKEN=<token with Analytics:Read + Zone:Read>\n');
  console.error(`Resolved -> token=${token ? 'SET' : 'MISSING'}, accountId=${accountId || 'MISSING'}, zoneId=${zoneId || 'MISSING'}`);
  process.exit(1);
}

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const days = 28;
const dateGeq = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const dateLeq = new Date().toISOString().slice(0, 10);

// Zone-level HTTP analytics: totals + daily series come from the 1-day rollup
// (which exposes `pageViews`), while path/geo/device/referrer grouping uses the
// adaptive dataset (which exposes those dimensions and `visits`).
const HTTP_QUERY = `
query ZoneAnalytics($zoneTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      totals: httpRequests1dGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, limit: 1) {
        sum { pageViews requests }
        uniq { uniques }
      }
      series: httpRequests1dGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [date_ASC], limit: 100) {
        sum { pageViews }
        dimensions { date }
      }
      topPaths: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 100) {
        sum { visits }
        dimensions { clientRequestPath }
      }
      countries: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 50) {
        sum { visits }
        dimensions { clientCountryName }
      }
      devices: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 10) {
        sum { visits }
        dimensions { clientDeviceType }
      }
    }
  }
}`;

// Account-level RUM (Web Analytics) for page loads + Core Web Vitals. Requires
// Web Analytics enabled and its `siteTag` (CF_SITE_TAG).
const RUM_QUERY = `
query Rum($accountTag: String!, $siteTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      pageLoads: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $date_geq, date_leq: $date_leq }, limit: 1) {
        count
        sum { visits }
      }
      vitals: rumWebVitalsEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $date_geq, date_leq: $date_leq }, limit: 1) {
        count
        quantiles {
          largestContentfulPaintP75
          cumulativeLayoutShiftP75
          interactionToNextPaintP75
          firstContentfulPaintP75
          timeToFirstByteP75
        }
      }
    }
  }
}`;
async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    return { ok: false, status: res.status, errors: json.errors };
  }
  return { ok: true, data: json.data };
}

console.log(`Zone: ${zoneId}  |  Account: ${accountId || '(not provided)'}  |  window: ${dateGeq} .. ${dateLeq}\n`);

const http = await gql(HTTP_QUERY, { zoneTag: zoneId, date_geq: dateGeq, date_leq: dateLeq });

if (!http.ok) {
  console.error('❌ HTTP dataset query failed.');
  console.error('   status:', http.status);
  console.error('   errors:', JSON.stringify(http.errors, null, 2));
  process.exit(1);
}

const zone = http.data?.viewer?.zones?.[0];
const totals = zone?.totals?.[0];
console.log('✅ HTTP dataset (zone):');
console.log(`   pageViews: ${totals?.sum?.pageViews ?? 0}  requests: ${totals?.sum?.requests ?? 0}  uniques(IPs): ${totals?.uniq?.uniques ?? 0}`);
console.log(`   series days: ${zone?.series?.length ?? 0}`);
console.log(`   top paths: ${(zone?.topPaths ?? []).slice(0, 8).map((p) => `${p.dimensions?.clientRequestPath}=${p.sum?.visits}`).join(', ') || '(none)'}`);
console.log(`   countries: ${(zone?.countries ?? []).slice(0, 8).map((c) => `${c.dimensions?.clientCountryName}=${c.sum?.visits}`).join(', ') || '(none)'}`);
console.log(`   devices: ${(zone?.devices ?? []).map((d) => `${d.dimensions?.clientDeviceType}=${d.sum?.visits}`).join(', ') || '(none)'}`);

console.log('');
if (!siteTag) {
  console.warn('ℹ️  RUM/Core Web Vitals skipped — set CF_SITE_TAG (Web Analytics site tag) to include them.');
} else {
  const rum = await gql(RUM_QUERY, { accountTag: accountId, siteTag, date_geq: dateGeq, date_leq: dateLeq });
  if (!rum.ok) {
    console.warn('⚠️  RUM query failed:', JSON.stringify(rum.errors, null, 2));
  } else {
    const acc = rum.data?.viewer?.accounts?.[0];
    const pl = acc?.pageLoads?.[0];
    const q = acc?.vitals?.[0]?.quantiles;
    console.log('✅ RUM dataset (account / Web Analytics):');
    console.log(`   page loads: ${pl?.count ?? 0}  visits: ${pl?.sum?.visits ?? 0}`);
    console.log(`   LCP p75: ${q?.largestContentfulPaintP75 ?? 'n/a'}  CLS p75: ${q?.cumulativeLayoutShiftP75 ?? 'n/a'}  INP p75: ${q?.interactionToNextPaintP75 ?? 'n/a'}`);
    console.log(`   FCP p75: ${q?.firstContentfulPaintP75 ?? 'n/a'}  TTFB p75: ${q?.timeToFirstByteP75 ?? 'n/a'}`);
  }
}

console.log('\nDone.');
