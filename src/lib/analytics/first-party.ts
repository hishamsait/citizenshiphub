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

export interface PerformanceData {
  metrics: { metric: string; p75: number | null; samples: number }[];
}

export interface SearchConsoleData {
  configured: boolean;
}

export interface AnalyticsProvider {
  overview(db: Db, range: TimeRange): Promise<OverviewData>;
  content(db: Db, range: TimeRange): Promise<ContentData>;
  pages(db: Db, range: TimeRange): Promise<PagesData>;
  performance(db: Db, range: TimeRange): Promise<PerformanceData>;
  searchConsole(db: Db, range: TimeRange): Promise<SearchConsoleData>;
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

export const firstPartyProvider: AnalyticsProvider = {
  async overview(db, range) {
    const since = sinceSql(range.days);
    const [pageviews, visitors, leadCount, series, topPages, topCountries, devices] =
      await Promise.all([
        events.countPageviews(db, since),
        events.countUniqueVisitors(db, since),
        leads.countLeads(db, since),
        buildSeries(db, since),
        events.topPaths(db, since, 8),
        events.pageviewsByCountry(db, since),
        events.pageviewsByDevice(db, since),
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
    const values = await events.webVitalValues(db, since);
    const byMetric = new Map<string, number[]>();
    for (const v of values) {
      const arr = byMetric.get(v.metric) ?? [];
      arr.push(v.value);
      byMetric.set(v.metric, arr);
    }
    const metrics = ['LCP', 'CLS', 'INP', 'TTFB'].map((metric) => {
      const arr = byMetric.get(metric) ?? [];
      const p75 = arr.length ? percentile(arr, 75) : null;
      return {
        metric,
        p75: p75 === null ? null : metric === 'CLS' ? Math.round(p75 * 1000) / 1000 : Math.round(p75),
        samples: arr.length,
      };
    });
    return { metrics };
  },

  async searchConsole() {
    return { configured: false };
  },
};

function guideSlugFromPath(path: string): string | null {
  if (!path.startsWith('/countries/')) return null;
  const slug = path.slice('/countries/'.length).split('?')[0].replace(/\/$/, '');
  return slug || null;
}
