-- Console analytics enhancements: lead attribution + pipeline velocity.
-- Adds session/campaign attribution columns and status timestamps to `leads`
-- so the Console can answer "where did each lead come from?" and "how long
-- does the pipeline take?". Attribution can be recovered either from these
-- denormalized snapshots or by joining leads.session_id -> events.session_id.

ALTER TABLE leads ADD COLUMN session_id TEXT;
ALTER TABLE leads ADD COLUMN referrer TEXT;
ALTER TABLE leads ADD COLUMN landing_path TEXT;
ALTER TABLE leads ADD COLUMN country TEXT;
ALTER TABLE leads ADD COLUMN utm_source TEXT;
ALTER TABLE leads ADD COLUMN utm_medium TEXT;
ALTER TABLE leads ADD COLUMN utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN status_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE leads ADD COLUMN contacted_at DATETIME;
ALTER TABLE leads ADD COLUMN qualified_at DATETIME;
ALTER TABLE leads ADD COLUMN closed_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_utm ON leads(utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_landing_path ON leads(landing_path);
