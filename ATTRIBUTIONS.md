# Data Sources & Attribution

This file documents every external data source used by **Citizenship Hub**, its license, and the required
attribution. It is the repository-level companion to the in-app source list (seeded from `src/data/sources.json`
into the `data_sources` table in Cloudflare D1).

Citizenship Hub is owned and operated by [Built Brilliant](https://builtbrilliant.com). The third-party data sources
listed below remain the property of their respective owners and are used under the licenses shown.

## Summary

| Source | Data used | License |
| --- | --- | --- |
| passportindex.org (via imorte/passport-index-data) | Visa matrix, mobility scores | MIT License |
| mledoze/countries | Country metadata | MIT License |
| Natural Earth | Map geometry, population, GDP, economy | Public domain |
| OpenStreetMap | Basemap tiles (interactive maps) | ODbL 1.0 |
| World Bank | GDP per capita, inflation | CC BY 4.0 |
| UNDP Human Development Report | Human Development Index | CC BY 3.0 IGO |
| Our World in Data | CPI / V-Dem index distribution | CC BY 4.0 (sub-licenses apply) |
| Transparency International | Corruption Perceptions Index | CC BY-ND 4.0 |
| V-Dem | Human Rights & Liberal Democracy indices | CC BY-NC-SA 4.0 ⚠ non-commercial |
| Freedom House | Freedom in the World | © Freedom House |
| Tax Foundation | Tax-rate reference | © Tax Foundation |
| OECD Tax Database | Tax-rate reference | OECD terms |
| KPMG | Tax-rate reference | © KPMG |
| Wikipedia | Citizenship-law reference | CC BY-SA 4.0 |

## Required attribution

- **Visa data** derived from [passportindex.org](https://www.passportindex.org/), via
  [imorte/passport-index-data](https://github.com/imorte/passport-index-data) (MIT License).
- **Country metadata** from [mledoze/countries](https://github.com/mledoze/countries) (MIT License).
- **Made with Natural Earth** (public domain) — [naturalearthdata.com](https://www.naturalearthdata.com/).
- **Map tiles** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL 1.0).
- **GDP per capita and inflation** from the [World Bank](https://data.worldbank.org/) (CC BY 4.0).
- **Human Development Index** from the [UNDP Human Development Report](https://hdr.undp.org/) (CC BY 3.0 IGO).
- **Indices** sourced via [Our World in Data](https://ourworldindata.org/) (CC BY 4.0).
- **Corruption Perceptions Index 2024**, [Transparency International](https://www.transparency.org/en/cpi/2024) (CC BY-ND 4.0).
- **Human Rights Index and Liberal Democracy Index** from [V-Dem](https://v-dem.net/) (CC BY-NC-SA 4.0).
- **Freedom in the World 2024**, © [Freedom House](https://freedomhouse.org/report/freedom-world).
- **Tax rates** cross-checked against the [Tax Foundation](https://taxfoundation.org/),
  [OECD Tax Database](https://www.oecd.org/tax/tax-policy/tax-database/), and
  [KPMG Tax Rates Online](https://kpmg.com/xx/en/services/tax/tax-tools-and-resources/tax-rates-online.html).
- **Citizenship-law facts** compiled from [Wikipedia](https://en.wikipedia.org/) (CC BY-SA 4.0).

## Compliance notes

- **V-Dem** indices are licensed **CC BY-NC-SA 4.0 (non-commercial, share-alike)**. Confirm commercial use is
  permitted before monetising the site, and ensure any derived work is shared under the same license.
- **Freedom House** data is **© Freedom House — all rights reserved**. Review their republication terms before any
  commercial or redistributive use beyond simple attributed citation.
- **Transparency International** CPI is **CC BY-ND 4.0 (no derivatives)**. Scores are reproduced here as unmodified,
  factual data points.
- **Our World in Data** redistributes third-party data under CC BY 4.0, but the underlying publishers' licenses still
  apply to those datasets.
- **OpenStreetMap** tiles are used under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) with on-map
  attribution. Their public tile server is intended for light usage only; switch to a commercial CDN mirror or
  self-hosted tiles if traffic grows.

## Disclaimer

Citizenship Hub is owned and operated by [Built Brilliant](https://builtbrilliant.com) and is an independent
informational resource **not affiliated with, endorsed by, or sponsored by** any of the organisations listed above.
All data is provided "as is" for general informational purposes only and may be incomplete, out of date, or inaccurate.

Nothing on this site constitutes legal, immigration, tax, investment, or travel advice. Visa requirements, citizenship
rules, scores, fees, and tax rates change frequently and vary by individual circumstances — always verify with the
relevant official government source or a qualified professional before relying on any information.
