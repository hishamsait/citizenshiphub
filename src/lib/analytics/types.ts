export type RangeKey = '7d' | '30d' | '90d';

export interface TimeRange {
  key: RangeKey;
  label: string;
  days: number;
}

export const TIME_RANGES: TimeRange[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
];

export function resolveRange(key: string | null | undefined): TimeRange {
  return TIME_RANGES.find((r) => r.key === key) ?? TIME_RANGES[1];
}

/** Return a SQLite-compatible UTC timestamp string for the start of the window. */
export function sinceSql(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
