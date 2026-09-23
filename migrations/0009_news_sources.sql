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
