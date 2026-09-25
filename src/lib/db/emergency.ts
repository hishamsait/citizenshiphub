import type { Db } from './client';

export interface EmergencyService {
  service: string;
  number: string;
  note: string | null;
}

interface EmergencyRow {
  service: string;
  number: string;
  note: string | null;
}

const ORDER = `
  ORDER BY CASE service
    WHEN 'universal' THEN 0
    WHEN 'police' THEN 1
    WHEN 'ambulance' THEN 2
    WHEN 'fire' THEN 3
    ELSE 4
  END ASC, service ASC`;

export async function listEmergencyNumbers(db: Db, iso2: string): Promise<EmergencyService[]> {
  const { results } = await db
    .prepare(`SELECT service, number, note FROM country_emergency WHERE iso2 = ?${ORDER}`)
    .bind(iso2)
    .all<EmergencyRow>();
  return results.map((r) => ({ service: r.service, number: r.number, note: r.note }));
}
