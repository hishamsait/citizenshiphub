import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { formatDateTime } from '../../lib/utils';
import { COUNTRY_DATASETS } from '../../lib/country-datasets';

interface Country {
  iso2: string;
  name: string;
  region: string;
  flag: string | null;
  slug: string | null;
  datasets: Record<string, boolean>;
  lastRefreshedAt: string | null;
  analytics: { views: number; leads: number; scrollAvg: number | null };
}

interface DataPoint {
  id: string;
  label: string;
  includes: string;
  present: boolean;
  fetchedAt: string | null;
  verifiedAt: string | null;
  vintage: string[];
}

interface ServiceCount {
  label: string;
  count: number;
}

interface DeviceCount {
  device: string;
  views: number;
}

interface ScrollDepthStats {
  samples: number;
  avg: number | null;
  reached50: number | null;
  reached75: number | null;
  reached100: number | null;
}

interface CountryAnalytics {
  views: number;
  visitors: number;
  leads: number;
  conversion: number | null;
  leadsByService: ServiceCount[];
  scrollDepth: ScrollDepthStats;
  devices: DeviceCount[];
}

interface CountryDetail {
  iso2: string;
  name: string;
  region: string;
  flag: string | null;
  slug: string | null;
  lastRefreshedAt: string | null;
  points: DataPoint[];
  analytics: CountryAnalytics;
}

interface Props {
  countries: Country[];
}

type SortKey = 'name' | 'views' | 'leads' | 'scrollAvg' | 'lastRefreshedAt';

function SortableHeader({
  label,
  column,
  activeKey,
  dir,
  onSort,
  align = 'left',
  className = 'px-3',
}: {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = activeKey === column;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th className={`py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 text-xs uppercase tracking-wide transition ${
          active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
        }`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? '' : 'opacity-50'}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export default function CountriesTable({ countries }: Props) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openIso, setOpenIso] = useState<string | null>(null);
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? countries
      : countries.filter(
          (c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase().includes(q),
        );
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'views':
          cmp = a.analytics.views - b.analytics.views;
          break;
        case 'leads':
          cmp = a.analytics.leads - b.analytics.leads;
          break;
        case 'scrollAvg':
          cmp = (a.analytics.scrollAvg ?? -1) - (b.analytics.scrollAvg ?? -1);
          break;
        case 'lastRefreshedAt':
          cmp = (a.lastRefreshedAt ?? '').localeCompare(b.lastRefreshedAt ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [countries, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function open(iso2: string) {
    setOpenIso(iso2);
    setDetail(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/console/countries/${iso2.toLowerCase()}`);
      if (!res.ok) throw new Error('Could not load this country.');
      setDetail((await res.json()) as CountryDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this country.');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpenIso(null);
    window.setTimeout(() => {
      setDetail(null);
      setError(null);
    }, 300);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="relative max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search country name or code…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/30"
        />
      </div>

      <p className="mt-4 text-sm text-slate-500">
        {filtered.length} countr{filtered.length === 1 ? 'y' : 'ies'}
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <SortableHeader label="Country" column="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-5" />
                {COUNTRY_DATASETS.map((d) => (
                  <th key={d.id} className="px-2 py-3 text-center font-medium" title={d.label}>
                    {d.short}
                  </th>
                ))}
                <SortableHeader label="Views" column="views" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortableHeader label="Leads" column="leads" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortableHeader label="Scroll" column="scrollAvg" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortableHeader label="Last refreshed" column="lastRefreshedAt" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.iso2} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <button type="button" onClick={() => open(c.iso2)} className="flex items-center gap-3 text-left">
                      {c.flag && (
                        <span className="text-xl leading-none" aria-hidden="true">
                          {c.flag}
                        </span>
                      )}
                      <span>
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="block text-xs text-slate-500">
                          {c.iso2} · {c.region}
                        </span>
                      </span>
                    </button>
                  </td>
                  {COUNTRY_DATASETS.map((d) => (
                    <td key={d.id} className="px-2 py-3 text-center">
                      <span
                        className={`mx-auto block h-2.5 w-2.5 rounded-full ${
                          c.datasets[d.id] ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                        title={`${d.label} — ${c.datasets[d.id] ? 'available' : 'missing'}`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{c.analytics.views.toLocaleString('en-US')}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{c.analytics.leads.toLocaleString('en-US')}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {c.analytics.scrollAvg == null ? '—' : `${Math.round(c.analytics.scrollAvg)}%`}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-500">{formatDateTime(c.lastRefreshedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${
          openIso ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          openIso ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Country detail"
      >
        {(openIso || detail) && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                {detail ? (
                  <>
                    <div className="flex items-center gap-3">
                      {detail.flag && (
                        <span className="text-2xl leading-none" aria-hidden="true">
                          {detail.flag}
                        </span>
                      )}
                      <h2 className="truncate text-lg font-bold text-slate-900">{detail.name}</h2>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {detail.iso2} · {detail.region}
                      {detail.slug && (
                        <a
                          href={`/countries/${detail.slug}`}
                          className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                        >
                          Live
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </p>
                  </>
                ) : (
                  <h2 className="text-lg font-bold text-slate-900">Loading…</h2>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading && (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                </div>
              )}
              {error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}
              {detail && (
                <>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Analytics</h3>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Views</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                        {detail.analytics.views.toLocaleString('en-US')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Visitors</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                        {detail.analytics.visitors.toLocaleString('en-US')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Leads</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                        {detail.analytics.leads.toLocaleString('en-US')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Conversion</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                        {detail.analytics.conversion == null
                          ? '—'
                          : `${detail.analytics.conversion.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Scroll depth</p>
                      <p className="text-xs text-slate-400">{detail.analytics.scrollDepth.samples} visits</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Average depth:{' '}
                      <strong className="text-slate-900">
                        {detail.analytics.scrollDepth.avg == null
                          ? '—'
                          : `${Math.round(detail.analytics.scrollDepth.avg)}%`}
                      </strong>
                    </p>
                    <div className="mt-3 space-y-2">
                      {(
                        [
                          ['Reached 50%', detail.analytics.scrollDepth.reached50],
                          ['Reached 75%', detail.analytics.scrollDepth.reached75],
                          ['Reached 100%', detail.analytics.scrollDepth.reached100],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{label}</span>
                            <span className="tabular-nums">{value == null ? '—' : `${value.toFixed(0)}%`}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-brand-700"
                              style={{ width: `${value ?? 0}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(detail.analytics.leadsByService.length > 0 || detail.analytics.devices.length > 0) && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {detail.analytics.leadsByService.length > 0 && (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-semibold text-slate-900">Leads by service</p>
                          <ul className="mt-2 space-y-1.5">
                            {detail.analytics.leadsByService.map((s) => (
                              <li key={s.label} className="flex justify-between text-sm">
                                <span className="text-slate-600">{s.label}</span>
                                <span className="tabular-nums text-slate-900">{s.count}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {detail.analytics.devices.length > 0 && (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-semibold text-slate-900">Devices</p>
                          <ul className="mt-2 space-y-1.5">
                            {detail.analytics.devices.map((d) => (
                              <li key={d.device} className="flex justify-between text-sm">
                                <span className="capitalize text-slate-600">{d.device}</span>
                                <span className="tabular-nums text-slate-900">{d.views}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6 mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-500">Last refreshed</span>
                    <strong className="text-slate-900">{formatDateTime(detail.lastRefreshedAt)}</strong>
                    <span className="text-xs text-slate-400">UTC</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                            <th className="px-4 py-2.5 font-medium">Data point</th>
                            <th className="px-4 py-2.5 font-medium">Fetched at</th>
                            <th className="px-4 py-2.5 font-medium">Verified at</th>
                            <th className="px-4 py-2.5 font-medium">Vintage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.points.map((p) => (
                            <tr key={p.id} className={`align-top ${p.present ? '' : 'opacity-55'}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                      p.present ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span className="font-medium text-slate-900">{p.label}</span>
                                </div>
                                <p className="mt-1 pl-4 text-xs text-slate-400">{p.includes}</p>
                              </td>
                              <td className="px-4 py-3 tabular-nums text-slate-700">{formatDateTime(p.fetchedAt)}</td>
                              <td className="px-4 py-3 tabular-nums text-slate-700">{formatDateTime(p.verifiedAt)}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {p.vintage.length ? p.vintage.join(' · ') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
