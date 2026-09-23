-- Phase 7: Documents checklist by citizenship route.
-- Global route templates live under iso2 = '*'; country rows override a template's
-- document list (and optionally its title/description/note) for that country + route.

CREATE TABLE IF NOT EXISTS citizenship_documents (
    iso2 TEXT NOT NULL,            -- '*' = global route template; otherwise a country ISO2 override
    route TEXT NOT NULL,           -- 'descent' | 'naturalisation' | 'marriage' | 'birthright' | 'cbi' | 'golden-visa' | 'digital-nomad'
    title TEXT,
    description TEXT,
    note TEXT,
    documents TEXT NOT NULL,       -- JSON array [{ label, hint }]
    PRIMARY KEY (iso2, route)
);
