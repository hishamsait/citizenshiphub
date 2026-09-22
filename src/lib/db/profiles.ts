import type { CountryProfile } from '../../data/types';
import type { Db } from './client';
import { parseJson, toBool } from './parse';

interface ProfileRow {
  iso2: string;
  flag: string | null;
  area_km2: number | null;
  demonym: string | null;
  languages: string | null;
  currencies: string | null;
  calling_code: string | null;
  latlng: string | null;
  landlocked: number | null;
  borders: string | null;
  tld: string | null;
  un_member: number | null;
  independent: number | null;
  population: number | null;
  population_year: number | null;
  gdp_usd_m: number | null;
  gdp_year: number | null;
  income_group: string | null;
  economy: string | null;
  continent: string | null;
}

function mapRow(r: ProfileRow): CountryProfile {
  return {
    flag: r.flag,
    areaKm2: r.area_km2,
    demonym: r.demonym,
    languages: parseJson<string[]>(r.languages) ?? [],
    currencies: parseJson<CountryProfile['currencies']>(r.currencies) ?? [],
    callingCode: r.calling_code,
    latlng: parseJson<[number, number]>(r.latlng),
    landlocked: toBool(r.landlocked),
    borders: parseJson<string[]>(r.borders) ?? [],
    tld: parseJson<string[]>(r.tld) ?? [],
    unMember: toBool(r.un_member),
    independent: toBool(r.independent),
    population: r.population,
    populationYear: r.population_year,
    gdpUsdM: r.gdp_usd_m,
    gdpYear: r.gdp_year,
    incomeGroup: r.income_group,
    economy: r.economy,
    continent: r.continent,
  };
}

export async function getProfile(db: Db, iso2: string): Promise<CountryProfile | null> {
  const r = await db.prepare('SELECT * FROM country_profiles WHERE iso2 = ?').bind(iso2).first<ProfileRow>();
  return r ? mapRow(r) : null;
}
