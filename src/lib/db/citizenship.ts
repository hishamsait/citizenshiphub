import type { CitizenshipLaw } from '../../data/types';
import type { Db } from './client';
import { toBool } from './parse';

/**
 * A citizenship "law" record merged from the `countries` table (descent,
 * naturalisation, dual-citizenship, fee) and the `country_citizenship` table
 * (investment/marriage/language/birthright routes). Mirrors the shape the old
 * `citizenship-laws.json` dataset exposed to pages.
 */
interface CitizenshipRow {
  iso2: string;
  name: string;
  citizenship_by_descent: number;
  naturalization_years: number | null;
  dual_citizenship_allowed: number | null;
  official_fee_eur: number | null;
  cbi: number | null;
  golden_visa: number | null;
  marriage_years: number | null;
  language_required: number | null;
  max_generations: number | null;
  birthright: number | null;
  cbi_min_investment_eur: number | null;
  golden_visa_min_investment_eur: number | null;
  digital_nomad_visa: number | null;
  language_level: string | null;
}

function mapRow(r: CitizenshipRow): CitizenshipLaw {
  return {
    iso2: r.iso2,
    name: r.name,
    citizenshipByDescent: toBool(r.citizenship_by_descent) ?? false,
    naturalizationYears: r.naturalization_years,
    dualCitizenshipAllowed: toBool(r.dual_citizenship_allowed) ?? false,
    officialFeeEUR: r.official_fee_eur,
    cbi: toBool(r.cbi),
    goldenVisa: toBool(r.golden_visa),
    marriageYears: r.marriage_years,
    languageRequired: toBool(r.language_required),
    maxGenerations: r.max_generations,
    birthright: toBool(r.birthright),
    cbiMinInvestmentEUR: r.cbi_min_investment_eur,
    goldenVisaMinInvestmentEUR: r.golden_visa_min_investment_eur,
    digitalNomadVisa: toBool(r.digital_nomad_visa),
    languageLevel: r.language_level,
  };
}

const SELECT = `
  SELECT
    c.iso2, c.name, c.citizenship_by_descent, c.naturalization_years,
    c.dual_citizenship_allowed, c.official_fee_eur,
    cc.cbi, cc.golden_visa, cc.marriage_years, cc.language_required, cc.max_generations,
    cc.birthright, cc.cbi_min_investment_eur, cc.golden_visa_min_investment_eur,
    cc.digital_nomad_visa, cc.language_level
  FROM countries c
  LEFT JOIN country_citizenship cc ON cc.iso2 = c.iso2`;

export async function getCitizenshipLaw(db: Db, iso2: string): Promise<CitizenshipLaw | null> {
  const r = await db.prepare(`${SELECT} WHERE c.iso2 = ?`).bind(iso2).first<CitizenshipRow>();
  return r ? mapRow(r) : null;
}

export async function listCitizenshipLaws(db: Db): Promise<CitizenshipLaw[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY c.name ASC`).all<CitizenshipRow>();
  return results.map(mapRow);
}
