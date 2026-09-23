import type { PathStat, CountryStat, DeviceStat, SourceStat } from '../db/events';
import { categorizeReferrer } from '../utils';

/**
 * Cloudflare GraphQL Analytics provider.
 *
 * Citizenship Hub is deployed entirely on Cloudflare (Pages + Workers + D1), so
 * the high-volume traffic signals — pageviews, unique visitors, top paths,
 * geography and device split — are read straight from Cloudflare's GraphQL
 * Analytics API instead of being recorded into D1. This removes ~95%+ of the
 * write load on the `events` table.
 *
 * Field names were verified against the live schema via introspection:
 *   - `httpRequests1dGroups`  → totals (`pageViews`, `requests`, `uniques`) and
 *     the daily series (its only dimension is `date`).
 *   - `httpRequestsAdaptiveGroups` → path / country / device grouping via
 *     `clientRequestPath`, `clientCountryName`, `clientDeviceType` and
 *     `sum { visits }`. NOTE: this dataset caps time ranges at ~4w2d.
 *   - Referrer host comes from the *account* RUM dataset
 *     (`rumPageloadEventsAdaptiveGroups.refererHost`) via Web Analytics.
 *   - Core Web Vitals also live under the *account* (`rumWebVitalsEventsAdaptiveGroups`);
 *     both require a Web Analytics `siteTag` (CF_SITE_TAG) + account
 *     `Account Analytics Read`.
 *
 * The client degrades gracefully (returns zeros/empty) whenever the config is
 * missing, a query fails, or an expected field is absent.
 */

export interface CloudflareAnalyticsEnv {
  CF_API_TOKEN?: string;
  CF_ANALYTICS_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ZONE_ID?: string;
  CF_SITE_TAG?: string;
  /** Fallbacks so a single existing Cloudflare token/account can be reused. */
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

export interface CloudflareConfig {
  apiToken: string;
  accountId: string;
  zoneId: string;
  siteTag?: string;
}

export interface VitalMetric {
  metric: string;
  p75: number | null;
  samples: number;
}

export interface CloudflareTraffic {
  /** False when the token/zone are not configured (caller can show a hint). */
  configured: boolean;
  pageviews: number;
  visitors: number;
  series: { day: string; views: number }[];
  topPaths: PathStat[];
  countries: CountryStat[];
  devices: DeviceStat[];
  sources: SourceStat[];
  performance: {
    metrics: VitalMetric[];
    byDevice: { device: string; metrics: VitalMetric[] }[];
  };
  /** Total HTTP requests in the window (context for the cache ratio). */
  requests: number;
  /** Security threats blocked by Cloudflare. */
  threats: number;
  /** Cache / bandwidth totals. */
  cache: { bytes: number; cachedRequests: number; cachedBytes: number };
  /** End-user vs Cloudflare-internal traffic split. */
  requestSources: { source: string; views: number }[];
  /** Browser breakdown (user-agent). */
  browsers: { browser: string; views: number }[];
  /** OS breakdown (user-agent). */
  oss: { os: string; views: number }[];
  /** Edge response status codes. */
  statusCodes: { status: number; views: number }[];
  /** Paths that returned 404 (content gaps). */
  notFoundPaths: { path: string; views: number }[];
  /** Country × path cross-tab (destination demand by country). */
  geoDestination: { country: string; path: string; views: number }[];
}

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
/** The adaptive (path/geo/device) dataset rejects ranges wider than ~4w2d. */
const ADAPTIVE_MAX_DAYS = 28;

/** Read the optional Cloudflare analytics config from runtime env vars. */
export function cfConfigFromEnv(env: CloudflareAnalyticsEnv | undefined | null): CloudflareConfig | null {
  const apiToken = env?.CF_API_TOKEN?.trim() || env?.CF_ANALYTICS_API_TOKEN?.trim() || env?.CLOUDFLARE_API_TOKEN?.trim() || '';
  const accountId = env?.CF_ACCOUNT_ID?.trim() || env?.CLOUDFLARE_ACCOUNT_ID?.trim() || '';
  const zoneId = env?.CF_ZONE_ID?.trim() || '';
  const siteTag = env?.CF_SITE_TAG?.trim() || undefined;
  if (!apiToken || !zoneId) return null;
  return { apiToken, accountId, zoneId, siteTag };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface GraphQlResponse {
  data?: unknown;
  errors?: unknown[];
}

async function requestGraphql(
  config: CloudflareConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GraphQlResponse;
    if (json.errors && json.errors.length > 0) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

const ROLLUP_QUERY = `
query ZoneRollup($zoneTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      totals: httpRequests1dGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, limit: 1) {
        sum { pageViews requests bytes cachedRequests cachedBytes threats }
        uniq { uniques }
      }
      series: httpRequests1dGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [date_ASC], limit: 100) {
        sum { pageViews }
        dimensions { date }
      }
    }
  }
}`;

const ADAPTIVE_QUERY = `
query ZoneAdaptive($zoneTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
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
      requestSources: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, limit: 10) {
        sum { visits }
        dimensions { requestSource }
      }
      browsers: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 10) {
        sum { visits }
        dimensions { userAgentBrowser }
      }
      oss: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 10) {
        sum { visits }
        dimensions { userAgentOS }
      }
      statusCodes: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [count_DESC], limit: 20) {
        count
        dimensions { edgeResponseStatus }
      }
      geoDest: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq }, orderBy: [sum_visits_DESC], limit: 300) {
        sum { visits }
        dimensions { clientCountryName clientRequestPath }
      }
    }
  }
}`;

const NOT_FOUND_QUERY = `
query ZoneNotFound($zoneTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      notFound: httpRequestsAdaptiveGroups(filter: { date_geq: $date_geq, date_leq: $date_leq, edgeResponseStatus: 404 }, orderBy: [count_DESC], limit: 20) {
        count
        dimensions { clientRequestPath }
      }
    }
  }
}`;
const RUM_QUERY = `
query RumVitals($accountTag: String!, $siteTag: String!, $date_geq: Date!, $date_leq: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      pageLoads: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $date_geq, date_leq: $date_leq }, limit: 1) {
        count
        sum { visits }
      }
      referrers: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $date_geq, date_leq: $date_leq }, limit: 50) {
        count
        dimensions { refererHost }
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
      vitalsByDevice: rumWebVitalsEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $date_geq, date_leq: $date_leq }, limit: 100) {
        count
        quantiles {
          largestContentfulPaintP75
          cumulativeLayoutShiftP75
          interactionToNextPaintP75
          firstContentfulPaintP75
          timeToFirstByteP75
        }
        dimensions { deviceType }
      }
    }
  }
}`;

type RollupRow = {
  sum?: {
    pageViews?: number | null;
    requests?: number | null;
    bytes?: number | null;
    cachedRequests?: number | null;
    cachedBytes?: number | null;
    threats?: number | null;
  };
  uniq?: { uniques?: number | null };
  dimensions?: { date?: string | null };
};

type AdaptiveRow = {
  count?: number | null;
  sum?: { visits?: number | null };
  dimensions?: {
    clientRequestPath?: string | null;
    clientCountryName?: string | null;
    clientDeviceType?: string | null;
    requestSource?: string | null;
    userAgentBrowser?: string | null;
    userAgentOS?: string | null;
    edgeResponseStatus?: number | null;
  };
};

type Quantiles = {
  largestContentfulPaintP75?: number | null;
  cumulativeLayoutShiftP75?: number | null;
  interactionToNextPaintP75?: number | null;
  firstContentfulPaintP75?: number | null;
  timeToFirstByteP75?: number | null;
};

type RumRow = {
  count?: number | null;
  quantiles?: Quantiles | null;
  dimensions?: { deviceType?: string | null; refererHost?: string | null };
};

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const VITALS = [
  { metric: 'LCP', field: 'largestContentfulPaintP75' },
  { metric: 'CLS', field: 'cumulativeLayoutShiftP75' },
  { metric: 'INP', field: 'interactionToNextPaintP75' },
  { metric: 'FCP', field: 'firstContentfulPaintP75' },
  { metric: 'TTFB', field: 'timeToFirstByteP75' },
] as const;

function p75Of(q: Quantiles | null | undefined, field: (typeof VITALS)[number]['field']): number | null {
  const v = q?.[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const EMPTY: CloudflareTraffic = {
  configured: false,
  pageviews: 0,
  visitors: 0,
  series: [],
  topPaths: [],
  countries: [],
  devices: [],
  sources: [],
  performance: { metrics: [], byDevice: [] },
  requests: 0,
  threats: 0,
  cache: { bytes: 0, cachedRequests: 0, cachedBytes: 0 },
  requestSources: [],
  browsers: [],
  oss: [],
  statusCodes: [],
  notFoundPaths: [],
  geoDestination: [],
};
/**
 * Fetch a normalized traffic snapshot from Cloudflare for the given window.
 * Returns an all-zero/empty snapshot when not configured or when a query
 * fails — the Console renders "no data" rather than erroring.
 */
export async function fetchCloudflareTraffic(
  config: CloudflareConfig | null,
  rangeDays: number,
): Promise<CloudflareTraffic> {
  if (!config) return EMPTY;

  const now = new Date();
  const rollupGeq = dateStr(new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000));
  const adaptiveDays = Math.min(rangeDays, ADAPTIVE_MAX_DAYS);
  const adaptiveGeq = dateStr(new Date(now.getTime() - adaptiveDays * 24 * 60 * 60 * 1000));
  const dateLeq = dateStr(now);

  const rollupVars = { zoneTag: config.zoneId, date_geq: rollupGeq, date_leq: dateLeq };
  const adaptiveVars = { zoneTag: config.zoneId, date_geq: adaptiveGeq, date_leq: dateLeq };
  const rumVars = { accountTag: config.accountId, siteTag: config.siteTag ?? '', date_geq: adaptiveGeq, date_leq: dateLeq };

  const [rollupData, adaptiveData, notFoundData, rumData] = await Promise.all([
    requestGraphql(config, ROLLUP_QUERY, rollupVars),
    requestGraphql(config, ADAPTIVE_QUERY, adaptiveVars),
    requestGraphql(config, NOT_FOUND_QUERY, adaptiveVars),
    config.siteTag ? requestGraphql(config, RUM_QUERY, rumVars) : Promise.resolve(null),
  ]);

  const rollup = (rollupData as { viewer?: { zones?: { totals?: RollupRow[]; series?: RollupRow[] }[] } } | null)
    ?.viewer?.zones?.[0];
  const adaptive = (adaptiveData as { viewer?: { zones?: { topPaths?: AdaptiveRow[]; countries?: AdaptiveRow[]; devices?: AdaptiveRow[]; requestSources?: AdaptiveRow[]; browsers?: AdaptiveRow[]; oss?: AdaptiveRow[]; statusCodes?: AdaptiveRow[]; geoDest?: AdaptiveRow[] }[] } } | null)
    ?.viewer?.zones?.[0];
  const notFound = (notFoundData as { viewer?: { zones?: { notFound?: AdaptiveRow[] }[] } } | null)
    ?.viewer?.zones?.[0];
  const rum = (rumData as { viewer?: { accounts?: { pageLoads?: RumRow[]; vitals?: RumRow[]; vitalsByDevice?: RumRow[]; referrers?: RumRow[] }[] } } | null)
    ?.viewer?.accounts?.[0];

  const pageviews = num(rollup?.totals?.[0]?.sum?.pageViews);
  const visitors = num(rollup?.totals?.[0]?.uniq?.uniques);

  const series = (rollup?.series ?? [])
    .filter((s) => typeof s.dimensions?.date === 'string')
    .map((s) => ({ day: s.dimensions!.date as string, views: num(s.sum?.pageViews) }));

  const topPaths: PathStat[] = (adaptive?.topPaths ?? [])
    .filter((p) => typeof p.dimensions?.clientRequestPath === 'string')
    .map((p) => ({
      path: p.dimensions!.clientRequestPath as string,
      views: num(p.sum?.visits),
      uniques: 0,
    }));

  const countries: CountryStat[] = (adaptive?.countries ?? [])
    .filter((c) => typeof c.dimensions?.clientCountryName === 'string')
    .map((c) => ({ country: c.dimensions!.clientCountryName as string, views: num(c.sum?.visits) }));

  const devices: DeviceStat[] = (adaptive?.devices ?? [])
    .filter((d) => typeof d.dimensions?.clientDeviceType === 'string')
    .map((d) => ({ device: d.dimensions!.clientDeviceType as string, views: num(d.sum?.visits) }));

  const requests = num(rollup?.totals?.[0]?.sum?.requests);
  const threats = num(rollup?.totals?.[0]?.sum?.threats);
  const cache = {
    bytes: num(rollup?.totals?.[0]?.sum?.bytes),
    cachedRequests: num(rollup?.totals?.[0]?.sum?.cachedRequests),
    cachedBytes: num(rollup?.totals?.[0]?.sum?.cachedBytes),
  };

  const requestSources = (adaptive?.requestSources ?? [])
    .filter((r) => typeof r.dimensions?.requestSource === 'string')
    .map((r) => ({ source: r.dimensions!.requestSource as string, views: num(r.sum?.visits) }));

  const browsers = (adaptive?.browsers ?? [])
    .filter((b) => typeof b.dimensions?.userAgentBrowser === 'string')
    .map((b) => ({ browser: b.dimensions!.userAgentBrowser as string, views: num(b.sum?.visits) }));

  const oss = (adaptive?.oss ?? [])
    .filter((o) => typeof o.dimensions?.userAgentOS === 'string')
    .map((o) => ({ os: o.dimensions!.userAgentOS as string, views: num(o.sum?.visits) }));

  const statusCodes = (adaptive?.statusCodes ?? [])
    .filter((s) => typeof s.dimensions?.edgeResponseStatus === 'number')
    .map((s) => ({ status: s.dimensions!.edgeResponseStatus as number, views: num(s.count) }));

  const notFoundPaths = (notFound?.notFound ?? [])
    .filter((p) => typeof p.dimensions?.clientRequestPath === 'string')
    .map((p) => ({ path: p.dimensions!.clientRequestPath as string, views: num(p.count) }));

  const geoDestination = (adaptive?.geoDest ?? [])
    .filter(
      (g) => typeof g.dimensions?.clientCountryName === 'string' && typeof g.dimensions?.clientRequestPath === 'string',
    )
    .map((g) => ({
      country: g.dimensions!.clientCountryName as string,
      path: g.dimensions!.clientRequestPath as string,
      views: num(g.sum?.visits),
    }));

  // Bucket RUM (Web Analytics) referrer hosts into the coarse acquisition
  // sources (Google / Bing / Social / Direct / Other) for the traffic widget.
  const sourceMap = new Map<string, number>();
  for (const r of rum?.referrers ?? []) {
    const host = r.dimensions?.refererHost;
    const source = categorizeReferrer(host ? `https://${host}` : null);
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + num(r.count));
  }
  const sources: SourceStat[] = [...sourceMap.entries()]
    .map(([source, views]) => ({ source, views }))
    .sort((a, b) => b.views - a.views);

  const rumSamples = num(rum?.vitals?.[0]?.count);
  const metrics: VitalMetric[] = VITALS.map(({ metric, field }) => ({
    metric,
    p75: p75Of(rum?.vitals?.[0]?.quantiles, field),
    samples: rumSamples,
  }));

  const byDevice = (rum?.vitalsByDevice ?? [])
    .filter((d) => typeof d.dimensions?.deviceType === 'string')
    .map((d) => ({
      device: d.dimensions!.deviceType as string,
      metrics: VITALS.map(({ metric, field }) => ({
        metric,
        p75: p75Of(d.quantiles, field),
        samples: num(d.count),
      })),
    }));

  return {
    configured: true,
    pageviews,
    visitors,
    series,
    topPaths,
    countries,
    devices,
    sources,
    performance: { metrics, byDevice },
    requests,
    threats,
    cache,
    requestSources,
    browsers,
    oss,
    statusCodes,
    notFoundPaths,
    geoDestination,
  };
}

/**
 * Convenience: resolve config from env and fetch traffic in one step. Used by
 * the Console pages that have access to `Astro.locals.runtime.env`.
 */
export async function trafficFromEnv(
  env: CloudflareAnalyticsEnv | undefined | null,
  rangeDays: number,
): Promise<CloudflareTraffic> {
  return fetchCloudflareTraffic(cfConfigFromEnv(env), rangeDays);
}
