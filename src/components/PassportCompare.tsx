import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { decodeCell, STATUS_BADGE, STATUS_LABEL, STATUS_RANK, type AccessStatus } from '../lib/visa';
import { cn } from '../lib/utils';
import type { CountryRef } from './VisaExplorer';

export interface RankedRef {
  code: string;
  name: string;
  rank: number;
  mobilityScore: number;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  visaRequired: number;
}

interface Props {
  countries: CountryRef[];
  rankings: RankedRef[];
  initialCodes?: string[];
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

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const code of selected) m[code] = matrices[code] ?? {};
    return m;
  }, [selected, matrices]);

  const options = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !selected.includes(c.code)),
    [countries, selected],
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

  const visible = differences.slice(0, 60);

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
        {selected.map((code) => {
          const r = rankByCode.get(code);
          if (!r) return null;
          return (
            <div key={code} className="rounded-xl bg-white p-4 shadow-md shadow-black/5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{r.name}</p>
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-50 px-1.5 text-xs font-bold text-brand-700">#{r.rank}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {r.mobilityScore} <span className="text-sm font-medium text-slate-400">score</span>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {r.visaFree} visa-free · {r.visaOnArrival} VOA · {r.eta} ETA · {r.eVisa} e-visa
              </p>
            </div>
          );
        })}
      </div>

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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={selected.length + 1} className="px-4 py-8 text-center text-slate-500">
                    No differences for the selected passports.
                  </td>
                </tr>
              )}
              {visible.map((row) => (
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
        {differences.length > visible.length && (
          <p className="text-center text-sm text-slate-500">
            Showing the first {visible.length} of {differences.length} differences — refine with search.
          </p>
        )}
      </div>
    </div>
  );
}
