export interface AcquisitionInput {
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  officialFeeEUR: number | null;
}

export interface AcquisitionResult {
  score: number; // 0–100
  reasons: string[];
}

/** Heuristic "ease of acquisition" score (0–100). Indicative, not legal advice. */
export function scoreAcquisition(law: AcquisitionInput): AcquisitionResult {
  let score = 0;
  const reasons: string[] = [];

  if (law.citizenshipByDescent) {
    score += 35;
    reasons.push('Descent available');
  }

  const y = law.naturalizationYears;
  if (y === null) {
    reasons.push('Naturalisation restricted');
  } else if (y <= 3) {
    score += 35;
    reasons.push(`${y} yrs naturalisation`);
  } else if (y <= 5) {
    score += 25;
    reasons.push(`${y} yrs naturalisation`);
  } else if (y <= 8) {
    score += 15;
    reasons.push(`${y} yrs naturalisation`);
  } else if (y <= 12) {
    score += 8;
    reasons.push(`${y} yrs naturalisation`);
  } else {
    score += 2;
    reasons.push(`${y} yrs naturalisation`);
  }

  if (law.dualCitizenshipAllowed) {
    score += 15;
    reasons.push('Dual citizenship allowed');
  }

  const f = law.officialFeeEUR;
  if (f === null) {
    score += 5;
  } else if (f === 0) {
    score += 10;
    reasons.push('No application fee');
  } else if (f <= 300) {
    score += 8;
  } else if (f <= 1000) {
    score += 4;
  }

  return { score: Math.min(100, score), reasons };
}
