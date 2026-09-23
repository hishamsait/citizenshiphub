export interface AcquisitionInput {
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  officialFeeEUR: number | null;
  cbi?: boolean | null;
  goldenVisa?: boolean | null;
  marriageYears?: number | null;
  languageRequired?: boolean | null;
  maxGenerations?: number | null;
}

export interface AcquisitionResult {
  score: number; // 0–100
  reasons: string[];
}

/** Heuristic "ease of acquisition" score (0–100). Indicative, not legal advice. */
export function scoreAcquisition(law: AcquisitionInput): AcquisitionResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Descent (jus sanguinis) + how deep it reaches
  if (law.citizenshipByDescent) {
    score += 20;
    reasons.push('Descent');
    if (law.maxGenerations === null) {
      score += 8;
      reasons.push('No generation limit');
    } else if ((law.maxGenerations ?? 1) >= 3) {
      score += 5;
      reasons.push(`${law.maxGenerations}-gen descent`);
    } else if (law.maxGenerations === 2) {
      score += 3;
      reasons.push('Grandparent descent');
    }
  }

  // 2. Investment routes the fastest paths for those who qualify
  if (law.cbi) {
    score += 30;
    reasons.push('Citizenship by investment');
  }
  if (law.goldenVisa) {
    score += 15;
    reasons.push('Golden visa');
  }

  // 3. Naturalisation timeline
  const y = law.naturalizationYears;
  if (y === null) {
    reasons.push('Naturalisation restricted');
  } else if (y <= 3) {
    score += 20;
    reasons.push(`${y} yr naturalisation`);
  } else if (y <= 5) {
    score += 15;
    reasons.push(`${y} yr naturalisation`);
  } else if (y <= 8) {
    score += 10;
    reasons.push(`${y} yr naturalisation`);
  } else if (y <= 12) {
    score += 5;
    reasons.push(`${y} yr naturalisation`);
  } else {
    score += 2;
    reasons.push(`${y} yr naturalisation`);
  }

  // 4. Marriage route (reduced residency)
  if (law.marriageYears !== null && law.marriageYears !== undefined) {
    if (law.marriageYears <= 3) {
      score += 8;
      reasons.push(`${law.marriageYears} yr via marriage`);
    } else if (law.marriageYears <= 5) {
      score += 4;
      reasons.push(`${law.marriageYears} yr via marriage`);
    }
  }

  // 5. Dual citizenship
  if (law.dualCitizenshipAllowed) {
    score += 10;
    reasons.push('Dual citizenship');
  }

  // 6. Language requirement (easier without a formal test)
  if (law.languageRequired === false) {
    score += 5;
    reasons.push('No language test');
  }

  // 7. Cost of the application itself
  const f = law.officialFeeEUR;
  if (f === null) {
    score += 2;
  } else if (f === 0) {
    score += 5;
    reasons.push('No fee');
  } else if (f <= 300) {
    score += 4;
  } else if (f <= 1000) {
    score += 2;
  }

  return { score: Math.min(100, score), reasons };
}
