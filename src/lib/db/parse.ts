/** Parsers for the JSON/boolean columns stored in D1 (SQLite has no native JSON/boolean types). */

export function parseJson<T>(value: string | null | undefined): T | null {
  if (value == null || value === '') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Convert a 0/1 INTEGER (or an already-parsed boolean) to a boolean, or null when absent. */
export function toBool(value: number | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  return value === 1;
}
