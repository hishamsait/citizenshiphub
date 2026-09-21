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
- **SEO & UX** — canonical URLs, OpenGraph/Twitter cards, JSON-LD, a no-JS dark mode, and an accessible skip link.

## Requirements

- **Node** — `20.18.2` (see [`.nvmrc`](.nvmrc)); supported ranges are `18.20.8 || >=20.3.0 <21 || >=22`.
- **npm** (or pnpm — see the `pnpm.onlyBuiltDependencies` entry in `package.json`).

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

The generated datasets in `src/data/*.json` are **committed**, so the site builds out of the box with no network access.
To refresh the data from source, run the ETL first:

```bash
node scripts/fetch-passport-data.js      # refresh passport datasets (30-day cache)
node scripts/generate-country-guides.js  # regenerate citizenship-laws.json + guides
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
| `npm run build`             | Type-check (`astro check`) and build the static site to `dist/`   |
| `npm run preview`           | Preview the production build                                      |
| `npm run check`             | Run `astro check` only                                            |
| `npm run astro`             | Run the Astro CLI directly (e.g. `npm run astro -- sync`)         |
| `npm run fetch:data`        | Regenerate passport datasets (uses a 30-day cache)                |
| `npm run fetch:data:fresh`  | Regenerate, ignoring the cache                                    |

Direct script invocations:

```bash
node scripts/fetch-passport-data.js [--fresh] [--offline] [--out=<dir>]
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

Generated/committed files in `src/data/`:

| File                       | Contents                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `passports.json`           | Per-passport totals + metadata (`mobilityScore`, coverage, etc.)      |
| `rankings.json`            | Global rankings (competition rank + dense rank + percentile)          |
| `visa-matrix.json`         | Compact passport × destination matrix (199 × 199)                     |
| `citizenship-laws.json`    | Normalised citizenship-law dataset (descent, years, dual, fee, note)  |
| `types.ts`                 | Shared TypeScript interfaces for the datasets                         |
| `world-countries.geo.json` | Natural Earth country polygons, projected to SVG paths for the maps   |

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
```

`generate-country-guides.js` merges the curated `laws-*.js` facts with passport/ranking data and writes one editorial
guide per country. Hand-written guides (`ireland`, `germany`, `japan`, `united-arab-emirates`, `spain`) are left
untouched.

## Project structure

```
.
├── astro.config.mjs               # Astro config (site, React, Tailwind)
├── public/                        # favicon.svg, robots.txt
├── scripts/
│   ├── fetch-passport-data.js     # passport ETL (fetch → classify → rank → write JSON)
│   ├── generate-country-guides.js # citizenship laws + country guide generator
│   └── laws-*.js                  # curated citizenship-law facts by region
└── src/
    ├── content.config.ts          # typed `countries` content collection
    ├── content/countries/         # 199 Markdown citizenship guides
    ├── data/                      # generated JSON datasets + shared types + GeoJSON
    ├── layouts/BaseLayout.astro   # SEO, header, footer, dark mode
    ├── components/                # Astro + React components (see below)
    ├── lib/                       # acquire.ts, map.ts, utils.ts, visa.ts
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

## Disclaimer

This site is provided for **informational purposes only** and is not legal, immigration, or travel advice. Visa
requirements change frequently; always verify with official government sources before travelling or applying.
