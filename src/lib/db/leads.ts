import type { Db } from './client';

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
  const result = await db.prepare(`UPDATE leads SET status = ? WHERE id = ?`).bind(status, id).run();
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
