export interface PassportRecord {
  code: string;
  name: string;
  region: string;
  subregion?: string;
  capital?: string;
  visaFree: number;
  visaOnArrival: number;
  eta: number;
  eVisa: number;
  visaRequired: number;
  noAdmission: number;
  mobilityScore: number;
  coverage: number | null;
}

export interface DataSource {
  name: string;
  url: string | null;
  updatedAt?: string | null;
}

export interface DataMeta {
  generatedAt: string;
  sources: DataSource[];
  license: string;
  disclaimer: string;
  scoreDefinition: string;
  totalCountries: number;
}

export interface PassportsData {
  meta: DataMeta;
  passports: PassportRecord[];
}

export interface RankedPassport extends PassportRecord {
  rank: number;
  denseRank: number;
  percentile: number;
}

export interface RankingsData {
  meta: DataMeta;
  rankings: RankedPassport[];
}

export interface VisaMatrixMeta extends DataMeta {
  encoding: Record<string, string>;
  totalDestinations: number;
}

export interface VisaMatrix {
  meta: VisaMatrixMeta;
  matrix: Record<string, Record<string, string>>;
}

export interface CitizenshipLaw {
  iso2: string;
  name: string;
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  officialFeeEUR: number | null;
  note?: string;
}

export interface CitizenshipLawsData {
  meta: {
    generatedAt: string;
    verifiedAt: string;
    source: string;
    disclaimer: string;
    totalCountries: number;
  };
  countries: CitizenshipLaw[];
}
