import type { Db } from './client';
import { categorizeReferrer } from '../utils';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: number;
  email: string;
  name: string | null;
  targetCountryIso: string;
  targetCountryName: string | null;
  serviceType: string;
  status: string;
  createdAt: string;
}

export interface LeadFilters {
  q?: string;
  serviceType?: string;
  status?: string;
  targetCountryIso?: string;
}

export interface LeadPage {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const SELECT = `
  SELECT
    l.id, l.email, l.name,
    l.target_country_iso AS targetCountryIso,
    l.service_type AS serviceType,
    l.status,
    l.created_at AS createdAt,
    c.name AS targetCountryName
  FROM leads l
  LEFT JOIN countries c ON c.iso2 = l.target_country_iso`;

function buildWhere(filters: LeadFilters): { where: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (filters.q) {
    clauses.push('(l.email LIKE ? OR l.name LIKE ? OR c.name LIKE ?)');
    const like = `%${filters.q}%`;
    binds.push(like, like, like);
  }
  if (filters.serviceType) {
    clauses.push('l.service_type = ?');
    binds.push(filters.serviceType);
  }
  if (filters.status) {
    clauses.push('l.status = ?');
    binds.push(filters.status);
  }
  if (filters.targetCountryIso) {
    clauses.push('l.target_country_iso = ?');
    binds.push(filters.targetCountryIso.toUpperCase());
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

export async function listLeads(
  db: Db,
  filters: LeadFilters = {},
  page = 1,
  pageSize = 25,
): Promise<LeadPage> {
  const { where, binds } = buildWhere(filters);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l LEFT JOIN countries c ON c.iso2 = l.target_country_iso ${where}`,
    )
    .bind(...binds)
    .first<{ n: number }>();

  const total = countRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const { results } = await db
    .prepare(`${SELECT} ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (safePage - 1) * pageSize)
    .all<Lead>();

  return { leads: results, total, page: safePage, pageSize, totalPages };
}

export async function getLead(db: Db, id: number): Promise<Lead | null> {
  return db.prepare(`${SELECT} WHERE l.id = ?`).bind(id).first<Lead>();
}

function changed(result: { meta: Record<string, unknown> }): boolean {
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function setLeadStatus(db: Db, id: number, status: LeadStatus): Promise<boolean> {
  const stageColumns: Record<string, string> = {
    contacted: 'contacted_at',
    qualified: 'qualified_at',
    closed: 'closed_at',
  };
  const stage = stageColumns[status];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  // Record the first time a lead enters each pipeline stage (for velocity metrics).
  const sql = stage
    ? `UPDATE leads SET status = ?, status_updated_at = ?, ${stage} = COALESCE(${stage}, ?) WHERE id = ?`
    : `UPDATE leads SET status = ?, status_updated_at = ? WHERE id = ?`;
  const binds = stage ? [status, now, now, id] : [status, now, id];
  const result = await db.prepare(sql).bind(...binds).run();
  return changed(result);
}

export async function deleteLead(db: Db, id: number): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM leads WHERE id = ?`).bind(id).run();
  return changed(result);
}

export interface FieldCount {
  key: string;
  label: string;
  count: number;
}

export async function countLeads(db: Db, since: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?`)
    .bind(since)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function leadsByService(db: Db, since: string): Promise<FieldCount[]> {
  const { results } = await db
    .prepare(
      `SELECT service_type AS key, COUNT(*) AS count
       FROM leads WHERE created_at >= ?
       GROUP BY service_type ORDER BY count DESC`,
    )
    .bind(since)
    .all<{ key: string; count: number }>();
  return results.map((r) => ({ key: r.key, label: r.key, count: r.count }));
}

export async function leadsByCountry(db: Db, since: string): Promise<FieldCount[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(l.target_country_iso, '') AS key, COALESCE(c.name, 'Unspecified') AS label, COUNT(*) AS count
       FROM leads l LEFT JOIN countries c ON c.iso2 = l.target_country_iso
       WHERE l.created_at >= ?
       GROUP BY l.target_country_iso
       ORDER BY count DESC LIMIT 10`,
    )
    .bind(since)
    .all<{ key: string; label: string; count: number }>();
  return results;
}

export async function leadsByStatus(db: Db): Promise<FieldCount[]> {
  const { results } = await db
    .prepare(`SELECT status AS key, COUNT(*) AS count FROM leads GROUP BY status ORDER BY count DESC`)
    .all<{ key: string; count: number }>();
  return results.map((r) => ({ key: r.key, label: r.key, count: r.count }));
}

export async function leadsByDay(db: Db, since: string): Promise<{ day: string; count: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS count
       FROM leads
       WHERE created_at >= ?
       GROUP BY strftime('%Y-%m-%d', created_at)
       ORDER BY day ASC`,
    )
    .bind(since)
    .all<{ day: string; count: number }>();
  return results;
}

/** Where leads came from, bucketed by the denormalized `referrer` snapshot. */
export async function leadSourceBreakdown(db: Db, since: string): Promise<FieldCount[]> {
  const { results } = await db
    .prepare(
      `SELECT referrer, COUNT(*) AS count
       FROM leads
       WHERE created_at >= ?
       GROUP BY referrer
       ORDER BY count DESC`,
    )
    .bind(since)
    .all<{ referrer: string | null; count: number }>();

  const buckets = new Map<string, number>();
  for (const row of results) {
    const source = categorizeReferrer(row.referrer);
    buckets.set(source, (buckets.get(source) ?? 0) + row.count);
  }
  return [...buckets.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count);
}

export interface StatusTiming {
  stage: string;
  avgDays: number | null;
  count: number;
}

/** Average time from capture to each pipeline stage (from status timestamps). */
export async function leadPipelineVelocity(db: Db): Promise<StatusTiming[]> {
  const stages = [
    { key: 'contacted', col: 'contacted_at' },
    { key: 'qualified', col: 'qualified_at' },
    { key: 'closed', col: 'closed_at' },
  ];
  const out: StatusTiming[] = [];
  for (const stage of stages) {
    const row = await db
      .prepare(
        `SELECT AVG(julianday(${stage.col}) - julianday(created_at)) AS avgDays, COUNT(*) AS n
         FROM leads WHERE ${stage.col} IS NOT NULL`,
      )
      .first<{ avgDays: number | null; n: number }>();
    out.push({ stage: stage.key, avgDays: row?.n ? row.avgDays : null, count: row?.n ?? 0 });
  }
  return out;
}

export interface ServiceCountry {
  service: string;
  country: string;
  count: number;
}

/** Service × destination matrix for the selected window. */
export async function leadsByServiceCountry(db: Db, since: string): Promise<ServiceCountry[]> {
  const { results } = await db
    .prepare(
      `SELECT l.service_type AS service, COALESCE(c.name, l.target_country_iso) AS country, COUNT(*) AS count
       FROM leads l LEFT JOIN countries c ON c.iso2 = l.target_country_iso
       WHERE l.created_at >= ?
       GROUP BY l.service_type, c.name, l.target_country_iso
       ORDER BY count DESC
       LIMIT 25`,
    )
    .bind(since)
    .all<ServiceCountry>();
  return results;
}

/** Where leads are being captured from (visitor geo, from the CF-IPCountry snapshot). */
export async function leadsByVisitorCountry(db: Db, since: string): Promise<FieldCount[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(country, 'Unknown') AS key, COUNT(*) AS count
       FROM leads
       WHERE created_at >= ?
       GROUP BY COALESCE(country, 'Unknown')
       ORDER BY count DESC
       LIMIT 10`,
    )
    .bind(since)
    .all<{ key: string; count: number }>();
  return results.map((r) => ({ key: r.key, label: r.key, count: r.count }));
}
