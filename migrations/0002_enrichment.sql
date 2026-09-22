-- Phase 1: country profile enrichment (flag, geography, demography, economy classification)
CREATE TABLE IF NOT EXISTS country_profiles (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    flag TEXT,
    area_km2 REAL,
    demonym TEXT,
    languages TEXT,          -- JSON array of strings
    currencies TEXT,         -- JSON array of { code, name, symbol }
    calling_code TEXT,
    latlng TEXT,             -- JSON array [lat, lng]
    landlocked INTEGER,      -- 0 = False, 1 = True
    borders TEXT,            -- JSON array of ISO2 codes
    tld TEXT,                -- JSON array of top-level domains
    un_member INTEGER,       -- 0 = False, 1 = True
    independent INTEGER,     -- 0 = False, 1 = True
    population INTEGER,
    population_year INTEGER,
    gdp_usd_m REAL,          -- total GDP, millions USD (Natural Earth)
    gdp_year INTEGER,
    income_group TEXT,
    economy TEXT,
    continent TEXT
);

-- Phase 2: economic & development indicators
CREATE TABLE IF NOT EXISTS country_economics (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    iso3 TEXT,
    gdp_per_capita_usd REAL,
    gdp_per_capita_year INTEGER,
    inflation_pct REAL,
    inflation_year INTEGER,
    hdi REAL,
    hdi_year INTEGER,
    hdi_rank INTEGER
);

-- Phase 3: freedom & governance indices (higher = better / freer)
CREATE TABLE IF NOT EXISTS country_freedom (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    cpi_score REAL, cpi_rank INTEGER, cpi_year INTEGER,
    fiw_score REAL, fiw_rank INTEGER, fiw_year INTEGER, fiw_status TEXT,
    human_rights_score REAL, human_rights_rank INTEGER, human_rights_year INTEGER,
    democracy_score REAL, democracy_rank INTEGER, democracy_year INTEGER
);
