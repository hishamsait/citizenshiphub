-- Console: first-party analytics + lead pipeline status.

-- Anonymous first-party analytics events (pageviews, searches, web vitals, custom).
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,       -- 'pageview' | 'search' | 'lead_open' | 'web_vital' | 'custom'
    path TEXT,
    referrer TEXT,
    country TEXT,             -- from CF-IPCountry
    device TEXT,              -- 'desktop' | 'mobile' | 'tablet' | 'other'
    metric TEXT,              -- 'LCP' | 'CLS' | 'INP' | 'TTFB' (for web_vital)
    value REAL,               -- metric value (for web_vital)
    properties TEXT,          -- JSON object for ad-hoc data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_path_time ON events(path, created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

-- Lead pipeline status (the optional `name` column was added in 0006).
ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
