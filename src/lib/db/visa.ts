import type { Db } from './client';

/**
 * Re-encode the compact visa-matrix token stored in the legacy datasets
 * ("F", "F:90", "A", "E", "V", "R", "N", "-", "?") from the `visa_rules`
 * table (human requirement + optional allowed stay). The client decodes these
 * tokens with `decodeCell` in `src/lib/visa.ts`.
 */
function encodeCell(requirement: string, days: number | null): string {
  switch (requirement) {
    case 'Visa Free':
      return days != null ? `F:${days}` : 'F';
    case 'VOA':
      return 'A';
    case 'eTA':
      return 'E';
    case 'eVisa':
      return 'V';
    case 'Visa Required':
      return 'R';
    case 'No Admission':
      return 'N';
    case 'Home Country':
      return '-';
    default:
      return '?';
  }
}

interface VisaRow {
  destination_iso: string;
  requirement: string;
  allowed_stay_days: number | null;
}

/** All destinations reachable from a passport: destination ISO2 -> token. */
export async function getMatrixForPassport(db: Db, iso2: string): Promise<Record<string, string>> {
  const { results } = await db
    .prepare('SELECT destination_iso, requirement, allowed_stay_days FROM visa_rules WHERE passport_iso = ?')
    .bind(iso2)
    .all<VisaRow>();
  const cells: Record<string, string> = {};
  for (const r of results) cells[r.destination_iso] = encodeCell(r.requirement, r.allowed_stay_days);
  return cells;
}

interface ReverseRow {
  passport_iso: string;
  requirement: string;
  allowed_stay_days: number | null;
}

/** Reverse lookup: for a destination, which passports can enter (passport ISO2 -> token). */
export async function getReverseMatrix(db: Db, destinationIso: string): Promise<Record<string, string>> {
  const { results } = await db
    .prepare('SELECT passport_iso, requirement, allowed_stay_days FROM visa_rules WHERE destination_iso = ?')
    .bind(destinationIso)
    .all<ReverseRow>();
  const cells: Record<string, string> = {};
  for (const r of results) cells[r.passport_iso] = encodeCell(r.requirement, r.allowed_stay_days);
  return cells;
}
