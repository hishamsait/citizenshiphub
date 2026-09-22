import type { CountryFreedom, EconomicIndicators, TaxProfile } from '../data/types';

/** Weighted average of numeric values; returns null when no values are present. */
function weighted(values: { v: number | null | undefined; w: number }[]): number | null {
  const parts = values.filter((p) => p.v !== null && p.v !== undefined && Number.isFinite(p.v));
  if (parts.length === 0) return null;
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  return Math.round(parts.reduce((s, p) => s + (p.v as number) * p.w, 0) / totalW);
}

/** Freedom & quality of life — composite 0–100 (higher = freer). */
export function scoreFreedom(f: CountryFreedom): number | null {
  return weighted([
    { v: f.cpi?.score, w: 25 },
    { v: f.fiw?.score, w: 25 },
    { v: f.humanRights?.score != null ? f.humanRights.score * 100 : null, w: 20 },
    { v: f.democracy?.score != null ? f.democracy.score * 100 : null, w: 15 },
    { v: f.happiness?.score != null ? f.happiness.score * 10 : null, w: 15 },
  ]);
}

/** Economic opportunity — composite 0–100 (higher = richer/healthier). */
export function scoreEconomy(e: EconomicIndicators): number | null {
  const hdi = e.hdi != null ? e.hdi * 100 : null;
  const gdp =
    e.gdpPerCapitaUsd != null
      ? Math.min(100, Math.round(((Math.log10(e.gdpPerCapitaUsd) - 2) / (Math.log10(100_000) - 2)) * 100))
      : null;
  const life =
    e.lifeExpectancy != null
      ? Math.min(100, Math.max(0, Math.round(((e.lifeExpectancy - 50) / (85 - 50)) * 100)))
      : null;
  return weighted([
    { v: hdi, w: 40 },
    { v: gdp, w: 40 },
    { v: life, w: 20 },
  ]);
}

/** Tax-friendliness — composite 0–100 (higher = lower tax burden). */
export function scoreTax(t: TaxProfile): number | null {
  const base = weighted([
    { v: t.personalIncomeTax != null ? Math.max(0, 100 - (t.personalIncomeTax / 60) * 100) : null, w: 40 },
    { v: t.corporateTax != null ? Math.max(0, 100 - (t.corporateTax / 40) * 100) : null, w: 30 },
    { v: t.vat != null ? Math.max(0, 100 - (t.vat / 27) * 100) : null, w: 20 },
  ]);
  if (base === null) return null;
  let score = base;
  if (t.territorial === true) score += 5;
  if (t.wealth !== true) score += 3;
  if (t.nonDom === true) score += 2;
  return Math.min(100, Math.round(score));
}
