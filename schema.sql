-- Cloudflare D1 schema for Citizenship Hub.
-- This file is a human-readable reference; the canonical source of truth is
-- `migrations/0001_init.sql`, which is applied via `wrangler d1 migrations apply`.

-- 1. Master Countries Table
CREATE TABLE IF NOT EXISTS countries (
    iso2 TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capital TEXT,
    region TEXT,
    citizenship_by_descent INTEGER DEFAULT 0, -- 0 = False, 1 = True
    naturalization_years INTEGER,
    official_fee_eur REAL
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
    FOREIGN KEY (passport_iso) REFERENCES countries(iso2)
);

-- 4. Legal Consultations & Lead Capture
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    target_country_iso TEXT NOT NULL,
    service_type TEXT NOT NULL, -- 'Legal Help', 'Translation', 'Golden Visa'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optimization Index for Instant Matrix Lookups
CREATE INDEX IF NOT EXISTS idx_visa_lookup ON visa_rules(passport_iso, destination_iso);
