import type { Db } from './client';

export interface SourceLicense {
  name: string;
  url?: string;
  restrictions?: string;
}

export interface DataSource {
  id: string;
  name: string;
  url: string;
  provides: string;
  license: SourceLicense;
  attribution: string;
  note?: string;
}

interface SourceRow {
  id: string;
  name: string;
  url: string | null;
  provides: string | null;
  license_name: string | null;
  license_url: string | null;
  license_restrictions: string | null;
  attribution: string | null;
  note: string | null;
}

export async function listSources(db: Db): Promise<DataSource[]> {
  const { results } = await db.prepare('SELECT * FROM data_sources ORDER BY rowid ASC').all<SourceRow>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url ?? '',
    provides: r.provides ?? '',
    license: {
      name: r.license_name ?? '',
      url: r.license_url ?? undefined,
      restrictions: r.license_restrictions ?? undefined,
    },
    attribution: r.attribution ?? '',
    note: r.note ?? undefined,
  }));
}
