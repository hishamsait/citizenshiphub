/**
 * Data dictionary for the Console's Countries section.
 * Maps each logical "data point" a country can have to the `dataset_meta` id
 * that carries its fetch/verify timestamps (or `null` when none is tracked,
 * e.g. editorial guides).
 */
export interface CountryDataset {
  id: string;
  label: string;
  short: string;
  includes: string;
  datasetId: string | null;
}

export const COUNTRY_DATASETS: CountryDataset[] = [
  {
    id: 'visa',
    label: 'Passport & visa mobility',
    short: 'Visa',
    includes: 'Visa requirements to every destination and country identity.',
    datasetId: 'visa-matrix',
  },
  {
    id: 'rankings',
    label: 'Rankings & mobility score',
    short: 'Rank',
    includes: 'Global rank, mobility score, visa-free / VOA / eTA / eVisa counts.',
    datasetId: 'rankings',
  },
  {
    id: 'profile',
    label: 'Country profile',
    short: 'Profile',
    includes: 'Flag, languages, currencies, borders, area, population, GDP, income group, continent.',
    datasetId: 'country-profiles',
  },
  {
    id: 'economics',
    label: 'Economic indicators',
    short: 'Econ',
    includes: 'GDP per capita, inflation, life expectancy, GDP growth, HDI.',
    datasetId: 'country-profiles',
  },
  {
    id: 'freedom',
    label: 'Freedom & governance',
    short: 'Freedom',
    includes: 'Corruption (CPI), freedom, human rights, democracy, happiness.',
    datasetId: 'country-freedom',
  },
  {
    id: 'tax',
    label: 'Tax & financial',
    short: 'Tax',
    includes: 'Personal income tax, corporate tax, VAT, territorial / wealth / non-dom.',
    datasetId: 'country-tax',
  },
  {
    id: 'citizenship',
    label: 'Citizenship law & routes',
    short: 'Citizenship',
    includes: 'Descent, naturalisation years, fees, dual citizenship, CBI / Golden Visa.',
    datasetId: 'citizenship-laws',
  },
  {
    id: 'guide',
    label: 'Editorial guide',
    short: 'Guide',
    includes: 'Summary + full article body.',
    datasetId: null,
  },
  {
    id: 'relocation',
    label: 'Relocation & living',
    short: 'Relocation',
    includes: 'Internet penetration, driving side, timezone, healthcare system, climate.',
    datasetId: 'country-relocation',
  },
  {
    id: 'emergency',
    label: 'Emergency numbers',
    short: 'Emergency',
    includes: 'Police, ambulance, fire and universal emergency numbers.',
    datasetId: 'country-emergency',
  },
];

export const DATASET_BY_ID: Record<string, CountryDataset> = Object.fromEntries(
  COUNTRY_DATASETS.map((d) => [d.id, d]),
);
