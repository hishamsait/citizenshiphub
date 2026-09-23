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

// Shared stat shapes. `PathStat`/`CountryStat`/`DeviceStat`/`SourceStat` are now
// produced by the Cloudflare GraphQL provider (src/lib/analytics/cloudflare.ts)
// rather than by the removed first-party pageview readers.
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

export interface SourceStat {
  source: string;
  views: number;
}

export interface UtmStat {
  source: string;
  medium: string;
  campaign: string;
  views: number;
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

/**
 * UTM campaign breakdown from first-party `custom` events (action === 'utm').
 * These are recorded by middleware only when a landing request carries UTM
 * params, so write volume stays negligible while preserving campaign
 * attribution now that pageviews live in Cloudflare instead of D1.
 */
export async function utmBreakdown(db: Db, since: string): Promise<UtmStat[]> {
  const { results } = await db
    .prepare(
      `SELECT properties FROM events WHERE type = 'custom' AND created_at >= ? AND properties IS NOT NULL`,
    )
    .bind(since)
    .all<{ properties: string }>();

  const map = new Map<string, UtmStat>();
  for (const row of results) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(row.properties) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (parsed.action !== 'utm') continue;
    const source = typeof parsed.utm_source === 'string' ? parsed.utm_source : '';
    const medium = typeof parsed.utm_medium === 'string' ? parsed.utm_medium : '';
    const campaign = typeof parsed.utm_campaign === 'string' ? parsed.utm_campaign : '';
    if (!source && !medium && !campaign) continue;
    const key = `${source}|${medium}|${campaign}`;
    const existing = map.get(key) ?? { source, medium, campaign, views: 0 };
    existing.views += 1;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
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
