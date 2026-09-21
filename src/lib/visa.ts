export type AccessStatus =
  | 'visa-free'
  | 'visa-on-arrival'
  | 'eta'
  | 'e-visa'
  | 'visa-required'
  | 'no-admission'
  | 'home'
  | 'unknown';

export interface DecodedCell {
  status: AccessStatus;
  days?: number;
}

/** Decode a compact visa-matrix cell ("F", "F:90", "A", "E", "V", "R", "N", "-"). */
export function decodeCell(cell: string): DecodedCell {
  if (cell === '-') return { status: 'home' };
  if (cell === 'F') return { status: 'visa-free' };
  if (cell.startsWith('F:')) return { status: 'visa-free', days: Number(cell.slice(2)) };
  if (cell === 'A') return { status: 'visa-on-arrival' };
  if (cell === 'E') return { status: 'eta' };
  if (cell === 'V') return { status: 'e-visa' };
  if (cell === 'R') return { status: 'visa-required' };
  if (cell === 'N') return { status: 'no-admission' };
  return { status: 'unknown' };
}

export const STATUS_LABEL: Record<AccessStatus, string> = {
  'visa-free': 'Visa-free',
  'visa-on-arrival': 'Visa on arrival',
  eta: 'ETA',
  'e-visa': 'e-Visa',
  'visa-required': 'Visa required',
  'no-admission': 'No admission',
  home: 'Home country',
  unknown: 'Unknown',
};

/** Tailwind ring badge classes per status. */
export const STATUS_BADGE: Record<AccessStatus, string> = {
  'visa-free': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  'visa-on-arrival': 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
  eta: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  'e-visa': 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  'visa-required': 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  'no-admission': 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  home: 'bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  unknown: 'bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

/** Ordering from best to worst access (for comparison sorting). */
export const STATUS_RANK: Record<AccessStatus, number> = {
  'visa-free': 6,
  eta: 5,
  'e-visa': 4,
  'visa-on-arrival': 3,
  'visa-required': 2,
  'no-admission': 1,
  home: 0,
  unknown: -1,
};

/** Hex fill colors for SVG choropleth maps. */
export const STATUS_FILL: Record<AccessStatus, string> = {
  'visa-free': 'var(--map-visa-free)',
  'visa-on-arrival': 'var(--map-visa-on-arrival)',
  eta: 'var(--map-eta)',
  'e-visa': 'var(--map-e-visa)',
  'visa-required': 'var(--map-visa-required)',
  'no-admission': 'var(--map-no-admission)',
  home: 'var(--map-home)',
  unknown: 'var(--map-unknown)',
};
