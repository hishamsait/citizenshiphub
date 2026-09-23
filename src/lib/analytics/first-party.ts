import type { Db } from '../db/client';
import * as events from '../db/events';
import * as leads from '../db/leads';
import { sinceSql, type TimeRange } from './types';
import {
  cfConfigFromEnv,
  fetchCloudflareTraffic,
  type CloudflareAnalyticsEnv,
  type CloudflareConfig,
  type VitalMetric,
} from './cloudflare';

export interface OverviewData {
  pageviews: number;
  visitors: number;
  leads: number;
  conversionRate: number | null;
  series: { day: string; views: number; leads: number }[];
  topPages: events.PathStat[];
  topCountries: events.CountryStat[];
  devices: events.DeviceStat[];
  sources: events.SourceStat[];
  threats: number;
  requestSources: { source: string; views: number }[];
  browsers: { browser: string; views: number }[];
  oss: { os: string; views: number }[];
  geoDestination: { country: string; path: string; views: number }[];
}

export interface ContentData {
  totalCountries: number;
  totalGuides: number;
  coveragePct: number;
  withoutGuides: number;
  latestGeneratedAt: string | null;
  topGuides: { slug: string; name: string; views: number }[];
  notFoundPaths: { path: string; views: number }[];
}

export interface PagesData {
  total: number;
  rows: { path: string; views: number; uniques: number; share: number }[];
}

export interface PerformanceData {
  metrics: VitalMetric[];
  byDevice: { device: string; metrics: VitalMetric[] }[];
  cache: { bytes: number; cachedRequests: number; cachedBytes: number; requests: number };
  statusCodes: { status: number; views: number }[];
}

export interface AcquisitionData {
  sources: events.SourceStat[];
  campaigns: events.UtmStat[];
}

export interface SearchAnalyticsData {
  total: number;
  noResults: number;
  noResultRate: number | null;
  queries: events.SearchQueryStat[];
}

export interface FunnelData {
  stages: { key: string; label: string; count: number }[];
  openToSubmitRate: number | null;
  submitToCaptureRate: number | null;
}

export interface LeadsAnalyticsData {
  velocity: leads.StatusTiming[];
  matrix: leads.ServiceCountry[];
  geo: leads.FieldCount[];
  leadSources: leads.FieldCount[];
  topGuides: { iso2: string; slug: string; name: string; views: number; leads: number; conversion: number }[];
}

export interface AnalyticsProvider {
  overview(db: Db, range: TimeRange): Promise<OverviewData>;
  content(db: Db, range: TimeRange): Promise<ContentData>;
  pages(db: Db, range: TimeRange): Promise<PagesData>;
  performance(db: Db, range: TimeRange): Promise<PerformanceData>;
  acquisition(db: Db, range: TimeRange): Promise<AcquisitionData>;
  search(db: Db, range: TimeRange): Promise<SearchAnalyticsData>;
  funnel(db: Db, range: TimeRange): Promise<FunnelData>;
  leadsAnalytics(db: Db, range: TimeRange): Promise<LeadsAnalyticsData>;
}

function guideSlugFromPath(path: string): string | null {
  if (!path.startsWith('/countries/')) return null;
  const slug = path.slice('/countries/'.length).split('?')[0].replace(/\/$/, '');
  return slug || null;
}

/**
 * Build the guide-conversion leaderboard from Cloudflare path views + D1 leads.
 */
async function guideConversion(
  db: Db,
  since: string,
  paths: events.PathStat[],
): Promise<{ iso2: string; slug: string; name: string; views: number; leads: number; conversion: number }[]> {
  const guides = await db
    .prepare(`SELECT g.iso2, g.slug, c.name FROM country_guides g JOIN countries c ON c.iso2 = g.iso2`)
    .all<{ iso2: string; slug: string; name: string }>();
  const isoBySlug = new Map(guides.results.map((g) => [g.slug, g.iso2]));
  const slugByIso = new Map(guides.results.map((g) => [g.iso2, g.slug]));
  const nameByIso = new Map(guides.results.map((g) => [g.iso2, g.name]));

  const viewsByIso = new Map<string, number>();
  for (const p of paths) {
    const slug = guideSlugFromPath(p.path);
    if (!slug) continue;
    const iso = isoBySlug.get(slug);
    if (iso) viewsByIso.set(iso, (viewsByIso.get(iso) ?? 0) + p.views);
  }

  const leadRows = await leads.leadsByCountry(db, since);
  const leadsByIso = new Map<string, number>();
  for (const r of leadRows) if (r.key) leadsByIso.set(r.key, r.count);

  const out: { iso2: string; slug: string; name: string; views: number; leads: number; conversion: number }[] = [];
  for (const [iso, views] of viewsByIso) {
    if (views === 0) continue;
    const leadCount = leadsByIso.get(iso) ?? 0;
    out.push({
      iso2: iso,
      slug: slugByIso.get(iso) ?? iso.toLowerCase(),
      name: nameByIso.get(iso) ?? iso,
      views,
      leads: leadCount,
      conversion: (leadCount / views) * 100,
    });
  }
  return out.sort((a, b) => b.views - a.views).slice(0, 12);
}
/**
 * The analytics provider is now a factory that closes over the resolved
 * Cloudflare config. Traffic/geo/device/referrer/CWV come from Cloudflare's
 * GraphQL Analytics API; leads, funnel, search and content coverage stay in D1.
 */
export function createAnalyticsProvider(env: CloudflareAnalyticsEnv | undefined): AnalyticsProvider {
  const cf: CloudflareConfig | null = cfConfigFromEnv(env);

  return {
    async overview(db, range) {
      const since = sinceSql(range.days);
      const [traffic, leadCount, leadDays] = await Promise.all([
        fetchCloudflareTraffic(cf, range.days),
        leads.countLeads(db, since),
        leads.leadsByDay(db, since),
      ]);
      const leadMap = new Map(leadDays.map((d) => [d.day, d.count]));
      const series = traffic.series.map((s) => ({ day: s.day, views: s.views, leads: leadMap.get(s.day) ?? 0 }));

      return {
        pageviews: traffic.pageviews,
        visitors: traffic.visitors,
        leads: leadCount,
        conversionRate: traffic.visitors > 0 ? (leadCount / traffic.visitors) * 100 : null,
        series,
        topPages: traffic.topPaths.slice(0, 8),
        topCountries: traffic.countries.slice(0, 8),
        devices: traffic.devices,
        sources: traffic.sources,
        threats: traffic.threats,
        requestSources: traffic.requestSources,
        browsers: traffic.browsers,
        oss: traffic.oss,
        geoDestination: traffic.geoDestination,
      };
    },

    async content(db, range) {
      const [traffic, totalCountries, totalGuides, withoutGuides, latest, guideRows] = await Promise.all([
        fetchCloudflareTraffic(cf, range.days),
        db.prepare(`SELECT COUNT(*) AS n FROM countries`).first<{ n: number }>(),
        db.prepare(`SELECT COUNT(*) AS n FROM country_guides`).first<{ n: number }>(),
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM countries c LEFT JOIN country_guides g ON g.iso2 = c.iso2 WHERE g.iso2 IS NULL`,
          )
          .first<{ n: number }>(),
        db.prepare(`SELECT MAX(generated_at) AS latest FROM dataset_meta`).first<{ latest: string | null }>(),
        db
          .prepare(`SELECT g.slug, c.name FROM country_guides g JOIN countries c ON c.iso2 = g.iso2`)
          .all<{ slug: string; name: string }>(),
      ]);

      const nameBySlug = new Map(guideRows.results.map((g) => [g.slug, g.name]));
      const seen = new Set<string>();
      const topGuides: { slug: string; name: string; views: number }[] = [];

      for (const row of traffic.topPaths) {
        if (seen.size >= 10) break;
        const slug = guideSlugFromPath(row.path);
        if (!slug || !nameBySlug.has(slug) || seen.has(slug)) continue;
        seen.add(slug);
        topGuides.push({ slug, name: nameBySlug.get(slug)!, views: row.views });
      }

      const countries = totalCountries?.n ?? 0;
      const guides = totalGuides?.n ?? 0;

      return {
        totalCountries: countries,
        totalGuides: guides,
        coveragePct: countries > 0 ? (guides / countries) * 100 : 0,
        withoutGuides: withoutGuides?.n ?? 0,
        latestGeneratedAt: latest?.latest ?? null,
        topGuides,
        notFoundPaths: traffic.notFoundPaths,
      };
    },

    async pages(_db, range) {
      const traffic = await fetchCloudflareTraffic(cf, range.days);
      const rows = traffic.topPaths.slice(0, 50);
      const total = rows.reduce((sum, r) => sum + r.views, 0);
      return {
        total,
        rows: rows.map((r) => ({
          path: r.path,
          views: r.views,
          uniques: r.uniques,
          share: total > 0 ? (r.views / total) * 100 : 0,
        })),
      };
    },

    async performance(_db, range) {
      const traffic = await fetchCloudflareTraffic(cf, range.days);
      return { ...traffic.performance, cache: { ...traffic.cache, requests: traffic.requests }, statusCodes: traffic.statusCodes };
    },

    async acquisition(db, range) {
      const since = sinceSql(range.days);
      const [traffic, campaigns] = await Promise.all([
        fetchCloudflareTraffic(cf, range.days),
        events.utmBreakdown(db, since),
      ]);
      return { sources: traffic.sources, campaigns };
    },

    async search(db, range) {
      const since = sinceSql(range.days);
      return events.searchStats(db, since);
    },

    async funnel(db, range) {
      const since = sinceSql(range.days);
      const [opens, submits, captured] = await Promise.all([
        events.countEventsByType(db, since, 'lead_open'),
        events.countCustomAction(db, since, 'lead_submit'),
        leads.countLeads(db, since),
      ]);
      const stages = [
        { key: 'open', label: 'Modal opened', count: opens },
        { key: 'submit', label: 'Form submitted', count: submits },
        { key: 'captured', label: 'Lead captured', count: captured },
      ];
      return {
        stages,
        openToSubmitRate: opens > 0 ? (submits / opens) * 100 : null,
        submitToCaptureRate: submits > 0 ? (captured / submits) * 100 : null,
      };
    },

    async leadsAnalytics(db, range) {
      const since = sinceSql(range.days);
      const [traffic, velocity, matrix, geo, leadSources] = await Promise.all([
        fetchCloudflareTraffic(cf, range.days),
        leads.leadPipelineVelocity(db),
        leads.leadsByServiceCountry(db, since),
        leads.leadsByVisitorCountry(db, since),
        leads.leadSourceBreakdown(db, since),
      ]);
      const topGuides = await guideConversion(db, since, traffic.topPaths);
      return { velocity, matrix, geo, leadSources, topGuides };
    },
  };
}
