import type { TaxProfile } from '../../data/types';
import type { Db } from './client';
import { toBool } from './parse';

interface TaxRow {
  iso2: string;
  personal_income_tax: number | null;
  corporate_tax: number | null;
  vat: number | null;
  territorial: number | null;
  wealth: number | null;
  non_dom: number | null;
}

function mapRow(r: TaxRow): TaxProfile {
  return {
    iso2: r.iso2,
    personalIncomeTax: r.personal_income_tax,
    corporateTax: r.corporate_tax,
    vat: r.vat,
    territorial: toBool(r.territorial),
    wealth: toBool(r.wealth),
    nonDom: toBool(r.non_dom),
  };
}

export async function getTax(db: Db, iso2: string): Promise<TaxProfile | null> {
  const r = await db.prepare('SELECT * FROM country_tax WHERE iso2 = ?').bind(iso2).first<TaxRow>();
  return r ? mapRow(r) : null;
}

export async function listTax(db: Db): Promise<Record<string, TaxProfile>> {
  const { results } = await db.prepare('SELECT * FROM country_tax').all<TaxRow>();
  const map: Record<string, TaxProfile> = {};
  for (const r of results) map[r.iso2] = mapRow(r);
  return map;
}
