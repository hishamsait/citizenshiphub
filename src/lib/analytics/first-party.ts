import type { Db } from '../db/client';
import * as events from '../db/events';
import * as leads from '../db/leads';
import { sinceSql, type TimeRange } from './types';

export interface OverviewData {
  pageviews: number;
  visitors: number;
  leads: number;
  conversionRate: number | null;
  series: { day: string; views: number; leads: number }[];
  topPages: events.PathStat[];
  topCountries: events.CountryStat[];
  devices: events.DeviceStat[];
  engagement: events.EngagementStats;
  sources: events.SourceStat[];
}

export interface ContentData {
  totalCountries: number;
  totalGuides: number;
  coveragePct: number;
  withoutGuides: number;
  latestGeneratedAt: string | null;
  topGuides: { slug: string; name: string; views: number }[];
}

export interface PagesData {
  total: number;
  rows: { path: string; views: number; uniques: number; share: number }[];
}

export interface VitalMetric {
  metric: string;
  p75: number | null;
  samples: number;
}

export interface PerformanceData {
  metrics: VitalMetric[];
  byDevice: { device: string; metrics: { metric: string; p75: number | null }[] }[];
  distribution: { metric: string; good: number; needsImprovement: number; poor: number }[];
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

async function buildSeries(
  db: Db,
  since: string,
): Promise<{ day: string; views: number; leads: number }[]> {
  const [views, leadDays] = await Promise.all([
    events.pageviewsByDay(db, since),
    leads.leadsByDay(db, since),
  ]);
  const leadMap = new Map(leadDays.map((d) => [d.day, d.count]));
  return views.map((v) => ({ day: v.day, views: v.views, leads: leadMap.get(v.day) ?? 0 }));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

const VITAL_BOUNDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

function roundVital(metric: string, value: number): number {
  if (metric === 'CLS') return Math.round(value * 1000) / 1000;
  return Math.round(value);
}

async function guideConversion(
  db: Db,
  since: string,
): Promise<{ iso2: string; slug: string; name: string; views: number; leads: number; conversion: number }[]> {
  const guides = await db
    .prepare(`SELECT g.iso2, g.slug, c.name FROM country_guides g JOIN countries c ON c.iso2 = g.iso2`)
    .all<{ iso2: string; slug: string; name: string }>();
  const isoBySlug = new Map(guides.results.map((g) => [g.slug, g.iso2]));
  const slugByIso = new Map(guides.results.map((g) => [g.iso2, g.slug]));
  const nameByIso = new Map(guides.results.map((g) => [g.iso2, g.name]));

  const viewsByIso = new Map<string, number>();
  const paths = await events.topPaths(db, since, 500);
  for (const p of paths) {
    if (!p.path.startsWith('/countries/')) continue;
    const slug = p.path.slice('/countries/'.length).split('?')[0].replace(/\/$/, '');
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

export const firstPartyProvider: AnalyticsProvider = {
  async overview(db, range) {
    const since = sinceSql(range.days);
    const [pageviews, visitors, leadCount, series, topPages, topCountries, devices, engagement, sources] =
      await Promise.all([
        events.countPageviews(db, since),
        events.countUniqueVisitors(db, since),
        leads.countLeads(db, since),
        buildSeries(db, since),
        events.topPaths(db, since, 8),
        events.pageviewsByCountry(db, since),
        events.pageviewsByDevice(db, since),
        events.engagementStats(db, since),
        events.trafficSources(db, since),
      ]);

    return {
      pageviews,
      visitors,
      leads: leadCount,
      conversionRate: visitors > 0 ? (leadCount / visitors) * 100 : null,
      series,
      topPages,
      topCountries,
      devices,
      engagement,
      sources,
    };
  },

  async content(db, range) {
    const since = sinceSql(range.days);
    const [totalCountries, totalGuides, withoutGuides, latest, guideRows, topPaths] =
      await Promise.all([
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
        events.topPaths(db, since, 200),
      ]);

    const nameBySlug = new Map(guideRows.results.map((g) => [g.slug, g.name]));
    const seen = new Set<string>();
    const topGuides: { slug: string; name: string; views: number }[] = [];

    for (const row of topPaths) {
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
    };
  },

  async pages(db, range) {
    const since = sinceSql(range.days);
    const rows = await events.topPaths(db, since, 50);
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

  async performance(db, range) {
    const since = sinceSql(range.days);
    const [values, byDeviceRows] = await Promise.all([
      events.webVitalValues(db, since),
      events.webVitalValuesByDevice(db, since),
    ]);

    const byMetric = new Map<string, number[]>();
    for (const v of values) {
      const arr = byMetric.get(v.metric) ?? [];
      arr.push(v.value);
      byMetric.set(v.metric, arr);
    }

    const metricKeys = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP'];
    const metrics: VitalMetric[] = metricKeys.map((metric) => {
      const arr = byMetric.get(metric) ?? [];
      const p75 = arr.length ? percentile(arr, 75) : null;
      return {
        metric,
        p75: p75 === null ? null : roundVital(metric, p75),
        samples: arr.length,
      };
    });

    const deviceMap = new Map<string, Map<string, number[]>>();
    for (const row of byDeviceRows) {
      const metricMap = deviceMap.get(row.device) ?? new Map<string, number[]>();
      const arr = metricMap.get(row.metric) ?? [];
      arr.push(row.value);
      metricMap.set(row.metric, arr);
      deviceMap.set(row.device, metricMap);
    }
    const byDevice = [...deviceMap.entries()].map(([device, metricMap]) => ({
      device,
      metrics: metricKeys.map((metric) => {
        const arr = metricMap.get(metric) ?? [];
        const p75 = arr.length ? percentile(arr, 75) : null;
        return { metric, p75: p75 === null ? null : roundVital(metric, p75) };
      }),
    }));

    const distribution = metricKeys.map((metric) => {
      const arr = byMetric.get(metric) ?? [];
      const [good, needs] = VITAL_BOUNDS[metric] ?? [0, 0];
      let goodCount = 0;
      let needsCount = 0;
      let poorCount = 0;
      for (const v of arr) {
        if (v <= good) goodCount += 1;
        else if (v <= needs) needsCount += 1;
        else poorCount += 1;
      }
      return { metric, good: goodCount, needsImprovement: needsCount, poor: poorCount };
    });

    return { metrics, byDevice, distribution };
  },

  async acquisition(db, range) {
    const since = sinceSql(range.days);
    const [sources, campaigns] = await Promise.all([
      events.trafficSources(db, since),
      events.utmBreakdown(db, since),
    ]);
    return { sources, campaigns };
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
    const [velocity, matrix, geo, leadSources, topGuides] = await Promise.all([
      leads.leadPipelineVelocity(db),
      leads.leadsByServiceCountry(db, since),
      leads.leadsByVisitorCountry(db, since),
      leads.leadSourceBreakdown(db, since),
      guideConversion(db, since),
    ]);
    return { velocity, matrix, geo, leadSources, topGuides };
  },
};

function guideSlugFromPath(path: string): string | null {
  if (!path.startsWith('/countries/')) return null;
  const slug = path.slice('/countries/'.length).split('?')[0].replace(/\/$/, '');
  return slug || null;
}
