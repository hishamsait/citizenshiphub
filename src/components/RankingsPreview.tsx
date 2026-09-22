import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Columns3 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { RankedCountry } from '../lib/db/rankings';

type Group = 'Mobility' | 'Economy' | 'Freedom' | 'Profile';
type SortDir = 'asc' | 'desc';

interface Column {
  id: string;
  group: Group;
  label: string;
  align?: 'right';
  get: (r: RankedCountry) => number | string | null;
  render: (r: RankedCountry) => ReactNode;
}

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const dec = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d));

const COLUMNS: Column[] = [
  // Mobility
  { id: 'visaFree', group: 'Mobility', label: 'Visa-free', align: 'right', get: (r) => r.visaFree, render: (r) => <span className="text-slate-600">{num(r.visaFree)}</span> },
  { id: 'visaOnArrival', group: 'Mobility', label: 'Visa on arrival', align: 'right', get: (r) => r.visaOnArrival, render: (r) => <span className="text-slate-600">{num(r.visaOnArrival)}</span> },
  { id: 'eta', group: 'Mobility', label: 'ETA', align: 'right', get: (r) => r.eta, render: (r) => <span className="text-slate-600">{num(r.eta)}</span> },
  { id: 'eVisa', group: 'Mobility', label: 'e-Visa', align: 'right', get: (r) => r.eVisa, render: (r) => <span className="text-slate-600">{num(r.eVisa)}</span> },
  { id: 'visaRequired', group: 'Mobility', label: 'Visa required', align: 'right', get: (r) => r.visaRequired, render: (r) => <span className="text-slate-600">{num(r.visaRequired)}</span> },
  { id: 'noAdmission', group: 'Mobility', label: 'No admission', align: 'right', get: (r) => r.noAdmission, render: (r) => <span className="text-slate-600">{num(r.noAdmission)}</span> },
  { id: 'mobilityScore', group: 'Mobility', label: 'Mobility score', align: 'right', get: (r) => r.mobilityScore, render: (r) => <span className="font-semibold text-slate-900">{r.mobilityScore}</span> },
  // Economy
  { id: 'gdpPerCapitaUsd', group: 'Economy', label: 'GDP per capita', align: 'right', get: (r) => r.gdpPerCapitaUsd ?? null, render: (r) => <span className="text-slate-600">{r.gdpPerCapitaUsd == null ? '—' : '$' + num(r.gdpPerCapitaUsd)}</span> },
  { id: 'hdi', group: 'Economy', label: 'HDI', align: 'right', get: (r) => r.hdi ?? null, render: (r) => <span className="text-slate-600">{dec(r.hdi, 3)}</span> },
  // Freedom
  { id: 'cpiScore', group: 'Freedom', label: 'Corruption (CPI)', align: 'right', get: (r) => r.cpiScore ?? null, render: (r) => <span className="text-slate-600">{num(r.cpiScore)}</span> },
  // Profile
  { id: 'population', group: 'Profile', label: 'Population', align: 'right', get: (r) => r.population ?? null, render: (r) => <span className="text-slate-600">{num(r.population)}</span> },
  { id: 'areaKm2', group: 'Profile', label: 'Area (km²)', align: 'right', get: (r) => r.areaKm2 ?? null, render: (r) => <span className="text-slate-600">{num(r.areaKm2)}</span> },
  { id: 'incomeGroup', group: 'Profile', label: 'Income group', get: (r) => r.incomeGroup ?? null, render: (r) => <span className="text-slate-600">{r.incomeGroup?.replace(/^\d+\.\s*/, '') ?? '—'}</span> },
  { id: 'continent', group: 'Profile', label: 'Continent', get: (r) => r.continent ?? null, render: (r) => <span className="text-slate-600">{r.continent ?? '—'}</span> },
  { id: 'subregion', group: 'Profile', label: 'Subregion', get: (r) => r.subregion ?? null, render: (r) => <span className="text-slate-600">{r.subregion ?? '—'}</span> },
  { id: 'capital', group: 'Profile', label: 'Capital', get: (r) => r.capital ?? null, render: (r) => <span className="text-slate-600">{r.capital ?? '—'}</span> },
];

const GROUPS: Group[] = ['Mobility', 'Economy', 'Freedom', 'Profile'];

const DEFAULT_VISIBLE = ['visaFree', 'visaOnArrival', 'eta', 'eVisa', 'visaRequired', 'mobilityScore', 'gdpPerCapitaUsd', 'hdi', 'cpiScore', 'population'];

interface Props {
  rankings: RankedCountry[];
  slugByCode?: Record<string, string>;
}

export default function RankingsPreview({ rankings, slugByCode }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => !DEFAULT_VISIBLE.includes(c.id)).map((c) => c.id)),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.has(c.id)), [hidden]);

  const rows = useMemo(() => {
    if (!sortKey) return rankings;
    const col = COLUMNS.find((c) => c.id === sortKey);
    if (!col) return rankings;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rankings].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const an = av == null;
      const bn = bv == null;
      if (an && bn) return 0;
      if (an) return 1;
      if (bn) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rankings, sortKey, sortDir]);

  const toggleColumn = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const resetColumns = () => setHidden(new Set(COLUMNS.filter((c) => !DEFAULT_VISIBLE.includes(c.id)).map((c) => c.id)));

  const toggleSort = (id: string) => {
    if (sortKey === id) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(id);
      setSortDir('asc');
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Top-ranked passports</h2>
          <p className="mt-1 text-sm text-slate-500">Countries whose passports open the most visa-free doors.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/passports/" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
            View all →
          </a>
          <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Columns3 className="h-4 w-4" /> Columns
          </button>
          {columnsOpen && (
            <div className="absolute right-0 z-10 mt-1 max-h-96 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              {GROUPS.map((g) => (
                <div key={g} className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
                  {COLUMNS.filter((c) => c.group === g).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.id)}
                        onChange={() => toggleColumn(c.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={resetColumns}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                Reset columns
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-lg shadow-black/5">
        <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
          <caption className="sr-only">Top {rows.length} passports by mobility score</caption>
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">Rank</th>
              <th scope="col" className="px-4 py-3">Passport</th>
              <th scope="col" className="px-4 py-3">Region</th>
              {visibleColumns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={sortKey === c.id ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('px-4 py-3', c.align === 'right' ? 'text-right' : '')}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.id)}
                    className="group inline-flex items-center gap-1 font-medium uppercase tracking-wide text-slate-500 hover:text-slate-900"
                  >
                    {c.label}
                    {sortKey === c.id ? (
                      sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="even:bg-slate-50 hover:bg-slate-100">
                <td className="px-4 py-3">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-50 px-1.5 text-xs font-bold text-brand-700">
                    {r.rank}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.flag && <span className="mr-1.5 text-lg" aria-hidden="true">{r.flag}</span>}
                  <span className="mr-2 font-mono text-xs text-slate-400">{r.code}</span>
                  {slugByCode?.[r.code] ? (
                    <a
                      href={`/countries/${slugByCode[r.code]}/`}
                      className="text-slate-900 underline-offset-2 hover:text-brand-700 hover:underline"
                    >
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.region}</td>
                {visibleColumns.map((c) => (
                  <td key={c.id} className={cn('px-4 py-3', c.align === 'right' ? 'text-right' : '')}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
