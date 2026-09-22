import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { decodeCell, STATUS_BADGE, STATUS_LABEL, type AccessStatus } from '../lib/visa';
import { cn } from '../lib/utils';
import TravelMap, { type MapCountryRef } from './TravelMap';

export interface CountryRef {
  code: string;
  name: string;
  region: string;
}

interface Props {
  countries: CountryRef[];
  paths: MapCountryRef[];
  initialPassport?: string;
}

const STATUSES: AccessStatus[] = ['visa-free', 'visa-on-arrival', 'eta', 'e-visa', 'visa-required', 'no-admission'];

export default function VisaExplorer({ countries, paths, initialPassport }: Props) {
  const nameByCode = useMemo(() => {
    const m = new Map<string, CountryRef>();
    for (const c of countries) m.set(c.code, c);
    return m;
  }, [countries]);

  const options = useMemo(() => [...countries].sort((a, b) => a.name.localeCompare(b.name)), [countries]);

  const [passport, setPassport] = useState<string>(() =>
    initialPassport && countries.some((c) => c.code === initialPassport.toUpperCase())
      ? initialPassport.toUpperCase()
      : 'IE',
  );
  const [cells, setCells] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccessStatus | 'all'>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/visa-matrix?passport=${encodeURIComponent(passport)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setCells(data.cells ?? {});
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCells({});
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [passport]);

  const statusByIso2 = useMemo(() => {
    const m: Record<string, AccessStatus> = {};
    for (const [code, cell] of Object.entries(cells)) m[code] = decodeCell(cell).status;
    return m;
  }, [cells]);

  const counts = useMemo(() => {
    const c: Record<AccessStatus, number> = {
      'visa-free': 0,
      'visa-on-arrival': 0,
      eta: 0,
      'e-visa': 0,
      'visa-required': 0,
      'no-admission': 0,
      home: 0,
      unknown: 0,
    };
    for (const cell of Object.values(cells)) c[decodeCell(cell).status]++;
    return c;
  }, [cells]);

  const destinations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(cells)
      .map(([code, cell]) => {
        const ref = nameByCode.get(code);
        return { code, name: ref?.name ?? code, region: ref?.region ?? '', ...decodeCell(cell) };
      })
      .filter((d) => d.status !== 'home' && d.status !== 'unknown')
      .filter((d) => statusFilter === 'all' || d.status === statusFilter)
      .filter((d) => !q || `${d.name} ${d.code}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cells, nameByCode, query, statusFilter]);

  const grouped = useMemo(() => {
    const g: Partial<Record<AccessStatus, typeof destinations>> = {};
    for (const s of STATUSES) g[s] = destinations.filter((d) => d.status === s);
    return g;
  }, [destinations]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="passport-select" className="text-sm font-medium text-slate-700">Passport</label>
          <select
            id="passport-select"
            value={passport}
            onChange={(e) => setPassport(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          >
            {options.map((c) => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status-filter" className="text-sm font-medium text-slate-700">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AccessStatus | 'all')}
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dest-search" className="text-sm font-medium text-slate-700">Search</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="dest-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Brazil, Japan…"
              className="w-full rounded-lg bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
            />
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400" role="status">Loading visa data…</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(['visa-free', 'visa-on-arrival', 'eta', 'e-visa', 'visa-required'] as AccessStatus[]).map((s) => (
          <div key={s} className="rounded-xl bg-white p-4 text-center shadow-md shadow-black/5">
            <p className="text-2xl font-bold text-slate-900">{counts[s]}</p>
            <p className="text-xs font-medium text-slate-500">{STATUS_LABEL[s]}</p>
          </div>
        ))}
      </div>

      <TravelMap paths={paths} statusByIso2={statusByIso2} />

      <p className="text-sm text-slate-500" role="status" aria-live="polite">
        The <span className="font-semibold text-slate-900">{nameByCode.get(passport)?.name ?? passport}</span> passport —{' '}
        {destinations.length} matching destination{destinations.length === 1 ? '' : 's'}.
      </p>

      <div className="space-y-6">
        {STATUSES.map((s) => {
          const items = grouped[s] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={s}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {STATUS_LABEL[s]}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{items.length}</span>
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => (
                  <li key={d.code} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                    <span>
                      <span className="font-medium text-slate-900">{d.name}</span>
                      <span className="ml-1.5 font-mono text-xs text-slate-400">{d.code}</span>
                    </span>
                    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BADGE[d.status])}>
                      {d.days ? `${d.days} days` : STATUS_LABEL[d.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
