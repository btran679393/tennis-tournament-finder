# Tennis Tournament Finder

A React and Express app for finding nearby UTR, USTA, and local tennis tournaments.

## Quick Start

This project has two apps:

- `BackEnd`: Express API
- `Frontend`: Vite React app

Install everything from the repo root:

```bash
npm run install:all
```

Start the backend:

```bash
npm run dev:backend
```

Start the frontend in another terminal:

```bash
npm run dev:frontend
```

Open:

```text
http://127.0.0.1:5173/
```

## Local Data Mode

The default local setup uses `BackEnd/data/tournaments.json`. This avoids requiring SQL Server just to review or develop the site.

```bash
DATA_SOURCE=json
PORT=5050
```

## SQL Server Mode

SQL Server is optional. To use it, install the SQL Server ODBC driver for your machine, then set:

```bash
DATA_SOURCE=sql
SQL_SERVER_CONNECTION_STRING=Driver={ODBC Driver 17 for SQL Server};Server=localhost\SQLEXPRESS;Database=TennisTournamentDB;Trusted_Connection=yes;TrustServerCertificate=yes;
```

If SQL is unavailable, the API falls back to the bundled JSON data instead of failing startup.

## AI Tennis Pro

The AI endpoint needs an OpenRouter API key:

```bash
OPENROUTER_API_KEY=your_key_here
```

Simple tournament filters are handled locally by the app. The AI endpoint is only needed for free-form questions.

## Useful Scripts

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
npm run build
npm run lint
```

## API

Primary endpoint:

```text
GET /api/tournaments
```

Supported query parameters:

- `q`: text search across tournament name, city, state, source, level, and category
- `city`: city filter
- `source`: `UTR`, `USTA`, or `Local`
- `category`: `Junior`, `Adult`, or `Prize Money`
- `maxPrice`: maximum entry price
- `minUtr`: minimum upper UTR range
- `maxUtr`: maximum upper UTR range
- `lat`, `lon`, `maxMiles`: distance filter
- `dateRange`: `all`, `weekend`, or `future`
- `sort`: `date`, `distance`, `priceLow`, `priceHigh`, or `highestUtr`

Compatibility endpoint:

```text
GET /api/tournaments-db
```

This returns the same normalized data as `/api/tournaments`.
