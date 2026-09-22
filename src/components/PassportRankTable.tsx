import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Columns3, Download, RotateCcw, Search } from 'lucide-react';
import { cn } from '../lib/utils';

export interface TableRow {
  code: string;
  name: string;
  flag?: string | null;
  region: string;
  subregion: string;
  continent?: string | null;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  visaRequired: number;
  mobilityScore: number;
  population?: number | null;
  areaKm2?: number | null;
  incomeGroup?: string | null;
  gdpPerCapitaUsd?: number | null;
  inflationPct?: number | null;
  hdi?: number | null;
  lifeExpectancy?: number | null;
  gdpGrowthPct?: number | null;
  cpiScore?: number | null;
  fiwScore?: number | null;
  humanRightsScore?: number | null;
  democracyScore?: number | null;
  happinessScore?: number | null;
  citizenshipByDescent?: boolean;
  naturalizationYears?: number | null;
  dualCitizenshipAllowed?: boolean;
  cbi?: boolean;
  goldenVisa?: boolean;
  birthright?: boolean;
  digitalNomadVisa?: boolean;
  personalIncomeTax?: number | null;
  corporateTax?: number | null;
  vat?: number | null;
  territorial?: boolean | null;
  wealth?: boolean | null;
  nonDom?: boolean | null;
  easeScore?: number | null;
  freedomScore?: number | null;
  economyScore?: number | null;
  taxScore?: number | null;
  guideSlug?: string;
}

type Group = 'Mobility' | 'Economy' | 'Freedom' | 'Citizenship' | 'Tax' | 'Profile';
type SortDir = 'asc' | 'desc';
type Tri = 'all' | 'yes' | 'no';

interface Column {
  id: string;
  group: Group;
  label: string;
  align?: 'right';
  get: (r: TableRow) => number | string | null;
  render: (r: TableRow) => ReactNode;
}

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`);
const yesNo = (b: boolean | null | undefined) => (b == null ? '—' : b ? 'Yes' : 'No');
const dec = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d));
const badge = (b: boolean | undefined) =>
  b ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Yes</span> : <span className="text-slate-300">—</span>;

const COLUMNS_A: Column[] = [
  { id: 'visaFree', group: 'Mobility', label: 'Visa-free', align: 'right', get: (r) => r.visaFree, render: (r) => <span className="text-slate-600">{num(r.visaFree)}</span> },
  { id: 'visaOnArrival', group: 'Mobility', label: 'Visa on arrival', align: 'right', get: (r) => r.visaOnArrival, render: (r) => <span className="text-slate-600">{num(r.visaOnArrival)}</span> },
  { id: 'eta', group: 'Mobility', label: 'ETA', align: 'right', get: (r) => r.eta, render: (r) => <span className="text-slate-600">{num(r.eta)}</span> },
  { id: 'eVisa', group: 'Mobility', label: 'e-Visa', align: 'right', get: (r) => r.eVisa, render: (r) => <span className="text-slate-600">{num(r.eVisa)}</span> },
  { id: 'visaRequired', group: 'Mobility', label: 'Visa required', align: 'right', get: (r) => r.visaRequired, render: (r) => <span className="text-slate-600">{num(r.visaRequired)}</span> },
  { id: 'gdpPerCapitaUsd', group: 'Economy', label: 'GDP per capita', align: 'right', get: (r) => r.gdpPerCapitaUsd ?? null, render: (r) => <span className="text-slate-600">{r.gdpPerCapitaUsd == null ? '—' : '$' + num(r.gdpPerCapitaUsd)}</span> },
  { id: 'hdi', group: 'Economy', label: 'HDI', align: 'right', get: (r) => r.hdi ?? null, render: (r) => <span className="text-slate-600">{dec(r.hdi, 3)}</span> },
  { id: 'lifeExpectancy', group: 'Economy', label: 'Life expectancy', align: 'right', get: (r) => r.lifeExpectancy ?? null, render: (r) => <span className="text-slate-600">{r.lifeExpectancy == null ? '—' : r.lifeExpectancy.toFixed(1)}</span> },
  { id: 'gdpGrowthPct', group: 'Economy', label: 'GDP growth', align: 'right', get: (r) => r.gdpGrowthPct ?? null, render: (r) => <span className="text-slate-600">{pct(r.gdpGrowthPct)}</span> },
  { id: 'inflationPct', group: 'Economy', label: 'Inflation', align: 'right', get: (r) => r.inflationPct ?? null, render: (r) => <span className="text-slate-600">{pct(r.inflationPct)}</span> },
  { id: 'cpiScore', group: 'Freedom', label: 'Corruption (CPI)', align: 'right', get: (r) => r.cpiScore ?? null, render: (r) => <span className="text-slate-600">{num(r.cpiScore)}</span> },
  { id: 'fiwScore', group: 'Freedom', label: 'Freedom in the World', align: 'right', get: (r) => r.fiwScore ?? null, render: (r) => <span className="text-slate-600">{num(r.fiwScore)}</span> },
  { id: 'humanRightsScore', group: 'Freedom', label: 'Human Rights', align: 'right', get: (r) => r.humanRightsScore ?? null, render: (r) => <span className="text-slate-600">{dec(r.humanRightsScore)}</span> },
  { id: 'democracyScore', group: 'Freedom', label: 'Liberal Democracy', align: 'right', get: (r) => r.democracyScore ?? null, render: (r) => <span className="text-slate-600">{dec(r.democracyScore)}</span> },
  { id: 'happinessScore', group: 'Freedom', label: 'Life satisfaction', align: 'right', get: (r) => r.happinessScore ?? null, render: (r) => <span className="text-slate-600">{dec(r.happinessScore)}</span> },
];

const COLUMNS_B: Column[] = [
  { id: 'naturalizationYears', group: 'Citizenship', label: 'Naturalisation', align: 'right', get: (r) => r.naturalizationYears ?? null, render: (r) => <span className="text-slate-600">{r.naturalizationYears == null ? '—' : `${r.naturalizationYears} yrs`}</span> },
  { id: 'dualCitizenshipAllowed', group: 'Citizenship', label: 'Dual citizenship', get: (r) => (r.dualCitizenshipAllowed ? 1 : 0), render: (r) => <span className="text-slate-600">{yesNo(r.dualCitizenshipAllowed)}</span> },
  { id: 'cbi', group: 'Citizenship', label: 'CBI', get: (r) => (r.cbi ? 1 : 0), render: (r) => badge(r.cbi) },
  { id: 'goldenVisa', group: 'Citizenship', label: 'Golden visa', get: (r) => (r.goldenVisa ? 1 : 0), render: (r) => badge(r.goldenVisa) },
  { id: 'birthright', group: 'Citizenship', label: 'Birthright', get: (r) => (r.birthright ? 1 : 0), render: (r) => <span className="text-slate-600">{yesNo(r.birthright)}</span> },
  { id: 'digitalNomadVisa', group: 'Citizenship', label: 'Nomad visa', get: (r) => (r.digitalNomadVisa ? 1 : 0), render: (r) => badge(r.digitalNomadVisa) },
  { id: 'personalIncomeTax', group: 'Tax', label: 'Income tax', align: 'right', get: (r) => r.personalIncomeTax ?? null, render: (r) => <span className="text-slate-600">{pct(r.personalIncomeTax)}</span> },
  { id: 'corporateTax', group: 'Tax', label: 'Corporate tax', align: 'right', get: (r) => r.corporateTax ?? null, render: (r) => <span className="text-slate-600">{pct(r.corporateTax)}</span> },
  { id: 'vat', group: 'Tax', label: 'VAT / GST', align: 'right', get: (r) => r.vat ?? null, render: (r) => <span className="text-slate-600">{pct(r.vat)}</span> },
  { id: 'territorial', group: 'Tax', label: 'Tax basis', get: (r) => (r.territorial ? 1 : 0), render: (r) => <span className="text-slate-600">{r.territorial == null ? '—' : r.territorial ? 'Territorial' : 'Worldwide'}</span> },
  { id: 'wealth', group: 'Tax', label: 'Wealth tax', get: (r) => (r.wealth ? 1 : 0), render: (r) => <span className="text-slate-600">{yesNo(r.wealth)}</span> },
  { id: 'nonDom', group: 'Tax', label: 'Non-dom', get: (r) => (r.nonDom ? 1 : 0), render: (r) => <span className="text-slate-600">{yesNo(r.nonDom)}</span> },
  { id: 'population', group: 'Profile', label: 'Population', align: 'right', get: (r) => r.population ?? null, render: (r) => <span className="text-slate-600">{num(r.population)}</span> },
  { id: 'areaKm2', group: 'Profile', label: 'Area (km²)', align: 'right', get: (r) => r.areaKm2 ?? null, render: (r) => <span className="text-slate-600">{num(r.areaKm2)}</span> },
  { id: 'incomeGroup', group: 'Profile', label: 'Income group', get: (r) => r.incomeGroup ?? null, render: (r) => <span className="text-slate-600">{r.incomeGroup?.replace(/^\d+\.\s*/, '') ?? '—'}</span> },
];

const COLUMNS: Column[] = [...COLUMNS_A, ...COLUMNS_B];

const GROUPS: Group[] = ['Mobility', 'Economy', 'Freedom', 'Citizenship', 'Tax', 'Profile'];

const MODES = [
  { id: 'mobilityScore', label: 'Mobility', max: 199 },
  { id: 'easeScore', label: 'Ease of acquisition', max: 100 },
  { id: 'freedomScore', label: 'Freedom & QoL', max: 100 },
  { id: 'economyScore', label: 'Economy', max: 100 },
  { id: 'taxScore', label: 'Tax-friendliness', max: 100 },
] as const;

type ModeId = (typeof MODES)[number]['id'];

const REGION_ORDER = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'];

interface Props {
  rows: TableRow[];
  initialQuery?: string;
  totalCountries?: number;
}

function cmp(a: number | string | null, b: number | string | null, dir: number): number {
  const an = a == null;
  const bn = b == null;
  if (an && bn) return 0;
  if (an) return 1; // nulls always sort last
  if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  return String(a).localeCompare(String(b)) * dir;
}

function csvEscape(s: unknown): string {
  return `"${String(s ?? '').replace(/"/g, '""')}"`;
}

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
    <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-3', className)}>
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-1 font-medium uppercase tracking-wide text-slate-500 hover:text-slate-900"
      >
        {label}
        {active ? (
          direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
        )}
      </button>
    </th>
  );
}

export default function PassportRankTable({ rows, initialQuery = '', totalCountries }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<ModeId>('mobilityScore');
  const [region, setRegion] = useState('all');
  const [continent, setContinent] = useState('all');
  const [incomeGroup, setIncomeGroup] = useState('all');
  const [cbi, setCbi] = useState<Tri>('all');
  const [goldenVisa, setGoldenVisa] = useState<Tri>('all');
  const [dual, setDual] = useState<Tri>('all');
  const [descent, setDescent] = useState<Tri>('all');
  const [birthright, setBirthright] = useState<Tri>('all');
  const [nomad, setNomad] = useState<Tri>('all');
  const [sortKey, setSortKey] = useState<string>('mobilityScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => !['visaFree', 'visaOnArrival', 'eta', 'eVisa'].includes(c.id)).map((c) => c.id)),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const modeMeta = MODES.find((m) => m.id === mode)!;
  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.has(c.id)), [hidden]);

  const regions = useMemo(() => {
    const set = new Set(rows.map((r) => r.region));
    return [...REGION_ORDER.filter((r) => set.has(r)), ...Array.from(set).filter((r) => !REGION_ORDER.includes(r))];
  }, [rows]);

  const continents = useMemo(() => {
    const set = new Set(rows.map((r) => r.continent).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [rows]);

  const incomeGroups = useMemo(() => {
    const set = new Set(rows.map((r) => r.incomeGroup).filter(Boolean).map((s) => (s as string).replace(/^\d+\.\s*/, '')));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tri = (v: Tri, actual: boolean | undefined) => v === 'all' || !!actual === (v === 'yes');
    const list = rows.filter((r) => {
      if (region !== 'all' && r.region !== region) return false;
      if (continent !== 'all' && r.continent !== continent) return false;
      if (incomeGroup !== 'all' && r.incomeGroup?.replace(/^\d+\.\s*/, '') !== incomeGroup) return false;
      if (!tri(cbi, r.cbi)) return false;
      if (!tri(goldenVisa, r.goldenVisa)) return false;
      if (!tri(dual, r.dualCitizenshipAllowed)) return false;
      if (!tri(descent, r.citizenshipByDescent)) return false;
      if (!tri(birthright, r.birthright)) return false;
      if (!tri(nomad, r.digitalNomadVisa)) return false;
      if (q && !`${r.name} ${r.code} ${r.subregion}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const col = COLUMNS.find((c) => c.id === sortKey);
    return list.slice().sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (col) return cmp(col.get(a), col.get(b), dir);
      const av = (a as unknown as Record<string, number | null>)[sortKey] ?? null;
      const bv = (b as unknown as Record<string, number | null>)[sortKey] ?? null;
      return cmp(av, bv, dir);
    });
  }, [rows, query, region, continent, incomeGroup, cbi, goldenVisa, dual, descent, birthright, nomad, sortKey, sortDir]);

  const visible = showAll ? filtered : filtered.slice(0, 25);

  function changeMode(id: ModeId) {
    setMode(id);
    setSortKey(id);
    setSortDir('desc');
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function toggleColumn(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setQuery('');
    setRegion('all');
    setContinent('all');
    setIncomeGroup('all');
    setCbi('all');
    setGoldenVisa('all');
    setDual('all');
    setDescent('all');
    setBirthright('all');
    setNomad('all');
    setMode('mobilityScore');
    setSortKey('mobilityScore');
    setSortDir('desc');
    setShowAll(false);
  }

  function exportCsv() {
    const header = ['Rank', 'Code', 'Name', 'Region', modeMeta.label, ...visibleColumns.map((c) => c.label)];
    const lines = filtered.map((r, i) => {
      const cells = [
        String(i + 1),
        r.code,
        r.name,
        r.region,
        (r as unknown as Record<string, number | null>)[mode] ?? '',
        ...visibleColumns.map((c) => c.get(r) ?? ''),
      ];
      return cells.map(csvEscape).join(',');
    });
    const csv = [header.map(csvEscape).join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'passport-rankings.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none';

  const triSelect = (label: string, value: Tri, onChange: (v: Tri) => void) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Tri)} className={sel}>
      <option value="all">{label}: Any</option>
      <option value="yes">{label}: Yes</option>
      <option value="no">{label}: No</option>
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country, code, or subregion…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <select aria-label="Rank by" value={mode} onChange={(e) => changeMode(e.target.value as ModeId)} className={sel}>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              Rank by: {m.label}
            </option>
          ))}
        </select>

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
                      <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggleColumn(c.id)} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                      {c.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> CSV
        </button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)} className={sel}>
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select aria-label="Continent" value={continent} onChange={(e) => setContinent(e.target.value)} className={sel}>
          <option value="all">All continents</option>
          {continents.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Income group" value={incomeGroup} onChange={(e) => setIncomeGroup(e.target.value)} className={sel}>
          <option value="all">All income groups</option>
          {incomeGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {triSelect('CBI', cbi, setCbi)}
        {triSelect('Golden visa', goldenVisa, setGoldenVisa)}
        {triSelect('Dual citizenship', dual, setDual)}
        {triSelect('Descent', descent, setDescent)}
        {triSelect('Birthright', birthright, setBirthright)}
        {triSelect('Nomad visa', nomad, setNomad)}
        <span className="ml-auto text-sm text-slate-500">
          {filtered.length} of {totalCountries ?? rows.length} countries
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-lg shadow-black/5">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-3 text-right">#</th>
              <SortableTh label="Passport" active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')} />
              <SortableTh label="Region" active={sortKey === 'region'} direction={sortDir} onClick={() => toggleSort('region')} />
              <SortableTh label={modeMeta.label} active={sortKey === mode} direction={sortDir} onClick={() => toggleSort(mode)} className="text-right" />
              {visibleColumns.map((c) => (
                <SortableTh key={c.id} label={c.label} active={sortKey === c.id} direction={sortDir} onClick={() => toggleSort(c.id)} className={c.align === 'right' ? 'text-right' : ''} />
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4 + visibleColumns.length} className="px-4 py-10 text-center text-slate-500">
                  No passports match your filters.
                </td>
              </tr>
            )}
            {visible.map((r, i) => {
              const scoreVal = (r as unknown as Record<string, number | null>)[mode] ?? null;
              return (
                <tr key={r.code} className="even:bg-slate-50 hover:bg-slate-100">
                  <td className="px-3 py-3 text-right">
                    <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold', i < 10 ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600')}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {r.flag && <span className="text-lg" aria-hidden="true">{r.flag}</span>}
                      <span className="font-mono text-xs text-slate-400">{r.code}</span>
                      <span className="font-medium text-slate-900">{r.name}</span>
                      {r.guideSlug && (
                        <a href={`/countries/${r.guideSlug}/`} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
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
                    <span className="font-semibold text-slate-900">{scoreVal ?? '—'}</span>
                    <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, ((scoreVal ?? 0) / modeMeta.max) * 100)}%` }} />
                    </span>
                  </td>
                  {visibleColumns.map((c) => (
                    <td key={c.id} className={cn('px-3 py-3', c.align === 'right' ? 'text-right' : '')}>{c.render(r)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!showAll && filtered.length > 25 && (
        <div className="text-center">
          <button type="button" onClick={() => setShowAll(true)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            Show all {filtered.length} passports
          </button>
        </div>
      )}
    </div>
  );
}





