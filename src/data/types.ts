export interface CountryCurrency {
  code: string;
  name: string | null;
  symbol: string | null;
}

export interface CountryProfile {
  flag: string | null;
  areaKm2: number | null;
  demonym: string | null;
  languages: string[];
  currencies: CountryCurrency[];
  callingCode: string | null;
  latlng: [number, number] | null;
  landlocked: boolean | null;
  borders: string[];
  tld: string[];
  unMember: boolean | null;
  independent: boolean | null;
  population: number | null;
  populationYear: number | null;
  gdpUsdM: number | null;
  gdpYear: number | null;
  incomeGroup: string | null;
  economy: string | null;
  continent: string | null;
}

export interface PassportRecord {
  code: string;
  name: string;
  region: string;
  subregion?: string;
  capital?: string;
  profile?: CountryProfile | null;
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

export interface CountryProfilesMeta {
  generatedAt: string;
  sources: DataSource[];
  license: string;
  disclaimer: string;
  totalCountries: number;
}

export interface EconomicIndicators {
  iso2: string;
  iso3: string | null;
  gdpPerCapitaUsd: number | null;
  gdpPerCapitaYear: number | null;
  inflationPct: number | null;
  inflationYear: number | null;
  lifeExpectancy: number | null;
  lifeExpectancyYear: number | null;
  gdpGrowthPct: number | null;
  gdpGrowthYear: number | null;
  hdi: number | null;
  hdiYear: number | null;
  hdiRank: number | null;
}

export interface CountryProfilesData {
  meta: CountryProfilesMeta;
  countries: EconomicIndicators[];
}

export interface FreedomMetric {
  score: number | null;
  rank: number | null;
  year: number | null;
  note: string | null;
}

export interface CountryFreedom {
  iso2: string;
  cpi: FreedomMetric | null;
  fiw: FreedomMetric | null;
  humanRights: FreedomMetric | null;
  democracy: FreedomMetric | null;
  happiness: FreedomMetric | null;
}

export interface CountryFreedomData {
  meta: CountryProfilesMeta;
  countries: CountryFreedom[];
}

export interface TaxProfile {
  iso2: string;
  personalIncomeTax: number | null;
  corporateTax: number | null;
  vat: number | null;
  territorial: boolean | null;
  wealth: boolean | null;
  nonDom: boolean | null; // non-domiciled / remittance-basis regime
}

export interface CountryTaxData {
  meta: CountryProfilesMeta;
  countries: TaxProfile[];
}

export interface CitizenshipLaw {
  iso2: string;
  name: string;
  citizenshipByDescent: boolean;
  naturalizationYears: number | null;
  dualCitizenshipAllowed: boolean;
  officialFeeEUR: number | null;
  note?: string;
  cbi: boolean | null;          // citizenship by investment (direct)
  goldenVisa: boolean | null;   // residency by investment
  marriageYears: number | null; // reduced naturalisation via marriage
  languageRequired: boolean | null;
  maxGenerations: number | null; // descent depth (null = unlimited)
  birthright: boolean | null;   // jus soli — citizenship by birth in territory
  cbiMinInvestmentEUR: number | null;
  goldenVisaMinInvestmentEUR: number | null;
  digitalNomadVisa: boolean | null;
  languageLevel: string | null; // e.g. "None", "A2", "B1", "B2"
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
