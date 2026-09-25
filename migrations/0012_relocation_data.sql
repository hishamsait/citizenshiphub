-- Phase 8: relocation & practical-living data points.
CREATE TABLE IF NOT EXISTS country_emergency (
    iso2 TEXT NOT NULL,
    service TEXT NOT NULL,
    number TEXT NOT NULL,
    note TEXT,
    PRIMARY KEY (iso2, service)
);
CREATE INDEX IF NOT EXISTS idx_country_emergency_iso2 ON country_emergency(iso2);
CREATE TABLE IF NOT EXISTS country_relocation (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    internet_penetration_pct REAL,
    internet_year INTEGER,
    avg_broadband_mbps REAL,
    broadband_year INTEGER,
    minimum_wage_usd REAL,
    minimum_wage_year INTEGER,
    avg_net_salary_usd REAL,
    avg_net_salary_year INTEGER,
    cost_of_living_index REAL,
    rent_index REAL,
    col_year INTEGER,
    safety_index REAL,
    safety_year INTEGER,
    healthcare_system TEXT,
    climate TEXT,
    timezone TEXT,
    driving_side TEXT,
    plug_voltage TEXT
);
CREATE INDEX IF NOT EXISTS idx_country_relocation_iso2 ON country_relocation(iso2);
