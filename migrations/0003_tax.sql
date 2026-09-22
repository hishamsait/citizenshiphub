-- Phase 4b: tax & financial data
CREATE TABLE IF NOT EXISTS country_tax (
    iso2 TEXT PRIMARY KEY REFERENCES countries(iso2),
    personal_income_tax REAL,   -- top marginal rate %
    corporate_tax REAL,         -- %
    vat REAL,                   -- standard VAT/GST rate %
    territorial INTEGER,        -- 0 = worldwide, 1 = territorial
    wealth INTEGER              -- 0 = no wealth tax, 1 = wealth tax
);
