# Blossom — Global Intelligence Terminal

> A clean, minimal, Bloomberg-style global intelligence dashboard. Combines OSINT feeds, financial markets, local weather, and AI-powered geopolitical analysis into a single terminal-inspired interface.

---

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) v1.2+
- OpenAI API key (optional — required only for Intel Brief)

### Run the project

```bash
# 1. Start backend (port 3001)
cd backend
bun install
bun run src/index.ts

# 2. Start frontend (port 5173)
cd frontend
bun install
bun run dev
```

Open **http://localhost:5173**

### Set your OpenAI API key

```bash
# backend/.env
OPENAI_API_KEY=sk-...
PORT=3001
```

---

## Navigation

| Key | Action |
|-----|--------|
| `F1` | Global News tab |
| `F2` | Markets tab |
| `F3` | Local tab |
| `F4` | Intel Brief tab |
| `F5` | Force refresh all data |

---

## Project Structure

```
blossom/
├── backend/          # Bun + Hono API server
│   └── src/
│       ├── index.ts              # Entry point
│       ├── routes/
│       │   ├── news.ts           # RSS news feeds + threat classification
│       │   ├── markets.ts        # Crypto, equities, commodities, Polymarket
│       │   ├── weather.ts        # Open-Meteo weather API
│       │   └── intel.ts          # OpenAI GPT-4o intelligence brief
│       └── services/
│           ├── cache.ts          # In-memory TTL cache
│           └── threatClassifier.ts # Keyword-based threat scoring
│
├── frontend/         # React + Vite + TypeScript
│   └── src/
│       ├── App.tsx               # Root: tab bar, titlebar, layout
│       ├── types.ts              # Shared TypeScript types
│       ├── index.css             # Bloomberg-style terminal CSS
│       ├── hooks/
│       │   ├── useDashboard.ts   # Data fetching + auto-refresh
│       │   └── useSettings.ts    # User settings (localStorage)
│       └── components/
│           ├── NewsPanel.tsx     # Global/local news feed
│           ├── MarketsPanel.tsx  # Markets ticker
│           ├── LocalPanel.tsx    # Weather + local news
│           ├── IntelPanel.tsx    # AI intel brief
│           └── SettingsModal.tsx # Location + refresh settings
│
├── docs/             # Project documentation (this folder)
└── .agent/           # AI agent skills
    └── skills/
        └── anti-slop-design/SKILL.md
```

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | System architecture and data flow |
| [api.md](./api.md) | Backend REST API reference |
| [frontend.md](./frontend.md) | Frontend component and hooks reference |
| [design.md](./design.md) | Design system and Bloomberg UI principles |
| [ai-prompts.md](./ai-prompts.md) | GPT-4o system/user prompts documentation |
| [configuration.md](./configuration.md) | Settings, environment variables |
| [data-sources.md](./data-sources.md) | All external data sources and feeds |
