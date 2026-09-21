import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react';
import { cn } from '../lib/utils';

export interface TableRow {
  code: string;
  name: string;
  region: string;
  subregion: string;
  capital: string;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  mobilityScore: number;
  rank: number;
  guideSlug?: string;
}

type SortKey = 'rank' | 'name' | 'mobilityScore' | 'visaFree' | 'visaOnArrival' | 'eta' | 'eVisa';
type SortDir = 'asc' | 'desc';

interface Props {
  rows: TableRow[];
  initialQuery?: string;
  totalCountries?: number;
}

const REGION_ORDER = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'];
const MAX_SCORE = 199;

function SortableTh({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-3', className)}
    >
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-1 font-medium uppercase tracking-wide text-slate-500 hover:text-slate-900"
      >
        {label}
        {active ? (
          direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
        )}
      </button>
    </th>
  );
}

export default function PassportRankTable({ rows, initialQuery = '', totalCountries }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [region, setRegion] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showAll, setShowAll] = useState(false);

  const regions = useMemo(() => {
    const set = new Set(rows.map((r) => r.region));
    return [
      ...REGION_ORDER.filter((r) => set.has(r)),
      ...Array.from(set).filter((r) => !REGION_ORDER.includes(r)),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const matchesRegion = region === 'all' || r.region === region;
      const haystack = `${r.name} ${r.code} ${r.capital} ${r.region} ${r.subregion}`.toLowerCase();
      return matchesRegion && (!q || haystack.includes(q));
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return (av - bv) * dir;
    });
  }, [rows, query, region, sortKey, sortDir]);

  const visible = showAll ? filtered : filtered.slice(0, 25);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'rank' ? 'asc' : 'desc');
    }
  }

  function reset() {
    setQuery('');
    setRegion('all');
    setSortKey('rank');
    setSortDir('asc');
    setShowAll(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country, code, capital…"
            aria-label="Search passports"
            className="w-full rounded-lg bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="region-filter" className="text-sm text-slate-500">
            Region
          </label>
          <select
            id="region-filter"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          >
            <option value="all">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500" role="status" aria-live="polite">
        Showing <span className="font-semibold text-slate-900">{visible.length}</span> of{' '}
        <span className="font-semibold text-slate-900">{filtered.length}</span> matching passports
        {totalCountries ? ` (${totalCountries} total)` : ''}.
      </p>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-lg shadow-black/5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortableTh label="Rank" active={sortKey === 'rank'} direction={sortDir} onClick={() => toggleSort('rank')} className="w-16" />
              <SortableTh label="Passport" active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')} />
              <th scope="col" className="px-3 py-3 font-medium uppercase tracking-wide text-slate-500">
                Region
              </th>
              <SortableTh label="Score" active={sortKey === 'mobilityScore'} direction={sortDir} onClick={() => toggleSort('mobilityScore')} className="text-right" />
              <SortableTh label="Visa-free" active={sortKey === 'visaFree'} direction={sortDir} onClick={() => toggleSort('visaFree')} className="text-right" />
              <SortableTh label="VOA" active={sortKey === 'visaOnArrival'} direction={sortDir} onClick={() => toggleSort('visaOnArrival')} className="text-right" />
              <SortableTh label="ETA" active={sortKey === 'eta'} direction={sortDir} onClick={() => toggleSort('eta')} className="text-right" />
              <SortableTh label="e-Visa" active={sortKey === 'eVisa'} direction={sortDir} onClick={() => toggleSort('eVisa')} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No passports match your filters.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.code} className="even:bg-slate-50 hover:bg-slate-100">
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold',
                      r.rank <= 10 ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{r.code}</span>
                    <span className="font-medium text-slate-900">{r.name}</span>
                    {r.guideSlug && (
                      <a
                        href={`/countries/${r.guideSlug}/`}
                        className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        Guide
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {r.region}
                    {r.subregion ? ` · ${r.subregion}` : ''}
                  </p>
                </td>
                <td className="px-3 py-3 text-slate-500">{r.region}</td>
                <td className="px-3 py-3 text-right">
                  <span className="font-semibold text-slate-900">{r.mobilityScore}</span>
                  <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(100, (r.mobilityScore / MAX_SCORE) * 100)}%` }}
                    />
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-slate-600">{r.visaFree}</td>
                <td className="px-3 py-3 text-right text-slate-600">{r.visaOnArrival}</td>
                <td className="px-3 py-3 text-right text-slate-600">{r.eta}</td>
                <td className="px-3 py-3 text-right text-slate-600">{r.eVisa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showAll && filtered.length > 25 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Show all {filtered.length} passports
          </button>
        </div>
      )}
    </div>
  );
}
