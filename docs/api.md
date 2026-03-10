# Backend API Reference

Base URL: `http://localhost:3001`  
All routes are also accessible via the Vite proxy at `/api/*` from the frontend.

---

## Health Check

```
GET /
```

**Response:**
```json
{ "name": "blossom-api", "version": "1.0.0", "status": "ok" }
```

---

## News

### GET `/api/news/global`

Fetches deduplicated, threat-classified news from 8 global RSS sources.  
**Cache:** 5 minutes (in-memory)

**Response:** `NewsItem[]`

```typescript
interface NewsItem {
  title:       string      // Headline text
  source:      string      // Feed name (e.g. "BBC World")
  publishedAt: string      // ISO 8601 timestamp
  url:         string      // Original article URL
  level:       ThreatLevel // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  category:    string      // "SECURITY" | "CONFLICT" | "POLITICS" | "ECONOMY" | "GENERAL"
  isLocal:     boolean     // false for global
}
```

**Sorting:** By `level` desc (CRITICAL first), then by `publishedAt` desc.  
**Deduplication:** Items whose first 40 chars match an earlier item are dropped.

---

### GET `/api/news/local?city={city}&country={country}`

Fetches local news via Google News RSS for the given location.  
**Cache:** 5 minutes per `{city}:{country}` pair

**Query params:**

| Param | Required | Default | Example |
|-------|----------|---------|---------|
| `city` | yes | — | `Jakarta` |
| `country` | no | `US` | `ID` |

**Response:** `NewsItem[]` (same structure as global, `isLocal: true`)

**Sources used:**
- `news.google.com/rss/search?q={city}+news` — keyword search
- `news.google.com/rss/headlines/section/geo/{city}` — geo headlines

---

## Markets

### GET `/api/markets`

Fetches all market data in a single request.  
**Cache:** 2 minutes

**Response:** `MarketsData`

```typescript
interface MarketsData {
  crypto:      CryptoPrice[]      // BTC, ETH, SOL, BNB, XRP, ADA
  indices:     StockIndex[]       // S&P 500, Dow Jones, NASDAQ
  commodities: Commodity[]        // WTI Crude, Gold, Copper
  predictions: PredictionMarket[] // Top Polymarket geopolitical markets
  fetchedAt:   string             // ISO timestamp
}

interface CryptoPrice {
  id:           string   // CoinGecko ID (e.g. "bitcoin")
  symbol:       string   // e.g. "BTC"
  name:         string   // e.g. "Bitcoin"
  priceUSD:     number
  change24h:    number   // Percentage
  marketCapUSD: number
  volume24hUSD: number
}

interface StockIndex {
  symbol:    string
  name:      string   // "S&P 500" | "Dow Jones" | "NASDAQ"
  price:     number
  prevClose: number
  changePct: number   // Percentage
}

interface Commodity {
  symbol:    string   // Yahoo Finance symbol
  name:      string   // "WTI Crude Oil" | "Gold" | "Copper"
  price:     number
  prevClose: number
  unit:      string   // "$/bbl" | "$/oz" | "$/lb"
  changePct: number   // Percentage
}

interface PredictionMarket {
  title:       string   // Market question
  probability: number   // 0.0–1.0
  volume:      number   // USD traded
  category:    string   // Polymarket tag slug
  endDate:     string   // ISO date YYYY-MM-DD
  slug:        string   // Polymarket market slug
}
```

**Data sources:**
- Crypto: CoinGecko `/v3/coins/markets`
- Indices + Commodities: Yahoo Finance `/v8/finance/chart/{symbol}`
- Predictions: Polymarket `gamma-api.polymarket.com/markets?tag_id=100265`

---

## Weather

### GET `/api/weather?lat={lat}&lon={lon}&city={city}`

Fetches current conditions and 7-day forecast.  
**Cache:** 10 minutes per `{lat}:{lon}`

**Query params:**

| Param | Required | Example |
|-------|----------|---------|
| `lat` | yes | `-6.2` |
| `lon` | yes | `106.8` |
| `city` | yes | `Jakarta` |

**Response:** `WeatherData`

```typescript
interface WeatherData {
  conditions: WeatherConditions
  forecast:   DayForecast[]     // 7 days
  fetchedAt:  string
}

interface WeatherConditions {
  city:         string
  tempC:        number
  feelsLikeC:   number
  humidity:     number     // %
  windSpeedKmh: number
  windDirection: string    // "N" | "NE" | ... 
  description:  string
  icon:         string     // Weather emoji (☀️ ⛈ etc.)
  visibility:   number     // meters
  uvIndex:      number
  isDay:        boolean
}

interface DayForecast {
  date:     string    // "YYYY-MM-DD"
  maxTempC: number
  minTempC: number
  rainMM:   number    // Total precipitation (mm)
  icon:     string    // Weather emoji
  desc:     string
}
```

**Source:** Open-Meteo API (free, no API key required)

---

## Intel Brief

### POST `/api/intel/brief`

Generates a global geopolitical intelligence brief using GPT-4o.  
**No cache** — each call hits OpenAI.  
**Requires:** `OPENAI_API_KEY` in `backend/.env`

**Request body:**
```json
{
  "headlines": [
    {
      "title": "Tehran hit by bombing...",
      "level": "HIGH",
      "source": "Al Jazeera",
      "category": "SECURITY",
      "publishedAt": "2026-03-06T07:00:00Z"
    }
  ]
}
```

**Response:** `IntelBrief`

```typescript
interface IntelBrief {
  summary:      string         // 3-5 sentence geopolitical summary
  threats:      string[]       // 5 key threat bullets
  countryRisks: CountryRisk[]  // 10 countries with instability scores
  generatedAt:  string         // ISO timestamp
  model:        string         // e.g. "gpt-4o-2024-11-20"
}

interface CountryRisk {
  country: string    // Country name
  score:   number    // 0–100 instability score
  reason:  string    // 3-5 word driver
}
```

**GPT-4o parameters:**
- `temperature: 0.1` — near-deterministic for factual analysis
- `max_tokens: 900`
- `timeout: 45s`

**No API key response (graceful):**
```json
{
  "summary": "No OPENAI_API_KEY set...",
  "threats": [],
  "countryRisks": [],
  "generatedAt": "...",
  "model": "none"
}
```

---

### POST `/api/intel/local-brief`

Generates a local situational summary for a given city.

**Request body:**
```json
{
  "headlines": [...],
  "weather": { "conditions": {...}, "forecast": [...] },
  "city": "Jakarta"
}
```

**Response:**
```json
{
  "summary": "Rain expected this afternoon...",
  "generatedAt": "...",
  "model": "gpt-4o-..."
}
```

**GPT-4o parameters:**
- `temperature: 0.2`
- `max_tokens: 350`
- `timeout: 30s`

---

## Error Responses

All routes return JSON errors:

```json
{ "error": "Description of what went wrong" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request (missing required body fields) |
| `500` | Upstream API failure or internal error |

External API failures within an `allSettled` call are silently degraded (empty array returned instead of crashing).
