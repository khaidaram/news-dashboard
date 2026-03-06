# 🌸 Blossom — Global Intelligence Terminal

A clean, Bloomberg-style global intelligence dashboard. Aggregates global news, financial markets, local weather, and AI-powered geopolitical analysis into a single terminal interface.

![alt text](image.png)

---

## Features

- **Global News** — RSS aggregation from Reuters, BBC, Al Jazeera, AP, Guardian, Defense News, Politico, Foreign Policy. Threat-classified (CRITICAL → INFO) and deduplicated.
- **Markets** — Live crypto (CoinGecko), equity indices + commodities (Yahoo Finance), Polymarket prediction markets for geopolitical events.
- **Local** — Weather conditions + 7-day forecast (Open-Meteo, no key required) + local news for any city.
- **Intel Brief** — GPT-4o geopolitical analysis: situation summary, 5 key threat signals, 10-country instability risk scores (0–100).
- **Auto-refresh** — All data refreshes every 5 seconds with backend caching to avoid rate limits.
- **Terminal UI** — Bloomberg Terminal-inspired: true black, orange labels, JetBrains Mono, 22px dense rows.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 + TypeScript |
| Backend | Bun + Hono v4 |
| Icons | Lucide React |
| AI | OpenAI GPT-4o |
| Weather | Open-Meteo (free, no key) |
| Crypto | CoinGecko (free tier) |
| Markets | Yahoo Finance chart API |
| Predictions | Polymarket gamma API |

---

## Local Development

### Prerequisites
- [Bun](https://bun.sh) v1.2+
- OpenAI API key (optional — for Intel Brief only)

```bash
# 1. Backend
cd backend
bun install
cp .env.example .env        # then edit .env with your OPENAI_API_KEY
bun run dev                 # starts on http://localhost:3001

# 2. Frontend (new terminal)
cd frontend
bun install
bun run dev                 # starts on http://localhost:5173
```

Open **http://localhost:5173**

### Backend environment (`backend/.env`)

```env
OPENAI_API_KEY=sk-...    # Required for Intel Brief
PORT=3001               # Optional, default 3001
FRONTEND_URL=http://localhost:5173  # Optional, CORS allowlist
```

---

## Vercel Deployment

The project deploys as **two separate Vercel projects**: backend first, then frontend.

### Step 1 — Deploy Backend

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the repository, set **Root Directory** to `backend`
3. Set **Framework Preset** to `Other`
4. Set build command to `echo done` (no build needed — Vercel compiles TypeScript automatically)
5. Set output directory to empty
6. Add environment variables:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | `sk-your-key-here` |
| `FRONTEND_URL` | *(leave empty for now, add after frontend deploys)* |

7. Deploy → note the URL, e.g. `https://blossom-api.vercel.app`

### Step 2 — Deploy Frontend

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the same repository, set **Root Directory** to `frontend`
3. **Framework Preset:** Vite (auto-detected)
4. Add environment variables:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://blossom-api.vercel.app` (your backend URL from Step 1) |

5. Deploy → note the URL, e.g. `https://blossom.vercel.app`

### Step 3 — Connect CORS

Go back to the **backend** project in Vercel → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | `https://blossom.vercel.app` |

Redeploy the backend.

---

## Project Structure

```
blossom/
├── backend/
│   ├── api/
│   │   └── index.ts          # Vercel serverless entry point
│   ├── src/
│   │   ├── app.ts            # Hono app (routes + middleware)
│   │   ├── index.ts          # Bun local dev entry point
│   │   ├── routes/
│   │   │   ├── news.ts       # RSS feeds + threat classifier
│   │   │   ├── markets.ts    # Crypto, indices, commodities, Polymarket
│   │   │   ├── weather.ts    # Open-Meteo weather
│   │   │   └── intel.ts      # OpenAI GPT-4o briefs
│   │   └── services/
│   │       ├── cache.ts
│   │       └── threatClassifier.ts
│   ├── vercel.json           # Serverless routing config
│   └── .env.example          # Environment variable template
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Tab layout + keyboard shortcuts
│   │   ├── index.css         # Bloomberg terminal CSS
│   │   ├── types.ts          # Shared TypeScript types
│   │   ├── hooks/
│   │   │   ├── useDashboard.ts  # Data fetching + auto-refresh
│   │   │   └── useSettings.ts   # User preferences (localStorage)
│   │   └── components/
│   │       ├── NewsPanel.tsx
│   │       ├── MarketsPanel.tsx
│   │       ├── LocalPanel.tsx
│   │       ├── IntelPanel.tsx
│   │       └── SettingsModal.tsx
│   ├── vercel.json           # SPA fallback routing
│   └── .env.local.example    # Frontend env template
│
└── docs/                     # Full project documentation
    ├── README.md
    ├── architecture.md
    ├── api.md
    ├── frontend.md
    ├── design.md
    ├── ai-prompts.md
    └── data-sources.md
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F1` | Global News |
| `F2` | Markets |
| `F3` | Local |
| `F4` | Intel Brief |
| `F5` | Force refresh |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/news/global` | Global RSS news (cached 5min) |
| `GET` | `/api/news/local?city=&country=` | Local news for any city (cached 5min) |
| `GET` | `/api/markets` | Crypto + indices + commodities + Polymarket (cached 2min) |
| `GET` | `/api/weather?lat=&lon=&city=` | Weather + 7-day forecast (cached 10min) |
| `POST` | `/api/intel/brief` | GPT-4o global intelligence brief |
| `POST` | `/api/intel/local-brief` | GPT-4o local situational summary |

Full API documentation: [docs/api.md](./docs/api.md)

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No* | GPT-4o key. Without it, Intel Brief returns a setup message. |
| `PORT` | No | Server port. Default: `3001` |
| `FRONTEND_URL` | No | CORS allowlist. Comma-separated URLs. Default: allows all. |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | Backend base URL. Empty in dev (Vite proxy handles it). Set to backend Vercel URL in production. |

---

## Data Sources

| Source | Data | Rate Limit | API Key |
|--------|------|-----------|---------|
| Reuters / BBC / AP / Al Jazeera / Guardian / Defense News / Politico / Foreign Policy | Global news | No official limit | None |
| Google News RSS | Local news by city | No official limit | None |
| [CoinGecko](https://coingecko.com) | Crypto prices | 30 req/min free | None |
| [Yahoo Finance](https://finance.yahoo.com) | Indices + commodities | Unofficial | None |
| [Polymarket](https://polymarket.com) | Prediction markets | No official limit | None |
| [Open-Meteo](https://open-meteo.com) | Weather | 10,000 req/day | None |
| [OpenAI](https://openai.com) | GPT-4o Intel Brief | Account limits | Required |

---

## License

MIT
