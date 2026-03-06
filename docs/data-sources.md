# Data Sources — Blossom

## News Feeds (RSS)

### Global Sources

| Name | Feed URL | Content |
|------|----------|---------|
| Reuters | `feeds.reuters.com/reuters/topNews` | Top global news |
| BBC World | `feeds.bbci.co.uk/news/world/rss.xml` | World news |
| AP News | `rsshub.app/apnews/topics/apf-topnews` | AP top news (via RSSHub) |
| Al Jazeera | `aljazeera.com/xml/rss/all.xml` | Middle East + global |
| The Guardian | `theguardian.com/world/rss` | World news |
| Defense News | `defensenews.com/arc/outboundfeeds/rss/` | Military + defense |
| Politico | `rss.politico.com/politics-news.xml` | US + EU politics |
| Foreign Policy | `foreignpolicy.com/feed/` | Geopolitical analysis |

**Filter:** Items older than 24 hours are excluded.  
**Deduplication:** Items with matching first 40 characters are dropped.  
**Timeout:** 10 seconds per feed. Failed feeds are silently skipped.

### Local News Sources

| Name | URL Template | Notes |
|------|-------------|-------|
| Google News Local | `news.google.com/rss/search?q={city}+news&hl=en&gl={country}` | Keyword search |
| Google News Geo | `news.google.com/rss/headlines/section/geo/{city}` | Geographic section |

---

## Financial Markets

### Crypto — CoinGecko

**Endpoint:** `https://api.coingecko.com/api/v3/coins/markets`  
**Auth:** None (free public API)  
**Rate limit:** ~30 req/min on free tier  
**Coins tracked:** Bitcoin, Ethereum, Solana, BNB, XRP, Cardano

**Fields returned:**
- `current_price` → `priceUSD`
- `price_change_percentage_24h` → `change24h`
- `market_cap` → `marketCapUSD`
- `total_volume` → `volume24hUSD`

**If rate limited (HTTP 429):** Error is returned, previous cached data retained by frontend.

---

### Equity Indices + Commodities — Yahoo Finance

**Endpoint:** `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`  
**Auth:** None (unofficial endpoint)  
**Timeout:** 15 seconds per symbol  
**Symbols:**

| Display | Yahoo Symbol | Category |
|---------|-------------|----------|
| S&P 500 | `%5EGSPC` | Index |
| Dow Jones | `%5EDJI` | Index |
| NASDAQ | `%5EIXIC` | Index |
| WTI Crude | `CL%3DF` | Commodity |
| Gold | `GC%3DF` | Commodity |
| Copper | `HG%3DF` | Commodity |

**Change % calculation:**
```
changePct = meta.regularMarketChangePercent
            || ((currentPrice - prevClose) / prevClose * 100)
```

> **Note:** Yahoo Finance's unofficial API has no official SLA. It may occasionally return errors during market hours or maintenance. Failed symbols return `{ price: 0, changePct: 0 }` rather than crashing the entire request.

---

### Prediction Markets — Polymarket

**Endpoint:** `https://gamma-api.polymarket.com/markets`  
**Auth:** None  
**Filter:** `tag_id=100265` (geopolitical events), active only, sorted by volume descending  
**Limit:** Top 10 markets returned

**Fields:**
- `question` → `title`
- `outcomeprices[0]` → `probability` (first outcome = YES probability)
- `volume` → USD total traded volume
- `endDateIso` → market resolution date

> **Note:** Polymarket API is public but unofficial. The `outcomeprices` field format may change. Current implementation handles both `outcomeprices` and `outcomePrices` camelCase variants.

---

## Weather — Open-Meteo

**Endpoint:** `https://api.open-meteo.com/v1/forecast`  
**Auth:** None (completely free, no API key)  
**Rate limit:** 10,000 requests/day per IP (generous for local tools)  
**Cache:** 10 minutes

**Parameters requested:**
```
current: temperature_2m, relative_humidity_2m, apparent_temperature,
         precipitation, weather_code, wind_speed_10m, wind_direction_10m,
         uv_index, visibility, is_day
daily:   temperature_2m_max, temperature_2m_min, precipitation_sum,
         weather_code (7 days)
```

**Weather code → emoji mapping:** Implemented in `backend/src/routes/weather.ts`.  
Standard WMO weather codes 0–99.

---

## AI — OpenAI GPT-4o

**Endpoint:** `https://api.openai.com/v1/chat/completions`  
**Auth:** `OPENAI_API_KEY` in `backend/.env`  
**Model:** `gpt-4o`  
**Billing:** Pay-per-token. Approximate cost per Intel Brief:
- Input: ~1500 tokens (50 headlines + system prompt)
- Output: ~900 tokens (max_tokens)
- **Cost:** ~$0.005–0.01 per brief at GPT-4o pricing

**Timeout:** 45s for global brief, 30s for local brief.

If the API key is missing, the endpoint returns a graceful JSON response (no error thrown):
```json
{ "summary": "No OPENAI_API_KEY set...", "threats": [], "countryRisks": [], "model": "none" }
```

---

## Threat Classifier (Internal)

**File:** `backend/src/services/threatClassifier.ts`  
**Purpose:** Assign threat levels to news headlines using keyword matching (no external API).

**Level hierarchy:**

| Level | Description | Example keywords |
|-------|-------------|---------|
| `CRITICAL` | Active conflict, mass casualty events, nuclear | `war`, `nuclear`, `bombing`, `massacre`, `invasion` |
| `HIGH` | Significant violence, terrorism, major sanctions | `killed`, `attack`, `sanctions`, `terrorism`, `military` |
| `MEDIUM` | Political unrest, economic crises, significant elections | `protest`, `election`, `crisis`, `recession`, `detained` |
| `LOW` | Diplomatic incidents, minor tensions | `talks`, `warning`, `dispute`, `suspend` |
| `INFO` | Everything else | *(no matching keywords)* |

**Categories assigned:** `CONFLICT`, `SECURITY`, `POLITICS`, `ECONOMY`, `GENERAL`
