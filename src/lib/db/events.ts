import type { Db } from './client';

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

export async function webVitalValues(db: Db, since: string): Promise<VitalValue[]> {
  const { results } = await db
    .prepare(
      `SELECT metric, value
       FROM events
       WHERE type = 'web_vital' AND created_at >= ? AND metric IS NOT NULL AND value IS NOT NULL`,
    )
    .bind(since)
    .all<VitalValue>();
  return results;
}
