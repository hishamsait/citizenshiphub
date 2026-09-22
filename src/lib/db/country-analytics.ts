import type { Db } from './client';

export interface ServiceCount {
  label: string;
  count: number;
}

export interface DeviceCount {
  device: string;
  views: number;
}

export interface ScrollDepthStats {
  samples: number;
  avg: number | null;
  reached50: number | null;
  reached75: number | null;
  reached100: number | null;
}

export interface CountryAnalytics {
  views: number;
  visitors: number;
  leads: number;
  conversion: number | null;
  leadsByService: ServiceCount[];
  scrollDepth: ScrollDepthStats;
  devices: DeviceCount[];
}

async function getLeads(db: Db, iso2: string): Promise<{ leads: number; leadsByService: ServiceCount[] }> {
  const [leadRow, byService] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE target_country_iso = ?`).bind(iso2).first<{ n: number }>(),
    db
      .prepare(
        `SELECT service_type AS label, COUNT(*) AS count
         FROM leads WHERE target_country_iso = ?
         GROUP BY service_type ORDER BY count DESC`,
      )
      .bind(iso2)
      .all<ServiceCount>(),
  ]);
  return { leads: leadRow?.n ?? 0, leadsByService: byService.results };
}

async function countPathViews(db: Db, paths: [string, string]): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'pageview' AND (path = ? OR path = ?)`)
    .bind(paths[0], paths[1])
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function countPathVisitors(db: Db, paths: [string, string]): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'pageview' AND (path = ? OR path = ?)`)
    .bind(paths[0], paths[1])
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function pathDevices(db: Db, paths: [string, string]): Promise<DeviceCount[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(device, 'other') AS device, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND (path = ? OR path = ?)
       GROUP BY COALESCE(device, 'other') ORDER BY views DESC`,
    )
    .bind(paths[0], paths[1])
    .all<DeviceCount>();
  return results;
}

async function pathScroll(db: Db, paths: [string, string]): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT value FROM events
       WHERE type = 'scroll_depth' AND (path = ? OR path = ?) AND value IS NOT NULL`,
    )
    .bind(paths[0], paths[1])
    .all<{ value: number }>();
  return results.map((r) => r.value);
}

export async function getCountryAnalytics(db: Db, iso2: string): Promise<CountryAnalytics> {
  const country = await db.prepare('SELECT slug FROM countries WHERE iso2 = ?').bind(iso2).first<{ slug: string | null }>();
  const slug = country?.slug ?? null;
  const leadsData = await getLeads(db, iso2);

  if (!slug) {
    return {
      views: 0,
      visitors: 0,
      leads: leadsData.leads,
      conversion: null,
      leadsByService: leadsData.leadsByService,
      scrollDepth: { samples: 0, avg: null, reached50: null, reached75: null, reached100: null },
      devices: [],
    };
  }

  const paths: [string, string] = [`/countries/${slug}`, `/countries/${slug}/`];
  const [views, visitors, devices, scroll] = await Promise.all([
    countPathViews(db, paths),
    countPathVisitors(db, paths),
    pathDevices(db, paths),
    pathScroll(db, paths),
  ]);

  const samples = scroll.length;
  const avg = samples > 0 ? scroll.reduce((a, b) => a + b, 0) / samples : null;
  const reaching = (threshold: number): number | null =>
    samples > 0 ? (scroll.filter((v) => v >= threshold).length / samples) * 100 : null;

  return {
    views,
    visitors,
    leads: leadsData.leads,
    conversion: visitors > 0 ? (leadsData.leads / visitors) * 100 : null,
    leadsByService: leadsData.leadsByService,
    scrollDepth: {
      samples,
      avg,
      reached50: reaching(50),
      reached75: reaching(75),
      reached100: reaching(100),
    },
    devices,
  };
}

export interface CountryAnalyticsSummary {
  views: number;
  leads: number;
  scrollAvg: number | null;
}

function slugFromPath(path: string): string {
  return path.slice('/countries/'.length).replace(/\/$/, '').split('?')[0];
}

/** Bulk per-country analytics for the Countries list table (one pass, no N+1). */
export async function listCountriesAnalytics(db: Db): Promise<Record<string, CountryAnalyticsSummary>> {
  const guides = await db.prepare('SELECT iso2, slug FROM country_guides').all<{ iso2: string; slug: string }>();
  const isoBySlug = new Map(guides.results.map((g) => [g.slug, g.iso2]));

  const summary: Record<string, CountryAnalyticsSummary> = {};
  const empty = (): CountryAnalyticsSummary => ({ views: 0, leads: 0, scrollAvg: null });
  const get = (iso2: string) => summary[iso2] ?? (summary[iso2] = empty());

  const views = await db
    .prepare(`SELECT path, COUNT(*) AS views FROM events WHERE type = 'pageview' AND path LIKE '/countries/%' GROUP BY path`)
    .all<{ path: string; views: number }>();
  for (const row of views.results) {
    const iso2 = isoBySlug.get(slugFromPath(row.path));
    if (iso2) get(iso2).views += row.views;
  }

  const leads = await db
    .prepare(`SELECT target_country_iso AS iso2, COUNT(*) AS n FROM leads GROUP BY target_country_iso`)
    .all<{ iso2: string; n: number }>();
  for (const row of leads.results) {
    if (row.iso2) get(row.iso2).leads += row.n;
  }

  const scroll = await db
    .prepare(`SELECT path, value FROM events WHERE type = 'scroll_depth' AND path LIKE '/countries/%' AND value IS NOT NULL`)
    .all<{ path: string; value: number }>();
  const scrollAgg: Record<string, { total: number; count: number }> = {};
  for (const row of scroll.results) {
    const iso2 = isoBySlug.get(slugFromPath(row.path));
    if (!iso2) continue;
    const agg = scrollAgg[iso2] ?? (scrollAgg[iso2] = { total: 0, count: 0 });
    agg.total += row.value;
    agg.count += 1;
  }
  for (const [iso2, agg] of Object.entries(scrollAgg)) {
    get(iso2).scrollAvg = agg.count > 0 ? agg.total / agg.count : null;
  }

  return summary;
}
