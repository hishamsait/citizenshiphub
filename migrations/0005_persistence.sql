-- Phase 6: full persistence — move remaining static data into D1 so the database
-- becomes the single source of truth for the application.

-- Countries: routing slug, subregion, dual-citizenship flag, passport coverage
ALTER TABLE countries ADD COLUMN slug TEXT;
ALTER TABLE countries ADD COLUMN subregion TEXT;
ALTER TABLE countries ADD COLUMN dual_citizenship_allowed INTEGER;
ALTER TABLE countries ADD COLUMN coverage REAL;

-- Rankings: remaining mobility counts + tie-break / percentile fields
ALTER TABLE passport_rankings ADD COLUMN evisa_count INTEGER;
ALTER TABLE passport_rankings ADD COLUMN visa_required_count INTEGER;
ALTER TABLE passport_rankings ADD COLUMN no_admission_count INTEGER;
ALTER TABLE passport_rankings ADD COLUMN dense_rank INTEGER;
ALTER TABLE passport_rankings ADD COLUMN percentile REAL;

-- Editorial guide bodies (rendered from Markdown at ETL time)
CREATE TABLE IF NOT EXISTS country_guides (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    slug TEXT NOT NULL,
    summary TEXT,
    body_md TEXT,
    body_html TEXT
);

-- Per-dataset metadata (generatedAt, sources, license, encoding, score definition, etc.)
CREATE TABLE IF NOT EXISTS dataset_meta (
    dataset_id TEXT PRIMARY KEY,   -- 'passports', 'rankings', 'visa-matrix', ...
    generated_at TEXT,
    verified_at TEXT,
    source TEXT,
    license TEXT,
    disclaimer TEXT,
    score_definition TEXT,
    total_countries INTEGER,
    total_destinations INTEGER,
    encoding TEXT,                 -- JSON object
    sources TEXT                   -- JSON array of { name, url, updatedAt }
);

-- Data-source attribution registry (mirrors the former src/data/sources.ts)
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
CREATE INDEX IF NOT EXISTS idx_visa_dest_lookup ON visa_rules(destination_iso, passport_iso);
