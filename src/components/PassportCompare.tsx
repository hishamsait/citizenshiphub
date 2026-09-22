import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { decodeCell, STATUS_BADGE, STATUS_LABEL, STATUS_RANK, type AccessStatus } from '../lib/visa';
import { cn } from '../lib/utils';
import type { CountryRef } from './VisaExplorer';

export interface CompareRecord {
  code: string;
  name: string;
  flag: string | null;
  rank: number;
  percentile: number;
  mobilityScore: number;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  visaRequired: number;
  noAdmission: number;
  region: string;
  subregion: string | null;
  capital: string | null;
  continent: string | null;
  population: number | null;
  areaKm2: number | null;
  incomeGroup: string | null;
  gdpPerCapitaUsd: number | null;
  hdi: number | null;
  lifeExpectancy: number | null;
  inflationPct: number | null;
  gdpGrowthPct: number | null;
  cpiScore: number | null;
  fiwScore: number | null;
  humanRightsScore: number | null;
  democracyScore: number | null;
  happinessScore: number | null;
  personalIncomeTax: number | null;
  corporateTax: number | null;
  vat: number | null;
  territorial: boolean | null;
  wealth: boolean | null;
  nonDom: boolean | null;
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  cbi: boolean;
  goldenVisa: boolean;
  birthright: boolean;
  digitalNomadVisa: boolean;
  economyScore: number | null;
  freedomScore: number | null;
  taxScore: number | null;
  easeScore: number | null;
}

interface Props {
  countries: CountryRef[];
  rankings: CompareRecord[];
  initialCodes?: string[];
}

const SERIES_COLORS = ['#c9a24e', '#10b981', '#0ea5e9', '#f43f5e'];

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const usd = (n: number | null | undefined) => (n == null ? '—' : '$' + n.toLocaleString('en-US'));
const pct1 = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
const dec2 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
const dec3 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(3));

const yn = (b: boolean) =>
  b ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Yes</span>
  ) : (
    <span className="text-slate-300">—</span>
  );

function taxBasis(r: CompareRecord): string {
  if (r.territorial == null) return '—';
  const parts = [r.territorial ? 'Territorial' : 'Worldwide'];
  if (r.wealth === true) parts.push('Wealth tax');
  if (r.nonDom === true) parts.push('Non-dom');
  return parts.join(' · ');
}

function scoreBar(n: number | null) {
  if (n == null) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-gold-500" style={{ width: `${Math.min(100, Math.max(0, n))}%` }} />
      </span>
      <span className="font-medium text-slate-700">{n}</span>
    </span>
  );
}

type Better = 'high' | 'low';

interface RowDef {
  group: string;
  label: string;
  better?: Better;
  value: (r: CompareRecord) => number | null;
  render: (r: CompareRecord) => ReactNode;
}

const GROUPS = ['Overview', 'Mobility', 'Economy', 'Freedom', 'Tax', 'Citizenship', 'Scores'];

const ROWS: RowDef[] = [
  // Overview
  { group: 'Overview', label: 'Region', value: () => null, render: (r) => <span className="text-slate-600">{r.region}</span> },
  { group: 'Overview', label: 'Subregion', value: () => null, render: (r) => <span className="text-slate-600">{r.subregion ?? '—'}</span> },
  { group: 'Overview', label: 'Capital', value: () => null, render: (r) => <span className="text-slate-600">{r.capital ?? '—'}</span> },
  { group: 'Overview', label: 'Continent', value: () => null, render: (r) => <span className="text-slate-600">{r.continent ?? '—'}</span> },
  { group: 'Overview', label: 'Population', better: 'high', value: (r) => r.population, render: (r) => <span className="text-slate-600">{num(r.population)}</span> },
  { group: 'Overview', label: 'Area', value: () => null, render: (r) => <span className="text-slate-600">{r.areaKm2 == null ? '—' : num(r.areaKm2) + ' km²'}</span> },
  { group: 'Overview', label: 'Income group', value: () => null, render: (r) => <span className="text-slate-600">{r.incomeGroup?.replace(/^\d+\.\s*/, '') ?? '—'}</span> },
  // Mobility
  { group: 'Mobility', label: 'Global rank', better: 'low', value: (r) => r.rank, render: (r) => <span className="text-slate-600">#{r.rank}</span> },
  { group: 'Mobility', label: 'Mobility score', better: 'high', value: (r) => r.mobilityScore, render: (r) => <span className="font-semibold text-slate-900">{r.mobilityScore}</span> },
  { group: 'Mobility', label: 'Visa-free', better: 'high', value: (r) => r.visaFree, render: (r) => <span className="text-slate-600">{num(r.visaFree)}</span> },
  { group: 'Mobility', label: 'Visa on arrival', better: 'high', value: (r) => r.visaOnArrival, render: (r) => <span className="text-slate-600">{num(r.visaOnArrival)}</span> },
  { group: 'Mobility', label: 'ETA', better: 'high', value: (r) => r.eta, render: (r) => <span className="text-slate-600">{num(r.eta)}</span> },
  { group: 'Mobility', label: 'e-Visa', better: 'high', value: (r) => r.eVisa, render: (r) => <span className="text-slate-600">{num(r.eVisa)}</span> },
  { group: 'Mobility', label: 'Visa required', better: 'low', value: (r) => r.visaRequired, render: (r) => <span className="text-slate-600">{num(r.visaRequired)}</span> },
  { group: 'Mobility', label: 'No admission', better: 'low', value: (r) => r.noAdmission, render: (r) => <span className="text-slate-600">{num(r.noAdmission)}</span> },
  // Economy
  { group: 'Economy', label: 'GDP per capita', better: 'high', value: (r) => r.gdpPerCapitaUsd, render: (r) => <span className="text-slate-600">{usd(r.gdpPerCapitaUsd)}</span> },
  { group: 'Economy', label: 'HDI', better: 'high', value: (r) => r.hdi, render: (r) => <span className="text-slate-600">{dec3(r.hdi)}</span> },
  { group: 'Economy', label: 'Life expectancy', better: 'high', value: (r) => r.lifeExpectancy, render: (r) => <span className="text-slate-600">{r.lifeExpectancy == null ? '—' : num(r.lifeExpectancy) + ' yrs'}</span> },
  { group: 'Economy', label: 'GDP growth', better: 'high', value: (r) => r.gdpGrowthPct, render: (r) => <span className="text-slate-600">{pct1(r.gdpGrowthPct)}</span> },
  { group: 'Economy', label: 'Inflation', better: 'low', value: (r) => r.inflationPct, render: (r) => <span className="text-slate-600">{pct1(r.inflationPct)}</span> },
  // Freedom
  { group: 'Freedom', label: 'Corruption (CPI)', better: 'high', value: (r) => r.cpiScore, render: (r) => <span className="text-slate-600">{num(r.cpiScore)}</span> },
  { group: 'Freedom', label: 'Freedom in the World', better: 'high', value: (r) => r.fiwScore, render: (r) => <span className="text-slate-600">{num(r.fiwScore)}</span> },
  { group: 'Freedom', label: 'Human Rights Index', better: 'high', value: (r) => r.humanRightsScore, render: (r) => <span className="text-slate-600">{dec2(r.humanRightsScore)}</span> },
  { group: 'Freedom', label: 'Liberal Democracy', better: 'high', value: (r) => r.democracyScore, render: (r) => <span className="text-slate-600">{dec2(r.democracyScore)}</span> },
  { group: 'Freedom', label: 'Life satisfaction', better: 'high', value: (r) => r.happinessScore, render: (r) => <span className="text-slate-600">{dec2(r.happinessScore)}</span> },
  // Tax
  { group: 'Tax', label: 'Personal income tax', better: 'low', value: (r) => r.personalIncomeTax, render: (r) => <span className="text-slate-600">{pct1(r.personalIncomeTax)}</span> },
  { group: 'Tax', label: 'Corporate tax', better: 'low', value: (r) => r.corporateTax, render: (r) => <span className="text-slate-600">{pct1(r.corporateTax)}</span> },
  { group: 'Tax', label: 'VAT / GST', better: 'low', value: (r) => r.vat, render: (r) => <span className="text-slate-600">{pct1(r.vat)}</span> },
  { group: 'Tax', label: 'Tax basis', value: () => null, render: (r) => <span className="text-slate-600">{taxBasis(r)}</span> },
  // Citizenship
  { group: 'Citizenship', label: 'Citizenship by descent', better: 'high', value: (r) => (r.citizenshipByDescent ? 1 : 0), render: (r) => yn(r.citizenshipByDescent) },
  { group: 'Citizenship', label: 'Naturalisation period', better: 'low', value: (r) => r.naturalizationYears, render: (r) => <span className="text-slate-600">{r.naturalizationYears == null ? 'Restricted' : r.naturalizationYears + ' yrs'}</span> },
  { group: 'Citizenship', label: 'Dual citizenship', better: 'high', value: (r) => (r.dualCitizenshipAllowed ? 1 : 0), render: (r) => yn(r.dualCitizenshipAllowed) },
  { group: 'Citizenship', label: 'Citizenship by investment', better: 'high', value: (r) => (r.cbi ? 1 : 0), render: (r) => yn(r.cbi) },
  { group: 'Citizenship', label: 'Golden visa', better: 'high', value: (r) => (r.goldenVisa ? 1 : 0), render: (r) => yn(r.goldenVisa) },
  { group: 'Citizenship', label: 'Digital nomad visa', better: 'high', value: (r) => (r.digitalNomadVisa ? 1 : 0), render: (r) => yn(r.digitalNomadVisa) },
  // Scores
  { group: 'Scores', label: 'Economy score', better: 'high', value: (r) => r.economyScore, render: (r) => scoreBar(r.economyScore) },
  { group: 'Scores', label: 'Freedom score', better: 'high', value: (r) => r.freedomScore, render: (r) => scoreBar(r.freedomScore) },
  { group: 'Scores', label: 'Tax score', better: 'high', value: (r) => r.taxScore, render: (r) => scoreBar(r.taxScore) },
  { group: 'Scores', label: 'Ease of acquisition', better: 'high', value: (r) => r.easeScore, render: (r) => scoreBar(r.easeScore) },
];

interface MutualInfo {
  requirement?: string;
  allowed_stay_days?: number | null;
  destination_name?: string;
}

const REQUIREMENT_STATUS: Record<string, AccessStatus> = {
  'Visa Free': 'visa-free',
  VOA: 'visa-on-arrival',
  eTA: 'eta',
  eVisa: 'e-visa',
  'Visa Required': 'visa-required',
  'No Admission': 'no-admission',
  'Home Country': 'home',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function MutualCard({ from, to, info }: { from: CompareRecord; to: CompareRecord; info?: MutualInfo }) {
  const status = REQUIREMENT_STATUS[info?.requirement ?? ''] ?? 'unknown';
  const days = info?.allowed_stay_days;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">
        {from.flag && <span className="mr-1">{from.flag}</span>}
        {from.name} → {to.name}
      </p>
      <p className="mt-2">
        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BADGE[status])}>
          {days ? `${STATUS_LABEL[status]} · ${days}d` : STATUS_LABEL[status]}
        </span>
      </p>
    </div>
  );
}

export default function PassportCompare({ countries, rankings, initialCodes }: Props) {
  const nameByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const rankByCode = useMemo(() => new Map(rankings.map((r) => [r.code, r])), [rankings]);

  const [selected, setSelected] = useState<string[]>(() => {
    const init = initialCodes && initialCodes.length ? initialCodes.slice(0, 4) : ['IE', 'DE'];
    return init.filter((c) => countries.some((cc) => cc.code === c));
  });
  const [matrices, setMatrices] = useState<Record<string, Record<string, string>>>({});
  const [query, setQuery] = useState('');
  const [mutual, setMutual] = useState<Record<string, MutualInfo>>({});

  useEffect(() => {
    let active = true;
    for (const code of selected) {
      if (matrices[code]) continue;
      fetch(`/api/visa-matrix?passport=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          setMatrices((m) => ({ ...m, [code]: data.cells ?? {} }));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [selected, matrices]);

  useEffect(() => {
    if (selected.length !== 2) {
      setMutual({});
      return;
    }
    const [a, b] = selected;
    let active = true;
    Promise.all([
      fetch(`/api/visa-lookup?from=${a}&to=${b}`).then((r) => r.json()),
      fetch(`/api/visa-lookup?from=${b}&to=${a}`).then((r) => r.json()),
    ])
      .then(([ab, ba]) => {
        if (!active) return;
        setMutual({ [`${a}>${b}`]: ab, [`${b}>${a}`]: ba });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selected]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const code of selected) m[code] = matrices[code] ?? {};
    return m;
  }, [selected, matrices]);

  const options = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !selected.includes(c.code)),
    [countries, selected],
  );

  const records = useMemo(
    () => selected.map((c) => rankByCode.get(c)).filter((r): r is CompareRecord => Boolean(r)),
    [selected, rankByCode],
  );

  function add(code: string) {
    if (!code || selected.includes(code) || selected.length >= 4) return;
    setSelected((s) => [...s, code]);
  }
  function remove(code: string) {
    setSelected((s) => s.filter((c) => c !== code));
  }

  const differences = useMemo(() => {
    const destCodes = new Set<string>();
    for (const c of selected) for (const d of Object.keys(matrix[c] ?? {})) destCodes.add(d);
    const rows: { code: string; name: string; cells: { status: AccessStatus; days?: number }[]; best: number }[] = [];
    for (const dest of destCodes) {
      const cells = selected.map((c) => decodeCell(matrix[c]?.[dest] ?? '?'));
      if (new Set(cells.map((c) => c.status)).size <= 1) continue;
      rows.push({
        code: dest,
        name: nameByCode.get(dest)?.name ?? dest,
        cells,
        best: Math.max(...cells.map((c) => STATUS_RANK[c.status])),
      });
    }
    rows.sort((a, b) => b.best - a.best || a.name.localeCompare(b.name));
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [selected, matrix, nameByCode, query]);

  function bestValue(row: RowDef): number | null {
    if (!row.better) return null;
    const vals = records.map((r) => row.value(r)).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return row.better === 'high' ? Math.max(...vals) : Math.min(...vals);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Compare passports (up to 4)</label>
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((code) => (
            <span key={code} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800">
              {nameByCode.get(code)?.name ?? code}
              <button
                type="button"
                onClick={() => remove(code)}
                aria-label={`Remove ${nameByCode.get(code)?.name ?? code}`}
                className="text-brand-600 hover:text-brand-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {selected.length < 4 && (
            <select
              value=""
              onChange={(e) => add(e.target.value)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
              aria-label="Add passport to compare"
            >
              <option value="" disabled>Add passport…</option>
              {options.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {records.map((r, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <div key={r.code} className="rounded-xl bg-white p-4 shadow-md shadow-black/5" style={{ borderTop: `3px solid ${color}` }}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                  {r.flag && <span className="text-lg">{r.flag}</span>}
                  <span className="truncate">{r.name}</span>
                </p>
                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 px-1.5 text-xs font-bold text-brand-700">#{r.rank}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {r.mobilityScore} <span className="text-sm font-medium text-slate-400">score</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {r.visaFree} visa-free · {r.visaOnArrival} VOA · {r.eta} ETA · {r.eVisa} e-visa
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label="GDP/capita" value={usd(r.gdpPerCapitaUsd)} />
                <Stat label="HDI" value={dec3(r.hdi)} />
                <Stat label="CPI" value={num(r.cpiScore)} />
                <Stat label="Population" value={num(r.population)} />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Head-to-head</h3>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-lg shadow-black/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Metric</th>
                {records.map((r, i) => (
                  <th key={r.code} scope="col" className="px-4 py-3" style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-slate-50">
                    <td colSpan={records.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</td>
                  </tr>
                  {ROWS.filter((row) => row.group === g).map((row) => {
                    const best = bestValue(row);
                    return (
                      <tr key={row.label} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{row.label}</td>
                        {records.map((r) => {
                          const v = row.value(r);
                          const isBest = best != null && v != null && v === best && records.length > 1;
                          return (
                            <td key={r.code} className={cn('px-4 py-2', isBest && 'bg-gold-50 font-medium')}>
                              {row.render(r)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {records.length === 2 && (
        <div className="rounded-2xl bg-white p-5 shadow-md shadow-black/5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Mutual access</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MutualCard from={records[0]} to={records[1]} info={mutual[`${records[0].code}>${records[1].code}`]} />
            <MutualCard from={records[1]} to={records[0]} info={mutual[`${records[1].code}>${records[0].code}`]} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Where they differ ({differences.length})
          </h3>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter destinations…"
              aria-label="Filter destinations"
              className="w-full rounded-lg bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white shadow-lg shadow-black/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Destination</th>
                {selected.map((code) => (
                  <th key={code} scope="col" className="px-4 py-3 font-medium">{nameByCode.get(code)?.name ?? code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {differences.length === 0 && (
                <tr>
                  <td colSpan={selected.length + 1} className="px-4 py-8 text-center text-slate-500">
                    No differences for the selected passports.
                  </td>
                </tr>
              )}
              {differences.map((row) => (
                <tr key={row.code} className="even:bg-slate-50 hover:bg-slate-100">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span className="ml-1.5 font-mono text-xs text-slate-400">{row.code}</span>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-4 py-2.5">
                      <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BADGE[cell.status])}>
                        {cell.days ? `${cell.days}d` : STATUS_LABEL[cell.status]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
