import type { CitizenshipRouteKey, DocumentItem, RouteChecklist } from '../../data/types';
import type { Db } from './client';
import { parseJson } from './parse';

/** A resolved documents checklist for a single route of a country. */
export interface CountryRouteChecklist extends RouteChecklist {
  route: CitizenshipRouteKey;
}

interface DocumentsRow {
  iso2: string;
  route: string;
  title: string | null;
  description: string | null;
  note: string | null;
  documents: string;
}

function mapRow(r: DocumentsRow): { route: CitizenshipRouteKey; checklist: RouteChecklist } {
  return {
    route: r.route as CitizenshipRouteKey,
    checklist: {
      title: r.title ?? '',
      ...(r.description ? { description: r.description } : {}),
      ...(r.note ? { note: r.note } : {}),
      documents: parseJson<DocumentItem[]>(r.documents) ?? [],
    },
  };
}

/**
 * Return every documents checklist available for a country, merging the global
 * route templates with any country-specific overrides (overrides win).
 */
export async function getDocumentsForCountry(db: Db, iso2: string): Promise<CountryRouteChecklist[]> {
  const { results } = await db
    .prepare(
      `SELECT iso2, route, title, description, note, documents
         FROM citizenship_documents
        WHERE iso2 IN ('*', ?)
        ORDER BY (iso2 = '*') DESC, route ASC`,
    )
    .bind(iso2.toUpperCase())
    .all<DocumentsRow>();

  const byRoute = new Map<CitizenshipRouteKey, { template?: RouteChecklist; override?: RouteChecklist }>();
  for (const r of results) {
    const parsed = mapRow(r);
    const entry = byRoute.get(parsed.route) ?? {};
    if (r.iso2 === '*') entry.template = parsed.checklist;
    else entry.override = parsed.checklist;
    byRoute.set(parsed.route, entry);
  }

  const nonEmpty = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v : undefined);

  const out: CountryRouteChecklist[] = [];
  for (const [route, entry] of byRoute) {
    if (!entry.override && !entry.template) continue;
    const title = nonEmpty(entry.override?.title) ?? nonEmpty(entry.template?.title) ?? '';
    const description = nonEmpty(entry.override?.description) ?? nonEmpty(entry.template?.description);
    const note = nonEmpty(entry.override?.note) ?? nonEmpty(entry.template?.note);
    out.push({
      route,
      title,
      ...(description ? { description } : {}),
      ...(note ? { note } : {}),
      documents: entry.override?.documents ?? entry.template?.documents ?? [],
    });
  }
  return out;
}
