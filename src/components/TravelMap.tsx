import { STATUS_FILL, STATUS_LABEL, type AccessStatus } from '../lib/visa';

export interface MapCountryRef {
  iso2: string;
  name: string;
  d: string;
}

interface Props {
  paths: MapCountryRef[];
  statusByIso2: Record<string, AccessStatus>;
}

const LEGEND: AccessStatus[] = ['visa-free', 'visa-on-arrival', 'eta', 'e-visa', 'visa-required', 'no-admission'];

export default function TravelMap({ paths, statusByIso2 }: Props) {
  return (
    <div>
      <svg
        viewBox="0 0 960 500"
        role="img"
        aria-label="World map of visa access"
        className="h-auto w-full rounded-xl bg-slate-50 shadow-sm"
      >
        {paths.map((c) => {
          const status = statusByIso2[c.iso2] ?? 'unknown';
          return (
            <path
              key={c.iso2}
              d={c.d}
              style={{ fill: STATUS_FILL[status], stroke: 'var(--map-stroke)' }}
              strokeWidth="0.5"
            >
              <title>{`${c.name} ${STATUS_LABEL[status]}`}</title>
            </path>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: STATUS_FILL[s] }} />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}
