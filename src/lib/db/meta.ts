import type { Db } from './client';
import { parseJson } from './parse';

export interface DatasetSource {
  name: string;
  url: string | null;
  updatedAt: string | null;
}

export interface DatasetMeta {
  datasetId: string;
  generatedAt: string | null;
  verifiedAt: string | null;
  source: string | null;
  license: string | null;
  disclaimer: string | null;
  scoreDefinition: string | null;
  totalCountries: number | null;
  totalDestinations: number | null;
  encoding: Record<string, string> | null;
  sources: DatasetSource[] | null;
}

interface MetaRow {
  dataset_id: string;
  generated_at: string | null;
  verified_at: string | null;
  source: string | null;
  license: string | null;
  disclaimer: string | null;
  score_definition: string | null;
  total_countries: number | null;
  total_destinations: number | null;
  encoding: string | null;
  sources: string | null;
}

export async function getDatasetMeta(db: Db, datasetId: string): Promise<DatasetMeta | null> {
  const r = await db.prepare('SELECT * FROM dataset_meta WHERE dataset_id = ?').bind(datasetId).first<MetaRow>();
  if (!r) return null;
  return {
    datasetId: r.dataset_id,
    generatedAt: r.generated_at,
    verifiedAt: r.verified_at,
    source: r.source,
    license: r.license,
    disclaimer: r.disclaimer,
    scoreDefinition: r.score_definition,
    totalCountries: r.total_countries,
    totalDestinations: r.total_destinations,
    encoding: parseJson<Record<string, string>>(r.encoding),
    sources: parseJson<DatasetSource[]>(r.sources),
  };
}
