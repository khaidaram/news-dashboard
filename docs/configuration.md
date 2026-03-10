# Configuration — Blossom

## Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` to get started.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | No* | — | OpenAI API key for Intel Brief. Without it, the Intel tab shows a graceful setup message instead of crashing. |
| `PORT` | No | `3001` | HTTP port for the Bun local server. Vercel ignores this. |
| `FRONTEND_URL` | No | *(allows all)* | CORS allowlist. Comma-separated frontend origins. Example: `https://blossom.vercel.app,http://localhost:5173` |

*`OPENAI_API_KEY` is technically optional — the app degrades gracefully.

### Frontend (`frontend/.env.local`)

Copy `frontend/.env.local.example` to `frontend/.env.local` to override defaults.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `""` (empty) | Backend base URL. Empty in dev — Vite proxy routes `/api/*` to `localhost:3001`. In production, set to your deployed backend URL (e.g. `https://blossom-api.vercel.app`). |

---

## User Settings (localStorage)

Settings are stored in the browser's `localStorage` under the key `blossom-settings`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `city` | string | `Jakarta` | City name for local news + weather |
| `country` | string | `ID` | ISO 3166-1 alpha-2 country code (used for Google News localization) |
| `lat` | number | `-6.2` | Latitude for Open-Meteo weather |
| `lon` | number | `106.8` | Longitude for Open-Meteo weather |
| `refreshInterval` | number | `5` | Polling interval in **seconds** |

To change your location:
1. Click **CFG** in the top-right corner
2. Update city, country code, and coordinates
3. Click **SAVE**

To find coordinates: search your city on [open-meteo.com](https://open-meteo.com)

---

## Backend Cache TTLs

Configured in `backend/src/services/cache.ts`:

| Category | TTL | Notes |
|----------|-----|-------|
| `TTL.NEWS` | 5 minutes | Applied to both global and local news |
| `TTL.MARKETS` | 2 minutes | CoinGecko free tier limits apply |
| `TTL.WEATHER` | 10 minutes | Open-Meteo data doesn't change rapidly |

Cache is in-memory — resets on server restart. Redis can be added for persistent caching across Vercel serverless invocations.

> **Note on Vercel cold starts:** Vercel serverless functions are stateless. The in-memory cache will be empty on each cold invocation. Under normal traffic, warm instances will retain cache. For production, consider adding Vercel KV (Redis-compatible) for persistent caching.

---

## Threat Classifier Tuning

The threat classifier in `backend/src/services/threatClassifier.ts` assigns CRITICAL/HIGH/MEDIUM/LOW/INFO levels to news headlines based on keyword matching.

To tune classification:
- Add keywords to CRITICAL list: `war`, `nuclear`, `attack`, `bombing`…
- Add keywords to HIGH list: `killed`, `sanctions`, `terrorism`…
- Add categories: `CONFLICT`, `SECURITY`, `POLITICS`, `ECONOMY`, `GENERAL`

The classifier runs on every news item at fetch time, before caching.
