#!/usr/bin/env node
// Probe which Cloudflare GraphQL Analytics fields the current token can read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadDevVars() {
  const out = {};
  try {
    for (const l of readFileSync(join(root, '.dev.vars'), 'utf8').split('\n')) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
}
const env = { ...loadDevVars(), ...process.env };
const token = env.CF_API_TOKEN || env.CF_ANALYTICS_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
const zone = env.CF_ZONE_ID;
const acct = env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
const site = env.CF_SITE_TAG;
const geq = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
const leq = new Date().toISOString().slice(0, 10);

async function gql(q, v) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json().catch(() => ({}));
  return j.errors?.length ? { ok: false, e: j.errors.map((x) => x.message) } : { ok: true, d: j.data };
}

const Z = { zoneTag: zone, date_geq: geq, date_leq: leq };
const zq = (inner) => `query($zoneTag:String!,$date_geq:Date!,$date_leq:Date!){viewer{zones(filter:{zoneTag:$zoneTag}){${inner}}}}`;

const probes = [
  {
    name: '1. Referrers (clientRefererHost only)',
    q: zq(`r:httpRequestsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},orderBy:[sum_visits_DESC],limit:6){sum{visits}dimensions{clientRefererHost}}`),
    v: Z,
    s: (d) => (d.viewer.zones[0].r || []).map((x) => `${x.dimensions.clientRefererHost || 'direct'}=${x.sum.visits}`).join(', ') || '(no data)',
  },
  {
    name: '2a. Traffic quality — requestSource (human vs Cloudflare)',
    q: zq(`r:httpRequestsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},limit:10){sum{visits}dimensions{requestSource}}`),
    v: Z,
    s: (d) => (d.viewer.zones[0].r || []).map((x) => `${x.dimensions.requestSource}=${x.sum.visits}`).join(', ') || '(no data)',
  },
  {
    name: '2b. Bot fields (botManagementDecision / verifiedBotCategory)',
    q: zq(`r:httpRequestsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},limit:10){sum{visits}dimensions{botManagementDecision verifiedBotCategory}}`),
    v: Z,
    s: (d) => (d.viewer.zones[0].r || []).slice(0, 4).map((x) => `${x.dimensions.botManagementDecision || '-'}/${x.dimensions.verifiedBotCategory || '-'}=${x.sum.visits}`).join(', ') || '(no data)',
  },
  {
    name: '3. Security threats (threats)',
    q: zq(`r:httpRequests1dGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},limit:1){sum{threats}}`),
    v: Z,
    s: (d) => `threats: ${d.viewer.zones[0].r?.[0]?.sum?.threats ?? 0}`,
  },
  {
    name: '4. Firewall events (firewallEventsAdaptiveGroups)',
    q: zq(`r:firewallEventsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},limit:6){count dimensions{action}}`),
    v: Z,
    s: (d) => (d.viewer.zones[0].r || []).map((x) => `${x.dimensions?.action || '?'}=${x.count}`).join(', ') || '(no data)',
  },
  {
    name: '5. Browser / OS (userAgentBrowser / userAgentOS)',
    q: zq(`r:httpRequestsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},orderBy:[sum_visits_DESC],limit:6){sum{visits}dimensions{userAgentBrowser userAgentOS}}`),
    v: Z,
    s: (d) => (d.viewer.zones[0].r || []).slice(0, 3).map((x) => `${x.dimensions.userAgentBrowser}/${x.dimensions.userAgentOS}=${x.sum.visits}`).join(', ') || '(no data)',
  },
  {
    name: '6. Cache / bandwidth / status codes',
    q: zq(`totals:httpRequests1dGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},limit:1){sum{bytes cachedRequests cachedBytes}} statuses:httpRequestsAdaptiveGroups(filter:{date_geq:$date_geq,date_leq:$date_leq},orderBy:[sum_visits_DESC],limit:6){sum{visits}dimensions{cacheStatus edgeResponseStatus}}`),
    v: Z,
    s: (d) => {
      const t = d.viewer.zones[0].totals?.[0]?.sum;
      const st = (d.viewer.zones[0].statuses || []).slice(0, 3).map((x) => `${x.dimensions.cacheStatus || '-'}/${x.dimensions.edgeResponseStatus}=${x.sum.visits}`).join(', ');
      return `bytes=${t?.bytes ?? 0} cachedReq=${t?.cachedRequests ?? 0} cachedBytes=${t?.cachedBytes ?? 0} | status: ${st || '(none)'}`;
    },
  },
  {
    name: '7a. RUM page loads + visits (siteTag-scoped)',
    q: `query($accountTag:String!,$siteTag:String!,$date_geq:Date!,$date_leq:Date!){viewer{accounts(filter:{accountTag:$accountTag}){r:rumPageloadEventsAdaptiveGroups(filter:{siteTag:$siteTag,date_geq:$date_geq,date_leq:$date_leq},limit:1){count sum{visits}}}}}`,
    v: { accountTag: acct, siteTag: site, date_geq: geq, date_leq: leq },
    s: (d) => { const r = d.viewer.accounts?.[0]?.r?.[0]; return `pageLoads=${r?.count ?? 0} visits=${r?.sum?.visits ?? 0}`; },
  },
  {
    name: '7b. RUM referrers (refererHost, siteTag-scoped)',
    q: `query($accountTag:String!,$siteTag:String!,$date_geq:Date!,$date_leq:Date!){viewer{accounts(filter:{accountTag:$accountTag}){r:rumPageloadEventsAdaptiveGroups(filter:{siteTag:$siteTag,date_geq:$date_geq,date_leq:$date_leq},limit:8){count dimensions{refererHost}}}}}`,
    v: { accountTag: acct, siteTag: site, date_geq: geq, date_leq: leq },
    s: (d) => (d.viewer.accounts?.[0]?.r || []).map((x) => `${x.dimensions.refererHost || 'direct'}=${x.count}`).join(', ') || '(no data)',
  },
  {
    name: '7c. RUM Core Web Vitals (quantiles, siteTag-scoped)',
    q: `query($accountTag:String!,$siteTag:String!,$date_geq:Date!,$date_leq:Date!){viewer{accounts(filter:{accountTag:$accountTag}){r:rumWebVitalsEventsAdaptiveGroups(filter:{siteTag:$siteTag,date_geq:$date_geq,date_leq:$date_leq},limit:1){count quantiles{largestContentfulPaintP75 cumulativeLayoutShiftP75 interactionToNextPaintP75 firstContentfulPaintP75 timeToFirstByteP75}}}}}`,
    v: { accountTag: acct, siteTag: site, date_geq: geq, date_leq: leq },
    s: (d) => { const r = d.viewer.accounts?.[0]?.r?.[0]; const q = r?.quantiles; return `samples=${r?.count ?? 0} | LCP=${q?.largestContentfulPaintP75 ?? 'n/a'} CLS=${q?.cumulativeLayoutShiftP75 ?? 'n/a'} INP=${q?.interactionToNextPaintP75 ?? 'n/a'} FCP=${q?.firstContentfulPaintP75 ?? 'n/a'} TTFB=${q?.timeToFirstByteP75 ?? 'n/a'}`; },
  },
];

for (const p of probes) {
  const r = await gql(p.q, p.v);
  console.log((r.ok ? '✅ ' : '❌ ') + p.name);
  console.log('   ' + (r.ok ? p.s(r.d) : r.e.join(' | ')));
  console.log();
}
