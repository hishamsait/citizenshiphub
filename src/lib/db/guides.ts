import type { Db } from './client';
import { toBool } from './parse';

export interface GuideSummary {
  slug: string;
  iso2: string;
  name: string;
  capital: string | null;
  region: string;
  subregion: string | null;
  summary: string | null;
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  officialFeeEUR: number | null;
  flag: string | null;
}

export interface Guide extends GuideSummary {
  bodyHtml: string;
}

interface GuideRow {
  slug: string;
  iso2: string;
  name: string;
  capital: string | null;
  region: string;
  subregion: string | null;
  citizenshipByDescent: number;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: number | null;
  officialFeeEUR: number | null;
  flag: string | null;
  summary: string | null;
  bodyHtml: string | null;
}

const SELECT = `
  SELECT
    g.slug, c.iso2, c.name, c.capital, c.region, c.subregion,
    c.citizenship_by_descent AS citizenshipByDescent,
    c.naturalization_years AS naturalizationYears,
    c.dual_citizenship_allowed AS dualCitizenshipAllowed,
    c.official_fee_eur AS officialFeeEUR,
    p.flag, g.summary, g.body_html AS bodyHtml
  FROM country_guides g
  JOIN countries c ON c.iso2 = g.iso2
  LEFT JOIN country_profiles p ON p.iso2 = c.iso2`;

function mapRow(r: GuideRow): Guide {
  return {
    slug: r.slug,
    iso2: r.iso2,
    name: r.name,
    capital: r.capital,
    region: r.region,
    subregion: r.subregion,
    citizenshipByDescent: toBool(r.citizenshipByDescent) ?? false,
    naturalizationYears: r.naturalizationYears,
    dualCitizenshipAllowed: toBool(r.dualCitizenshipAllowed) ?? false,
    officialFeeEUR: r.officialFeeEUR,
    summary: r.summary,
    flag: r.flag,
    bodyHtml: r.bodyHtml ?? '',
  };
}

export async function listGuides(db: Db): Promise<Guide[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY c.name ASC`).all<GuideRow>();
  return results.map(mapRow);
}

export async function getGuideBySlug(db: Db, slug: string): Promise<Guide | null> {
  const r = await db.prepare(`${SELECT} WHERE g.slug = ?`).bind(slug).first<GuideRow>();
  return r ? mapRow(r) : null;
}
