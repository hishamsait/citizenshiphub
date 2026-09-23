-- Cloudflare D1 schema for Citizenship Hub.
-- This file is a human-readable reference; the canonical source of truth is
-- `migrations/0001_init.sql`, which is applied via `wrangler d1 migrations apply`.

-- 1. Master Countries Table
CREATE TABLE IF NOT EXISTS countries (
    iso2 TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capital TEXT,
    region TEXT,
    subregion TEXT,
    slug TEXT,
    citizenship_by_descent INTEGER DEFAULT 0, -- 0 = False, 1 = True
    naturalization_years INTEGER,
    official_fee_eur REAL,
    dual_citizenship_allowed INTEGER,
    coverage REAL
);

-- 2. Pairwise Visa Matrix (Country A -> Country B)
CREATE TABLE IF NOT EXISTS visa_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    passport_iso TEXT NOT NULL,
    destination_iso TEXT NOT NULL,
    requirement TEXT NOT NULL, -- 'Visa Free', 'VOA', 'eTA', 'eVisa', 'Visa Required', 'No Admission'
    allowed_stay_days INTEGER,
    FOREIGN KEY (passport_iso) REFERENCES countries(iso2),
    FOREIGN KEY (destination_iso) REFERENCES countries(iso2)
);

-- 3. Passport Mobility Rankings
CREATE TABLE IF NOT EXISTS passport_rankings (
    passport_iso TEXT PRIMARY KEY,
    rank_position INTEGER NOT NULL,
    mobility_score INTEGER NOT NULL,
    visa_free_count INTEGER NOT NULL,
    voa_count INTEGER NOT NULL,
    eta_count INTEGER NOT NULL,
    evisa_count INTEGER,
    visa_required_count INTEGER,
    no_admission_count INTEGER,
    dense_rank INTEGER,
    percentile REAL,
    FOREIGN KEY (passport_iso) REFERENCES countries(iso2)
);

-- 4. Legal Consultations & Lead Capture
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    name TEXT,
    target_country_iso TEXT NOT NULL,
    service_type TEXT NOT NULL, -- 'Legal Help', 'Translation', 'Golden Visa', 'Citizenship by Investment', 'Updates'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optimization Index for Instant Matrix Lookups
CREATE INDEX IF NOT EXISTS idx_visa_lookup ON visa_rules(passport_iso, destination_iso);

-- 5. Country Profile Enrichment (Phase 1)
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

-- 6. Economic & Development Indicators (Phase 2)
CREATE TABLE IF NOT EXISTS country_economics (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    iso3 TEXT,
    gdp_per_capita_usd REAL,
    gdp_per_capita_year INTEGER,
    inflation_pct REAL,
    inflation_year INTEGER,
    life_expectancy REAL,
    life_expectancy_year INTEGER,
    gdp_growth_pct REAL,
    gdp_growth_year INTEGER,
    hdi REAL,
    hdi_year INTEGER,
    hdi_rank INTEGER
);

-- 7. Freedom & Governance Indices (Phase 3)
CREATE TABLE IF NOT EXISTS country_freedom (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    cpi_score REAL, cpi_rank INTEGER, cpi_year INTEGER,
    fiw_score REAL, fiw_rank INTEGER, fiw_year INTEGER, fiw_status TEXT,
    human_rights_score REAL, human_rights_rank INTEGER, human_rights_year INTEGER,
    democracy_score REAL, democracy_rank INTEGER, democracy_year INTEGER,
    happiness_score REAL, happiness_rank INTEGER, happiness_year INTEGER
);

-- 8. Tax & Financial Data (Phase 4b)
CREATE TABLE IF NOT EXISTS country_tax (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    personal_income_tax REAL,   -- top marginal rate %
    corporate_tax REAL,         -- %
    vat REAL,                   -- standard VAT/GST rate %
    territorial INTEGER,        -- 0 = worldwide, 1 = territorial
    wealth INTEGER,             -- 0 = no wealth tax, 1 = wealth tax
    non_dom INTEGER             -- 0/1 non-domiciled (remittance-basis) regime
);

-- 9. Citizenship routes & residency signals (Phase 4a + Phase 5)
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

-- 10. Editorial guide bodies (rendered from Markdown at ETL time)
CREATE TABLE IF NOT EXISTS country_guides (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    slug TEXT NOT NULL,
    summary TEXT,
    body_md TEXT,
    body_html TEXT
);

-- 11. Per-dataset metadata (generatedAt, sources, license, encoding, etc.)
CREATE TABLE IF NOT EXISTS dataset_meta (
    dataset_id TEXT PRIMARY KEY,
    generated_at TEXT,
    verified_at TEXT,
    source TEXT,
    license TEXT,
    disclaimer TEXT,
    score_definition TEXT,
    total_countries INTEGER,
    total_destinations INTEGER,
    encoding TEXT,    -- JSON object
    sources TEXT      -- JSON array of { name, url, updatedAt }
);

-- 12. Data-source attribution registry
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    provides TEXT,
    license_name TEXT,
    license_url TEXT,
    license_restrictions TEXT,
    attribution TEXT,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_guides_slug ON country_guides(slug);

-- 13. Documents checklist by citizenship route (Phase 7)
-- Global route templates live under iso2 = '*'; country rows override a template's
-- document list for that country + route.
CREATE TABLE IF NOT EXISTS citizenship_documents (
    iso2 TEXT NOT NULL,            -- '*' = global route template; otherwise a country ISO2 override
    route TEXT NOT NULL,           -- 'descent' | 'naturalisation' | 'marriage' | 'birthright' | 'cbi' | 'golden-visa' | 'digital-nomad'
    title TEXT,
    description TEXT,
    note TEXT,
    documents TEXT NOT NULL,       -- JSON array [{ label, hint }]
    PRIMARY KEY (iso2, route)
);

-- 14. Country-specific immigration & citizenship news (RSS-fetched)
CREATE TABLE IF NOT EXISTS country_news (
    id TEXT PRIMARY KEY,
    iso2 TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    source_name TEXT,
    published_at TEXT,
    snippet TEXT
);
CREATE INDEX IF NOT EXISTS idx_country_news_iso2 ON country_news(iso2, published_at DESC);

-- 15. Country-specific immigration & citizenship sources
CREATE TABLE IF NOT EXISTS country_immigration_sources (
    id TEXT PRIMARY KEY,
    iso2 TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    category TEXT,
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_country_sources_iso2 ON country_immigration_sources(iso2);

-- 16. AI-assisted data scraping runs for the Console's Countries section.
-- One row per scrape attempt for a country; `facts` and `sources` are JSON arrays
-- produced by src/lib/ai/scraper.ts and read back via src/lib/db/scrapes.ts.
CREATE TABLE IF NOT EXISTS scrape_runs (
    id TEXT PRIMARY KEY,
    iso2 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',   -- 'running' | 'success' | 'failed'
    summary TEXT,
    facts TEXT,                               -- JSON [{ field, value, confidence, evidence }]
    sources TEXT,                             -- JSON [{ name, url, category, status, error }]
    error TEXT,
    model TEXT,
    fetched_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_iso2 ON scrape_runs(iso2, created_at DESC);

