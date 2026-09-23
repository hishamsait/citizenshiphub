-- 16. AI-assisted data scraping runs for the Console's Countries section.
-- One row per scrape attempt for a country. `facts` and `sources` are JSON arrays
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
