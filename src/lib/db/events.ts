import type { Db } from './client';
import { categorizeReferrer } from '../utils';

export type EventType = 'pageview' | 'search' | 'lead_open' | 'web_vital' | 'scroll_depth' | 'custom';

export interface EventInput {
  sessionId: string;
  type: EventType;
  path?: string | null;
  referrer?: string | null;
  country?: string | null;
  device?: string | null;
  metric?: string | null;
  value?: number | null;
  properties?: Record<string, unknown> | null;
}

export async function insertEvent(db: Db, input: EventInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events (session_id, type, path, referrer, country, device, metric, value, properties)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.sessionId,
      input.type,
      input.path ?? null,
      input.referrer ?? null,
      input.country ?? null,
      input.device ?? null,
      input.metric ?? null,
      input.value ?? null,
      input.properties ? JSON.stringify(input.properties) : null,
    )
    .run();
}

export interface DayCount {
  day: string;
  views: number;
}

export interface PathStat {
  path: string;
  views: number;
  uniques: number;
}

export interface CountryStat {
  country: string;
  views: number;
}

export interface DeviceStat {
  device: string;
  views: number;
}

export interface VitalValue {
  metric: string;
  value: number;
}

export async function countPageviews(db: Db, since: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'pageview' AND created_at >= ?`)
    .bind(since)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function countUniqueVisitors(db: Db, since: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'pageview' AND created_at >= ?`)
    .bind(since)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function pageviewsByDay(db: Db, since: string): Promise<DayCount[]> {
  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND created_at >= ?
       GROUP BY strftime('%Y-%m-%d', created_at)
       ORDER BY day ASC`,
    )
    .bind(since)
    .all<DayCount>();
  return results;
}

export async function topPaths(db: Db, since: string, limit = 10): Promise<PathStat[]> {
  const { results } = await db
    .prepare(
      `SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS uniques
       FROM events
       WHERE type = 'pageview' AND created_at >= ? AND path IS NOT NULL
       GROUP BY path
       ORDER BY views DESC
       LIMIT ?`,
    )
    .bind(since, limit)
    .all<PathStat>();
  return results;
}

export async function pageviewsByCountry(db: Db, since: string): Promise<CountryStat[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND created_at >= ?
       GROUP BY COALESCE(country, 'Unknown')
       ORDER BY views DESC`,
    )
    .bind(since)
    .all<CountryStat>();
  return results;
}

export async function pageviewsByDevice(db: Db, since: string): Promise<DeviceStat[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(device, 'other') AS device, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND created_at >= ?
       GROUP BY COALESCE(device, 'other')
       ORDER BY views DESC`,
    )
    .bind(since)
    .all<DeviceStat>();
  return results;
}

const VITAL_METRIC_KEYS = ['LCP', 'CLS', 'INP', 'FCP', 'TTFB'] as const;

interface VitalRow {
  metric: string | null;
  value: number | null;
  properties: string | null;
}

/** Expand a single events row into one sample per reported web-vital metric.
 *  New payloads store every metric in `properties.metrics` (one row per page);
 *  legacy rows store one metric/value per row. Both are supported. */
function expandVitalSamples(row: VitalRow): VitalValue[] {
  if (row.properties) {
    try {
      const parsed = JSON.parse(row.properties) as Record<string, unknown>;
      const metrics = parsed.metrics as Record<string, unknown> | undefined;
      if (metrics && typeof metrics === 'object') {
        const out: VitalValue[] = [];
        for (const key of VITAL_METRIC_KEYS) {
          const v = metrics[key];
          if (typeof v === 'number' && Number.isFinite(v)) out.push({ metric: key, value: v });
        }
        if (out.length > 0) return out;
      }
    } catch {
      // Fall through to the legacy column format.
    }
  }
  if (row.metric && typeof row.value === 'number') {
    return [{ metric: row.metric, value: row.value }];
  }
  return [];
}

export async function webVitalValues(db: Db, since: string): Promise<VitalValue[]> {
  const { results } = await db
    .prepare(
      `SELECT metric, value, properties
       FROM events
       WHERE type = 'web_vital' AND created_at >= ? AND (metric IS NOT NULL OR properties IS NOT NULL)`,
    )
    .bind(since)
    .all<VitalRow>();
  return results.flatMap(expandVitalSamples);
}

export interface SourceStat {
  source: string;
  views: number;
}

/** Coarse acquisition sources derived from the pageview `referrer` column. */
export async function trafficSources(db: Db, since: string): Promise<SourceStat[]> {
  const { results } = await db
    .prepare(
      `SELECT referrer, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND created_at >= ?
       GROUP BY referrer
       ORDER BY views DESC`,
    )
    .bind(since)
    .all<{ referrer: string | null; views: number }>();

  const buckets = new Map<string, number>();
  for (const row of results) {
    const source = categorizeReferrer(row.referrer);
    buckets.set(source, (buckets.get(source) ?? 0) + row.views);
  }
  return [...buckets.entries()]
    .map(([source, views]) => ({ source, views }))
    .sort((a, b) => b.views - a.views);
}

export interface EngagementStats {
  pagesPerSession: number | null;
  bounceRate: number | null;
  returningRate: number | null;
  newSessions: number;
  returningSessions: number;
}

/** Pages/session, bounce rate and new-vs-returning from the session_id column. */
export async function engagementStats(db: Db, since: string): Promise<EngagementStats> {
  const [pv, sessions, bounce, returning] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'pageview' AND created_at >= ?`).bind(since).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'pageview' AND created_at >= ?`).bind(since).first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT session_id FROM events WHERE type = 'pageview' AND created_at >= ?
           GROUP BY session_id HAVING COUNT(*) = 1
         )`,
      )
      .bind(since)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT session_id FROM events WHERE type = 'pageview' AND created_at >= ?
           GROUP BY session_id HAVING COUNT(DISTINCT strftime('%Y-%m-%d', created_at)) > 1
         )`,
      )
      .bind(since)
      .first<{ n: number }>(),
  ]);

  const pageviews = pv?.n ?? 0;
  const sessionCount = sessions?.n ?? 0;
  const bounceCount = bounce?.n ?? 0;
  const returningCount = returning?.n ?? 0;

  return {
    pagesPerSession: sessionCount > 0 ? pageviews / sessionCount : null,
    bounceRate: sessionCount > 0 ? (bounceCount / sessionCount) * 100 : null,
    returningRate: sessionCount > 0 ? (returningCount / sessionCount) * 100 : null,
    newSessions: sessionCount - returningCount,
    returningSessions: returningCount,
  };
}

export interface UtmStat {
  source: string;
  medium: string;
  campaign: string;
  views: number;
}

/** UTM campaign breakdown from the pageview `properties` JSON column. */
export async function utmBreakdown(db: Db, since: string): Promise<UtmStat[]> {
  const { results } = await db
    .prepare(
      `SELECT properties, COUNT(*) AS views
       FROM events
       WHERE type = 'pageview' AND created_at >= ? AND properties IS NOT NULL
       GROUP BY properties`,
    )
    .bind(since)
    .all<{ properties: string; views: number }>();

  const map = new Map<string, UtmStat>();
  for (const row of results) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(row.properties) as Record<string, unknown>;
    } catch {
      continue;
    }
    const source = typeof parsed.utm_source === 'string' ? parsed.utm_source : '';
    const medium = typeof parsed.utm_medium === 'string' ? parsed.utm_medium : '';
    const campaign = typeof parsed.utm_campaign === 'string' ? parsed.utm_campaign : '';
    if (!source && !medium && !campaign) continue;
    const key = `${source}|${medium}|${campaign}`;
    const existing = map.get(key) ?? { source, medium, campaign, views: 0 };
    existing.views += row.views;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
}

export interface SearchQueryStat {
  query: string;
  count: number;
  noResults: number;
}

export interface SearchStats {
  total: number;
  noResults: number;
  noResultRate: number | null;
  queries: SearchQueryStat[];
}

/** Aggregate on-site search events (query + result count stored in properties). */
export async function searchStats(db: Db, since: string): Promise<SearchStats> {
  const { results } = await db
    .prepare(
      `SELECT properties FROM events WHERE type = 'search' AND created_at >= ? AND properties IS NOT NULL`,
    )
    .bind(since)
    .all<{ properties: string }>();

  const map = new Map<string, SearchQueryStat>();
  let total = 0;
  let noResults = 0;

  for (const row of results) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(row.properties) as Record<string, unknown>;
    } catch {
      continue;
    }
    const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
    if (!query) continue;
    const resCount = typeof parsed.results === 'number' ? parsed.results : null;
    total += 1;
    if (resCount === 0) noResults += 1;

    const cur = map.get(query) ?? { query, count: 0, noResults: 0 };
    cur.count += 1;
    if (resCount === 0) cur.noResults += 1;
    map.set(query, cur);
  }

  return {
    total,
    noResults,
    noResultRate: total > 0 ? (noResults / total) * 100 : null,
    queries: [...map.values()].sort((a, b) => b.count - a.count).slice(0, 25),
  };
}

export async function countEventsByType(db: Db, since: string, type: EventType): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE type = ? AND created_at >= ?`)
    .bind(type, since)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Count `custom` events whose `properties.action` matches (e.g. 'lead_submit'). */
export async function countCustomAction(db: Db, since: string, action: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT properties FROM events WHERE type = 'custom' AND created_at >= ? AND properties IS NOT NULL`,
    )
    .bind(since)
    .all<{ properties: string }>();
  return results.filter((row) => {
    try {
      const parsed = JSON.parse(row.properties) as Record<string, unknown>;
      return parsed.action === action;
    } catch {
      return false;
    }
  }).length;
}

export interface VitalValueByDevice {
  device: string;
  metric: string;
  value: number;
}

/** Raw web-vital samples annotated with device for p75-per-device aggregation. */
export async function webVitalValuesByDevice(db: Db, since: string): Promise<VitalValueByDevice[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(device, 'other') AS device, metric, value, properties
       FROM events
       WHERE type = 'web_vital' AND created_at >= ? AND (metric IS NOT NULL OR properties IS NOT NULL)`,
    )
    .bind(since)
    .all<VitalRow & { device: string }>();
  const out: VitalValueByDevice[] = [];
  for (const row of results) {
    for (const sample of expandVitalSamples(row)) {
      out.push({ device: row.device, metric: sample.metric, value: sample.value });
    }
  }
  return out;
}
