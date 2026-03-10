# Frontend Reference — Components & Hooks

## Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| Vite | 7 | Dev server + bundler |
| TypeScript | 5 | Type safety |
| Lucide React | latest | SVG icon library |
| Bun | 1.2+ | Runtime + package manager |

---

## Entry Point

### `main.tsx`
Standard React root. Mounts `<App />` into `#root`.

### `App.tsx`
Root component. Owns:
- Tab state (`activeTab: TabId`)
- Keyboard shortcut listener (F1–F5)
- Titlebar + Tab bar rendering
- Routes content to the correct panel component
- Auto-triggers `fetchIntel()` when headlines arrive and intel is empty

**Tab IDs:** `'news' | 'markets' | 'local' | 'intel'`

---

## Hooks

### `useDashboard(settings: Settings)`

**File:** `src/hooks/useDashboard.ts`

Central data management hook. Returns:

```typescript
{
  state: DashboardState
  fetchData: () => void      // Manually refresh all data
  fetchIntel: (headlines: NewsItem[]) => void
}
```

**`DashboardState`:**
```typescript
{
  globalNews:  NewsItem[]
  localNews:   NewsItem[]
  markets:     MarketsData | null
  weather:     WeatherData | null
  intel:       IntelBrief | null
  lastUpdated: Date | null
  loading: {
    globalNews: boolean
    localNews:  boolean
    markets:    boolean
    weather:    boolean
    intel:      boolean
  }
  errors: {
    globalNews: string | null
    localNews:  string | null
    markets:    string | null
    weather:    string | null
    intel:      string | null
  }
}
```

**Auto-refresh:** `setInterval(fetchData, settings.refreshInterval * 1000)`  
Default: every 5 seconds.

**API calls use relative paths** — `/api/news/global`, `/api/markets`, etc. — proxied by Vite to `:3001`.

**Intel guard:** `intelFetchingRef` prevents concurrent calls — only one GPT-4o request runs at a time.

---

### `useSettings()`

**File:** `src/hooks/useSettings.ts`

Manages user preferences in `localStorage`.

```typescript
{
  settings: Settings
  save: (patch: Partial<Settings>) => void
}
```

**Default settings:**
```typescript
{
  city:            'Jakarta',
  country:         'ID',
  lat:             -6.2,
  lon:             106.8,
  refreshInterval: 5          // seconds
}
```

On save, triggers a full data refresh in `useDashboard`.

---

## Components

### `NewsPanel`

**File:** `src/components/NewsPanel.tsx`  
**Props:** `{ items: NewsItem[], loading: boolean, error: string | null, count?: number }`

Bloomberg-style dense news grid:
- Column header: LEVEL / HEADLINE / SOURCE / TIME / CATEGORY
- Each row is a clickable `<a>` opening the article in a new tab
- Items limited to `count` (default: all)
- Threat level badges: `CRITICAL` (solid red), `HIGH` (bordered red), `MEDIUM` (amber), `LOW` (cyan), `INFO` (gray)
- Time displayed as `Xm`, `Xh`, `Xd` relative to now

---

### `MarketsPanel`

**File:** `src/components/MarketsPanel.tsx`  
**Props:** `{ data: MarketsData | null, loading: boolean, error: string | null }`

Three sections with Bloomberg-style column grid:

| Section | Columns |
|---------|---------|
| EQUITY INDICES | SYMBOL · NAME · LAST · CHG% |
| DIGITAL ASSETS | SYMBOL · NAME · LAST · 24H CHG% · MKT CAP |
| COMMODITIES | SYMBOL · NAME · LAST · CHG% |
| POLYMARKET | Question title + probability bar + volume |

- Up: `#00e676` green with ▲ TrendingUp icon
- Down: `#ff3333` red with ▼ TrendingDown icon
- Polymarket bars colored by probability: red ≥70%, amber ≥50%, cyan ≥30%, green otherwise

---

### `LocalPanel`

**File:** `src/components/LocalPanel.tsx`  
**Props:** weather + localNews + loading/error for each + city

Composed of:
1. **Weather current** — large temperature, 2×2 stat grid (HUMIDITY / WIND / UV INDEX / VISIBILITY)
2. **7-day forecast** — grid of 7 day columns with emoji icon, high (amber), low (cyan), rain
3. **Local news** — renders `<NewsPanel>` with local items, max 30

---

### `IntelPanel`

**File:** `src/components/IntelPanel.tsx`  
**Props:** `{ intel, loading, error, globalNews, onFetchIntel }`

States:
- **No API key**: Shows configuration instructions, "TRY ANYWAY" button
- **Loading**: Spinner + "GENERATING INTELLIGENCE BRIEF..."
- **Error**: Red error text
- **Populated**: Summary → KEY THREAT SIGNALS → COUNTRY RISK SCORES table

Country risk table columns: COUNTRY · RISK BAR · SCORE · DRIVER  
Risk bar colors: score ≥75 = red, ≥50 = amber, ≥25 = cyan, else green

---

### `SettingsModal`

**File:** `src/components/SettingsModal.tsx`

Bloomberg orange header modal with fields:
- City name (text)
- Country code (text, 2-letter ISO)
- Latitude (number)
- Longitude (number)
- Refresh interval (number, seconds)

Saves on "SAVE" button, closes on "CANCEL" or clicking overlay.

---

## Types (`src/types.ts`)

All shared TypeScript types used across components and hooks.

```typescript
type ThreatLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

interface NewsItem { title, source, publishedAt, url, level, category, isLocal }
interface CryptoPrice { id, symbol, name, priceUSD, change24h, marketCapUSD, volume24hUSD }
interface StockIndex { symbol, name, price, prevClose, changePct }
interface Commodity { symbol, name, price, prevClose, unit, changePct }
interface PredictionMarket { title, probability, volume, category, endDate, slug }
interface MarketsData { crypto, indices, commodities, predictions, fetchedAt }
interface WeatherConditions { city, tempC, feelsLikeC, humidity, windSpeedKmh, windDirection, description, icon, visibility, uvIndex, isDay }
interface DayForecast { date, maxTempC, minTempC, rainMM, icon, desc }
interface WeatherData { conditions, forecast, fetchedAt }
interface CountryRisk { country, score, reason }
interface IntelBrief { summary, threats, countryRisks, generatedAt, model }
interface Settings { city, country, lat, lon, refreshInterval }
```

---

## Vite Proxy Config

**File:** `frontend/vite.config.ts`

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    }
  }
}
```

This means all `fetch('/api/...')` calls in the frontend are forwarded to the backend automatically during development.
