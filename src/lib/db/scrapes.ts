import type { Db } from './client';
import { parseJson } from './parse';

export interface ScrapeFact {
  field: string;
  value: string;
  confidence: number;
  evidence: string;
}

export interface ScrapeSourceResult {
  name: string;
  url: string;
  category: string;
  status: 'success' | 'failed';
  error?: string | null;
}

export interface ScrapeRun {
  id: string;
  iso2: string;
  status: 'running' | 'success' | 'failed';
  summary: string | null;
  facts: ScrapeFact[];
  sources: ScrapeSourceResult[];
  error: string | null;
  model: string | null;
  fetchedAt: string | null;
  createdAt: string;
}

interface ScrapeRunRow {
  id: string;
  iso2: string;
  status: string;
  summary: string | null;
  facts: string | null;
  sources: string | null;
  error: string | null;
  model: string | null;
  fetched_at: string | null;
  created_at: string;
}

function mapRow(r: ScrapeRunRow): ScrapeRun {
  return {
    id: r.id,
    iso2: r.iso2,
    status: r.status === 'success' || r.status === 'failed' ? r.status : 'running',
    summary: r.summary,
    facts: parseJson<ScrapeFact[]>(r.facts) ?? [],
    sources: parseJson<ScrapeSourceResult[]>(r.sources) ?? [],
    error: r.error,
    model: r.model,
    fetchedAt: r.fetched_at,
    createdAt: r.created_at,
  };
}

export async function insertScrapeRun(db: Db, iso2: string): Promise<ScrapeRun> {
  const id = `scrape-${iso2.toLowerCase()}-${Date.now().toString(36)}`;
  const createdAt = new Date().toISOString();
  await db
    .prepare('INSERT INTO scrape_runs (id, iso2, status, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, iso2, 'running', createdAt)
    .run();
  return {
    id,
    iso2,
    status: 'running',
    summary: null,
    facts: [],
    sources: [],
    error: null,
    model: null,
    fetchedAt: null,
    createdAt,
  };
}

export async function saveScrapeRun(db: Db, run: ScrapeRun): Promise<void> {
  await db
    .prepare(
      `UPDATE scrape_runs
       SET status = ?, summary = ?, facts = ?, sources = ?, error = ?, model = ?, fetched_at = ?
       WHERE id = ?`,
    )
    .bind(
      run.status,
      run.summary,
      JSON.stringify(run.facts),
      JSON.stringify(run.sources),
      run.error,
      run.model,
      run.fetchedAt,
      run.id,
    )
    .run();
}

export async function getScrapeRun(db: Db, id: string): Promise<ScrapeRun | null> {
  const row = await db.prepare('SELECT * FROM scrape_runs WHERE id = ?').bind(id).first<ScrapeRunRow>();
  return row ? mapRow(row) : null;
}

export async function listScrapeRuns(db: Db, iso2?: string, limit = 20): Promise<ScrapeRun[]> {
  if (iso2) {
    const { results } = await db
      .prepare('SELECT * FROM scrape_runs WHERE iso2 = ? ORDER BY created_at DESC LIMIT ?')
      .bind(iso2, limit)
      .all<ScrapeRunRow>();
    return results.map(mapRow);
  }
  const { results } = await db
    .prepare('SELECT * FROM scrape_runs ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<ScrapeRunRow>();
  return results.map(mapRow);
}

export interface ScrapeStatus {
  status: ScrapeRun['status'];
  fetchedAt: string | null;
}

/**
 * Latest scrape status per country for the Countries list (one pass, no N+1).
 * Returns the most recent run's status + fetched_at for every country that has
 * been scraped at least once.
 */
export async function listLatestScrapeStatus(db: Db): Promise<Record<string, ScrapeStatus>> {
  const { results } = await db
    .prepare('SELECT iso2, status, fetched_at FROM scrape_runs ORDER BY created_at DESC')
    .all<{ iso2: string; status: string; fetched_at: string | null }>();
  const out: Record<string, ScrapeStatus> = {};
  for (const r of results) {
    if (out[r.iso2]) continue;
    out[r.iso2] = {
      status: r.status === 'success' || r.status === 'failed' ? r.status : 'running',
      fetchedAt: r.fetched_at,
    };
  }
  return out;
}
