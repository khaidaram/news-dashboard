# Architecture — Blossom Intelligence Terminal

## Overview

Blossom is a **two-process application**:

| Layer | Runtime | Framework | Port |
|-------|---------|-----------|------|
| Backend API | Bun | Hono | 3001 |
| Frontend SPA | Bun/Vite | React 19 + TypeScript | 5173 |

The frontend communicates with the backend exclusively via **relative `/api/*` paths** proxied by Vite during development. The backend is the single source of truth for all external API calls.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser  http://localhost:5173                                  │
│                                                                  │
│  App.tsx ──→ useDashboard hook (5s polling)                     │
│                 │                                                │
│                 ▼                                                │
│  ┌──────────────────────────────────────────────────┐           │
│  │  Vite Dev Server  (proxy /api/* → :3001)         │           │
│  └──────────────────────────────────────────────────┘           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────────────────────┐
│  Bun + Hono  http://localhost:3001                               │
│                                                                  │
│  Routes:                                                         │
│  ├── GET  /api/news/global     → RSS feeds → classify → cache   │
│  ├── GET  /api/news/local      → Google News RSS → classify     │
│  ├── GET  /api/markets         → CoinGecko + Yahoo + Polymarket │
│  ├── GET  /api/weather         → Open-Meteo                     │
│  ├── POST /api/intel/brief     → OpenAI GPT-4o                  │
│  └── POST /api/intel/local-brief → OpenAI GPT-4o               │
│                                                                  │
│  Services:                                                       │
│  ├── cache.ts       (in-memory TTL map)                         │
│  └── threatClassifier.ts  (keyword scoring)                     │
└─────────────────────────────────────────────────────────────────┘

External APIs:
├── RSS feeds: Reuters, BBC, AP, Al Jazeera, Guardian, Defense News…
├── CoinGecko (free tier) — crypto prices
├── Yahoo Finance chart API — indices + commodities
├── Polymarket gamma-api — prediction markets
├── Open-Meteo — weather forecast (free, no key required)
└── OpenAI API — GPT-4o for intelligence briefs
```

---

## Data Flow

### News (every 5s client poll, 5-minute server cache)

```
Client                   Backend                    External
  │                         │                           │
  ├─GET /api/news/global─▶  │                           │
  │                         ├─ check cache (5min TTL)   │
  │                         │    hit? return cached      │
  │                         │    miss?                   │
  │                         ├─ fetch 8 RSS feeds ──────▶│
  │                         │    Promise.allSettled()   │
  │                         ├─ classifyThreat() each    │
  │                         ├─ sort: level desc, time   │
  │                         ├─ deduplicate (40-char key)│
  │                         ├─ cacheSet(5min)           │
  │◀────────────────────────┤                           │
  │   NewsItem[]            │                           │
```

### Markets (every 5s client poll, 2-minute server cache)

```
Client                   Backend                    External
  │                         │                           │
  ├─GET /api/markets──────▶ │                           │
  │                         ├─ Promise.allSettled([     │
  │                         │    fetchCrypto()    ─────▶│ CoinGecko
  │                         │    fetchIndices()   ─────▶│ Yahoo Finance
  │                         │    fetchCommodities()────▶│ Yahoo Finance
  │                         │    fetchPredictions()────▶│ Polymarket
  │                         │  ])                       │
  │                         ├─ cacheSet(2min)           │
  │◀────────────────────────┤                           │
  │   MarketsData           │                           │
```

### Intel Brief (on demand, no cache)

```
Client                   Backend                    OpenAI
  │                         │                           │
  ├─POST /api/intel/brief─▶ │                           │
  │   {headlines: [...]}    │                           │
  │                         ├─ format headlineText      │
  │                         ├─ compose system+user───── ▶│ GPT-4o
  │                         │    prompts                │   temp=0.1
  │                         │                          ◀┤ raw text
  │                         ├─ parseBriefResponse()     │
  │◀────────────────────────┤                           │
  │   IntelBrief            │                           │
```

---

## Caching Strategy

| Cache Key | TTL | Content |
|-----------|-----|---------|
| `news:global` | 5 min | Global news items array |
| `news:local:{city}:{country}` | 5 min | Local news items array |
| `markets` | 2 min | Full MarketsData object |
| `weather:{lat}:{lon}` | 10 min | WeatherData object |

Cache is implemented as an in-memory `Map` with expiry timestamps — no Redis required. On restart, cache is cold and all data is re-fetched.

---

## Security Notes

- **OpenAI API key** is stored only in `backend/.env` — never sent to the frontend
- CORS is configured to allow only `localhost:5173` and `localhost:4173`
- No authentication layer (local-only tool by design)
- All external fetches use `AbortSignal.timeout()` to prevent hanging requests
