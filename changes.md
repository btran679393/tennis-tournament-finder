# Changes

This pass focused on making the repo easier to run locally, making the data layer more reliable, and turning the site into a more useful tournament browsing tool.

## How to run it now

From the repo root:

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
```

Then open:

```text
http://127.0.0.1:5173/
```

The backend now defaults to port `5050` because port `5000` can conflict with macOS AirPlay/Control Center.

## Repo setup

- Added a root `package.json` with shared scripts for install, backend dev, frontend dev, build, and lint.
- Added a root `README.md` with setup steps, API details, SQL mode, JSON mode, and environment notes.
- Added `BackEnd/.env.example` and `Frontend/.env.example` so required configuration is visible.

Why: a reviewer should not have to inspect backend and frontend package files manually just to start the app.

## Backend

- Added `BackEnd/services/tournamentService.js`.
- Moved tournament loading, normalization, filtering, sorting, city lists, distance filtering, and UTR parsing into that service.
- Kept SQL Server support, but made it opt-in with `DATA_SOURCE=sql`.
- Made JSON data the default local mode, using `BackEnd/data/tournaments.json`.
- Changed `msnodesqlv8` to an optional dependency so npm install can succeed on machines without SQL Server ODBC headers.
- Added a `SQL_SERVER_CONNECTION_STRING` environment override.
- Disabled scheduled scraping by default. It now only runs when `ENABLE_SCHEDULED_SCRAPE=true`.
- Updated `/api/tournaments` to return normalized search results and metadata.
- Kept `/api/tournaments-db` as a compatibility endpoint for older frontend code.

Why: the previous backend assumed a local Windows SQL Server Express setup and could fail immediately on other machines. The app now works from a fresh checkout while still preserving the SQL path.

## API

`GET /api/tournaments` now supports:

- `q`
- `city`
- `source`
- `category`
- `maxPrice`
- `minUtr`
- `maxUtr`
- `lat`
- `lon`
- `maxMiles`
- `dateRange`
- `sort`

The response includes:

- `dataSource`
- `count`
- `total`
- `cities`
- `tournaments`

Why: filtering and sorting should not be duplicated across frontend components. The backend now owns the canonical tournament search behavior.

## Frontend

- Reworked the page into a denser search workspace with filters on the left and results on the right.
- Added server-backed filters instead of only filtering locally.
- Added saved filters with `localStorage`.
- Added quick filters:
  - This weekend
  - Near me
  - Under $50
  - Juniors
  - Highest UTR
- Added city autocomplete from API data.
- Added UTR min/max filters.
- Added distance filtering with browser geolocation.
- Added clearer loading, empty, API error, and JSON fallback states.
- Grouped results by tournament day.
- Improved tournament cards for scanability: source, date, location, category, level, price, players, UTR, and registration link.
- Changed frontend API config to use `VITE_API_BASE`, defaulting to `http://localhost:5050`.

Why: the original site worked as a demo, but it was harder to scan and depended on more client-side logic. The new interface is closer to an actual tournament finder.

## Verification

Ran:

```bash
npm run build
npm run lint
```

Checked:

- Backend starts from the root script.
- Frontend starts from the root script.
- `/api/tournaments` returns normalized filtered data.
- `/api/tournaments-db` still returns an array for compatibility.
- Browser loads the app at `http://127.0.0.1:5173/`.
- The app renders tournament results using JSON fallback data.

## Notes

- `AI Tennis Pro` still requires `OPENROUTER_API_KEY`.
- SQL Server mode still requires the correct SQL Server ODBC driver and a working connection string.
- The bundled JSON data is useful for local development, but production-quality results depend on scraper/data freshness.
