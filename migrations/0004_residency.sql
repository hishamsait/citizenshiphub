-- Phase 5: residency & remaining quality-of-life signals

-- Full citizenship-route fields (Phase 4a + Phase 5)
CREATE TABLE IF NOT EXISTS country_citizenship (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    cbi INTEGER,                       -- citizenship by investment
    golden_visa INTEGER,               -- residency by investment
    marriage_years INTEGER,
    language_required INTEGER,
    max_generations INTEGER,           -- NULL = unlimited
    birthright INTEGER,                -- jus soli
    cbi_min_investment_eur REAL,
    golden_visa_min_investment_eur REAL,
    digital_nomad_visa INTEGER,
    language_level TEXT
);

-- Economics additions (life expectancy, GDP growth)
ALTER TABLE country_economics ADD COLUMN life_expectancy REAL;
ALTER TABLE country_economics ADD COLUMN life_expectancy_year INTEGER;
ALTER TABLE country_economics ADD COLUMN gdp_growth_pct REAL;
ALTER TABLE country_economics ADD COLUMN gdp_growth_year INTEGER;

-- Freedom addition (life satisfaction / happiness)
ALTER TABLE country_freedom ADD COLUMN happiness_score REAL;
ALTER TABLE country_freedom ADD COLUMN happiness_rank INTEGER;
ALTER TABLE country_freedom ADD COLUMN happiness_year INTEGER;

-- Tax addition (non-domiciled regime)
ALTER TABLE country_tax ADD COLUMN non_dom INTEGER;
