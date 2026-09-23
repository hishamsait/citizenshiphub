# Citizenship Hub

Global passport rankings, visa mobility data, and citizenship-by-descent / naturalisation guides — built with
[Astro](https://astro.build) 5, React 19, and Tailwind CSS v4.

The site ranks and compares **199 passports**, shows where each one can travel without a traditional visa, and pairs
every country with a practical guide to acquiring its citizenship.

## Features

- **Passport rankings** — a sortable, searchable table of all 199 passports, filterable by region and ranked by mobility score.
- **Visa explorer** — pick a passport and browse every destination by access status on an interactive world map.
- **Passport comparison** — compare up to four passports side by side and see exactly where their access differs.
- **Best passports to obtain** — a "second passport" score balancing travel freedom against ease of acquisition.
- **Destinations** — reverse look-up: for any country, see which passports can enter and under what conditions.
- **Citizenship guides** — Markdown guides covering descent rules, naturalisation timelines, dual-citizenship rules, and fees.
- **SEO & UX** — canonical URLs, a D1-backed `sitemap.xml`, OpenGraph/Twitter cards with branded + per-country social images, JSON-LD (Article, FAQ, Breadcrumb, HowTo, Organization), a no-JS dark mode, and an accessible skip link.

## Requirements

- **Node** — `22` (see [`.nvmrc`](.nvmrc)).
- **npm** (or pnpm — see the `pnpm.onlyBuiltDependencies` entry in `package.json`).

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

The application reads from **Cloudflare D1** at runtime — the database is the single source of truth. To (re)load the
data, run the ETL and then seed D1:

```bash
node scripts/fetch-passport-data.js      # refresh passport datasets (30-day cache)
node scripts/generate-country-guides.js  # regenerate citizenship-laws.json + guides
npm run db:seed                          # persist all datasets + guides + meta + sources to D1
```

## Pages

| Route                  | Page                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `/`                    | Home — search, top-ranked passports, and featured citizenship guides |
| `/passports/`          | Full rankings table (search, filter by region, sort any column)      |
| `/explore/`            | Visa explorer — map + lists of every destination by access status    |
| `/compare/`            | Compare up to four passports and surface where they differ           |
| `/best/`               | "Best passports to obtain" — 50% mobility + 50% ease of acquisition  |
| `/destinations/`       | Browse every destination by region                                   |
| `/destinations/[slug]` | Who can visit a country, grouped by access status                    |
| `/countries/`          | Citizenship guides index, grouped by region                          |
| `/countries/[slug]`    | Individual citizenship guide + passport mobility map                 |
| `404`                  | Custom not-found page (noindex)                                      |

## Scripts

| Command                     | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `npm run dev`               | Start the dev server                                              |
| `npm run build`             | Type-check (`astro check`) and build the server-rendered site       |
| `npm run preview`           | Preview the production build                                      |
| `npm run check`             | Run `astro check` only                                            |
| `npm run astro`             | Run the Astro CLI directly (e.g. `npm run astro -- sync`)         |
| `npm run fetch:data`        | Regenerate passport datasets (uses a 30-day cache)                |
| `npm run fetch:data:fresh`  | Regenerate, ignoring the cache                                    |
| `npm run fetch:profiles`    | Regenerate economic/development profiles (World Bank + UNDP)      |
| `npm run fetch:freedom`     | Regenerate freedom/governance indices (CPI, V-Dem, Freedom House) |
| `npm run db:migrate`        | Apply D1 migrations to the remote database                        |
| `npm run db:seed:generate`  | Generate `scripts/.generated/seed.sql` from the datasets          |
| `npm run db:seed`           | Generate + apply the D1 seed to the remote database               |
| `npm run generate:og`       | Regenerate the default social share image (`public/og-default.png`) |
| `npm run generate:og:countries` | Regenerate the per-country share images (`public/og/countries/*.png`) |

Direct script invocations:

```bash
node scripts/fetch-passport-data.js [--fresh] [--offline] [--out=<dir>]
node scripts/fetch-country-profiles.js [--fresh] [--offline] [--out=<dir>]
node scripts/fetch-country-freedom.js [--fresh] [--offline] [--out=<dir>]
node scripts/generate-country-guides.js
```

- `--fresh` — ignore the 30-day CSV cache.
- `--offline` — skip the network entirely and use the bundled 38-country seed.
- `--out=<dir>` — write JSON to a custom directory (defaults to `src/data`).

## Data

Passport data is derived from **passportindex.org** via these MIT-licensed datasets:

- [imorte/passport-index-data](https://github.com/imorte/passport-index-data) — primary, refreshed 17 February 2026
- [ilyankou/passport-index-dataset](https://github.com/ilyankou/passport-index-dataset) — fallback, archived January 2025

Country metadata (names, regions, capitals) comes from
[mledoze/countries](https://github.com/mledoze/countries). Citizenship-law facts are compiled from Wikipedia
nationality-law pages (approximate; verified 21 September 2026) in `scripts/laws-*.js`.

Economic and development indicators (GDP per capita, inflation, HDI) come from the
[World Bank](https://data.worldbank.org/) (CC BY 4.0) and the
[UNDP Human Development Report](https://hdr.undp.org/) (CC BY 3.0 IGO).

Freedom & governance indicators come from
[Transparency International](https://www.transparency.org/en/cpi/2024) (Corruption Perceptions Index), the
[V-Dem Institute](https://v-dem.net/) (Human Rights Index and Liberal Democracy Index, via
[Our World in Data](https://ourworldindata.org/), CC BY), and
[Freedom House](https://freedomhouse.org/report/freedom-world) (Freedom in the World).

Tax & financial data (personal income tax, corporate tax, VAT/GST, taxation basis) is compiled from public
sources ([Tax Foundation](https://taxfoundation.org/), [OECD Tax Database](https://www.oecd.org/tax/tax-policy/tax-database/),
[KPMG](https://kpmg.com/xx/en/services/tax/tax-tools-and-resources/tax-rates-online.html)) and is approximate —
verify with a qualified tax adviser.

Generated/committed files in `src/data/`:

| File                       | Contents                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `passports.json`           | Per-passport totals + metadata (`mobilityScore`, coverage, etc.)      |
| `rankings.json`            | Global rankings (competition rank + dense rank + percentile)          |
| `visa-matrix.json`         | Compact passport × destination matrix (199 × 199)                     |
| `citizenship-laws.json`    | Normalised citizenship-law dataset (descent, years, dual, fee, note)  |
| `country-profiles.json`    | GDP/capita, inflation, and HDI per country (World Bank + UNDP)        |
| `country-freedom.json`     | CPI, Human Rights, Liberal Democracy, and Freedom in the World       |
| `country-tax.json`         | Personal/corporate/VAT tax rates and taxation basis per country      |
| `types.ts`                 | Shared TypeScript interfaces for the datasets                         |
| `world-countries.geo.json` | Natural Earth country polygons, projected to SVG paths for the maps   |
| `sources.json`             | Data-source attribution registry (seeded into `data_sources`)         |

**Mobility score** is defined as `visaFree + visaOnArrival + eta + eVisa` — the number of destinations reachable
without a traditional visa.

**Visa-matrix encoding** (each cell is a single compact token):

| Token      | Meaning                                |
| ---------- | -------------------------------------- |
| `F`        | Visa free                              |
| `F:<days>` | Visa free (limited days)               |
| `A`        | Visa on arrival                        |
| `E`        | ETA (electronic travel authorisation)  |
| `V`        | e-Visa                                 |
| `R`        | Visa required                          |
| `N`        | No admission                           |
| `-`        | Home country                           |
| `?`        | Unknown                                |

A bundled offline fallback for **38** major countries is included so the site still builds without network access.

## Data pipeline

```
scripts/fetch-passport-data.js        → src/data/passports.json, rankings.json, visa-matrix.json
scripts/generate-country-guides.js    → src/data/citizenship-laws.json + src/content/countries/*.md
scripts/seed-d1.mjs                   → scripts/.generated/seed.sql (persists everything to D1)
```

`generate-country-guides.js` merges the curated `laws-*.js` facts with passport/ranking data and writes one editorial
guide per country. Hand-written guides (`ireland`, `germany`, `japan`, `united-arab-emirates`, `spain`) are left
untouched.

`seed-d1.mjs` (via `npm run db:seed`) then persists every dataset — countries, rankings, the full visa matrix,
profiles, economics, freedom, tax, citizenship routes, guide bodies, dataset metadata, and the source registry — into
Cloudflare D1.

## Project structure

```
.
├── astro.config.mjs               # Astro config (site, React, Tailwind)
├── public/                        # favicon.svg, robots.txt
├── scripts/
│   ├── fetch-passport-data.js     # passport ETL (fetch → classify → rank → write JSON)
│   ├── generate-country-guides.js # citizenship laws + country guide generator
│   ├── laws-*.js                  # curated citizenship-law facts by region
│   └── seed-d1.mjs                # D1 seeder (all datasets + guides + meta + sources)
└── src/
    ├── content.config.ts          # typed `countries` content collection
    ├── content/countries/         # 199 Markdown citizenship guides
    ├── data/                      # generated JSON datasets + shared types + GeoJSON
    ├── layouts/BaseLayout.astro   # SEO, header, footer, dark mode
    ├── components/                # Astro + React components (see below)
    ├── lib/                       # domain logic + db/ repository layer (D1 data access)
    ├── pages/                     # routes (see the Pages table above)
    └── styles/global.css          # Tailwind theme + map colour tokens
```

**Components**

- Astro: `Header`, `Footer`, `CountryCard`, `RankingsPreview`, `SearchBar`, `TravelMap.astro`
- React: `PassportRankTable`, `VisaExplorer`, `PassportCompare`, `TravelMap`

**Library modules (`src/lib/`)**

- `acquire.ts` — heuristic 0–100 "ease of acquisition" score (descent, naturalisation years, dual citizenship, fee).
- `map.ts` — projects `world-countries.geo.json` into SVG path strings (server-side, cached).
- `utils.ts` — `cn`, `formatNumber`, `formatEuro`, `slugify`.
- `visa.ts` — decodes visa-matrix cells and exposes status labels, badges, ranks, and map fill colours.

## Deployment (Cloudflare)

The site deploys to **Cloudflare Pages** with on-demand server rendering via the `@astrojs/cloudflare` adapter. Every
page runs on Cloudflare Workers and reads from **Cloudflare D1** (SQLite, binding `DB`) through a typed repository
layer in `src/lib/db/`. D1 is the single source of truth — the ETL persists all datasets, guide bodies, dataset
metadata, and the data-source registry to it at seed time.

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Hosting/CDN  | Cloudflare Pages                                      |
| Edge compute | Cloudflare Workers via `@astrojs/cloudflare`          |
| Database     | Cloudflare D1 (SQLite) — binding `DB`                 |
| Search       | DB-backed `GET /api/search`                           |

### CI/CD

A GitHub Actions workflow (`.github/workflows/deploy.yml`) type-checks, builds, applies D1 migrations,
seeds the database, and deploys to Cloudflare Pages on every push to `main`.

Required GitHub secrets:

| Secret                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token (Workers + Pages + D1 edit)   |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                         |

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

### Search console verification (optional)

To verify the site in Google Search Console / Bing Webmaster Tools, add the provider's
verification token as a Cloudflare Pages environment variable. The matching `<meta>` tag is
emitted in `<head>` automatically when the variable is set:

| Variable                     | Emits                                    |
| ---------------------------- | ---------------------------------------- |
| `GOOGLE_SITE_VERIFICATION`   | `<meta name="google-site-verification">` |
| `BING_SITE_VERIFICATION`     | `<meta name="msvalidate.01">`            |

For local development, add these to `.dev.vars`.

### One-time setup

```bash
npx wrangler login                                        # authenticate with Cloudflare
npx wrangler d1 create citizenshiphub-db                  # create the D1 database
# copy the returned database_id into wrangler.jsonc
npx wrangler d1 migrations apply citizenshiphub-db --remote
npm run db:seed                                           # load countries, rankings, visa rules
```

### Local development

```bash
npm install
npm run dev                       # http://localhost:4321 (platformProxy + local D1)
npm run build                     # type-check + build
npx wrangler d1 migrations apply citizenshiphub-db --local
```

### API routes

- `GET  /api/visa-lookup?from=DE&to=US` — visa requirement between two countries.
- `GET  /api/visa-matrix?passport=IE` — visa-matrix row for a single passport.
- `GET  /api/search?q=ireland` — search countries and guide summaries.
- `POST /api/lead` — capture a lead: `{ "email": "...", "targetCountryIso": "PT", "serviceType": "Golden Visa" }`.
- `GET  /sitemap.xml` — XML sitemap generated from D1 (static pages + all country guides).

## Disclaimer

This site is provided for **informational purposes only** and is not legal, immigration, or travel advice. Visa
requirements change frequently; always verify with official government sources before travelling or applying.
