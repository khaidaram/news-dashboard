# Bandar Underwater Scanner — System Brief

## Objective

Build a system that scans 200 Indonesian stocks from the TradersAham broker intelligence API, filters them through a multi-layer scoring pipeline, and outputs ranked swing trade candidates with execution plans. The system runs as a daily/on-demand scanner optimized for finding stocks where smart money (bandar) is accumulating but price is still near or below their average cost — the "bandar underwater" sweet spot.

## Tech Stack

- **Runtime**: Node.js / Bun
- **Language**: TypeScript (strict mode)
- **HTTP Client**: native fetch or axios
- **Output**: JSON results + optional React dashboard (Next.js or Vite)
- **Storage**: local JSON or SQLite for caching API responses and historical scans

---

## Architecture Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Step 1       │    │  Step 2       │    │  Step 3       │    │  Step 4       │
│  Fetch 200    │───▶│  Hard Filter  │───▶│  Deep Dive    │───▶│  Score &      │
│  Stock List   │    │  Quality Gate │    │  Per Stock     │    │  Rank         │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     ~200 stocks        ~40-60 pass         ~15-25 pass         Top N output
```

---

## Step 1 — Fetch Stock Universe (200 stocks)

### Endpoint

```
GET https://apiv2.tradersaham.com/api/market-insight/broker-intelligence/by-stock
```

### Parameters

| Param           | Value                          | Notes                                    |
|-----------------|--------------------------------|------------------------------------------|
| `limit`         | `50`                           | Fixed per page                           |
| `page`          | `1`, `2`, `3`, `4`            | Loop all 4 pages = 200 stocks            |
| `sort_by`       | `net_value`                    | Sorted by highest net accumulation       |
| `investor_type` | `all`                          | All investor types                       |
| `board`         | `R`                            | Regular board only                       |
| `start_date`    | `${startDate}`                 | User-configurable (format: `YYYY-MM-DD`) |
| `end_date`      | `${endDate}`                   | User-configurable (format: `YYYY-MM-DD`) |

### Implementation Notes

- Fetch pages sequentially with a small delay (200-300ms) to avoid rate limiting.
- Merge all 4 page results into a single `StockCandidate[]` array.
- The `startDate` and `endDate` are user inputs — support presets like `1M`, `2M`, `3M` (max 3 months) as well as custom date range.
- Each stock object from API contains at minimum: `stock_code`, `net_value` (total net), `broker_count`, `consistency` (e.g. "15/17"), `avg_price`, `float_pl`.

### Broker Filter

Only consider activity from these specific broker codes: **AK, BK, ZP, KZ, RX**. These are the institutional/"bandar" brokers we track. If the API supports broker code filtering via query params, use it. If not, filter client-side after fetching — only count net value, consistency, and broker count from these 5 brokers.

### Expected Response Shape (adapt to actual API)

```typescript
interface StockListItem {
  stock_code: string;
  stock_name: string;
  net_value: number;          // total net in Rupiah
  broker_count: number;       // number of distinct brokers accumulating
  consistency: string;        // e.g. "15/17"
  consistency_days: number;   // parsed: 15
  consistency_total: number;  // parsed: 17
  avg_price: number;          // average accumulation price
  float_pl: number;           // float P/L percentage
  top_brokers: BrokerEntry[]; // individual broker breakdown
}

interface BrokerEntry {
  broker_code: string;
  net_value: number;
  avg_price: number;
}
```

---

## Step 2 — Hard Quality Filters

Apply pass/fail gates on the 200-stock list. These are non-negotiable minimum thresholds.

### Filter Criteria

```typescript
function passQualityGate(stock: StockListItem): boolean {
  const consistencyPct = stock.consistency_days / stock.consistency_total;
  
  return (
    consistencyPct >= 0.60 &&       // at least 60% of trading days show accumulation
    stock.broker_count >= 2          // multi-broker consensus (not single-broker noise)
  );
}
```

### Why These Thresholds

- **Consistency ≥ 60%**: below this, the "accumulation" could be sporadic buying, not a deliberate campaign.
- **Brokers ≥ 2**: single broker accumulation is unreliable — could be internal transfer or one-off. Two or more brokers agreeing signals real consensus.

### Output

`QualifiedStock[]` — typically 40-60 stocks pass this gate.

---

## Step 3 — Deep Dive Per Candidate

For each stock that passes Step 2, fetch detailed broker profiler data and compute the edge metrics.

### 3A — Fetch Broker Summary

#### Endpoint

```
GET https://apiv2.tradersaham.com/api/market-insight/broker-profiler/summary
```

#### Parameters

| Param        | Value             |
|--------------|-------------------|
| `stock_code` | `{stock_code}`    |
| `metric`     | `net`             |
| `start_date` | `${startDate}`    |
| `end_date`   | `${endDate}`      |
| `board`      | `R`               |

#### What to Extract

From the broker summary response:

1. **avg_bandar_price**: The weighted average price at which the tracked brokers (AK, BK, ZP, KZ, RX) accumulated. This is the critical "defense level."
2. **Top broker accumulation vs distribution net value**: Compare the cumulative net value of top accumulating brokers against top distributing brokers. A healthy setup has accumulation net >> distribution net (ratio ≥ 2:1).
3. **Individual broker positions**: Which of the 5 tracked brokers are in the top accumulators? More tracked brokers in top positions = stronger signal.

#### Rate Limiting

This step makes 1 API call per candidate (40-60 calls). Implement:
- Sequential fetching with 300ms delay between calls
- Retry logic (max 3 retries with exponential backoff)
- Cache responses locally (keyed by `stock_code + date_range`) to avoid re-fetching on re-runs

### 3B — Compute Float P/L (Edge Filter)

```typescript
function computeFloatPL(currentPrice: number, avgBandarPrice: number): number {
  return (currentPrice - avgBandarPrice) / avgBandarPrice;
}
```

### 3C — Apply Sweet Spot Filter

```typescript
function isInSweetSpot(floatPL: number): boolean {
  return floatPL >= -0.08 && floatPL <= 0.02;
}
```

#### Sweet Spot Logic

| Float P/L Zone   | Interpretation                                          | Action   |
|-------------------|---------------------------------------------------------|----------|
| > +0.02           | Bandar already in profit — upside urgency reduced       | **SKIP** |
| -0.03 to +0.02    | Near breakeven — mild defense pressure, still good      | PASS     |
| -0.08 to -0.03    | **Optimal** — strong pressure to defend and push up     | PASS ★   |
| < -0.08           | Deep underwater — risk of capitulation or thesis broken  | **SKIP** |

The -0.08 to +0.02 window is the tradeable zone. Within it, -0.08 to -0.03 scores highest.

### 3D — Fetch Recent Heatmap (Last 5 Trading Days)

Use the same by-stock endpoint but with `start_date` = 5 trading days ago and `end_date` = today. Extract daily net values to assess recent momentum.

#### Momentum Criteria

```typescript
interface MomentumCheck {
  greenDays: number;        // days with positive net value in last 5
  d0NetValue: number;       // most recent day's net value
  avgDailyNet: number;      // average daily net over the 5 days
  d0IsSpike: boolean;       // d0_net > 1.5x avg_daily_net
  lastDayNetValue: number;  // raw value for scoring
}

function passMomentumFilter(m: MomentumCheck): boolean {
  return (
    m.greenDays >= 3 &&               // at least 3 of 5 days positive
    m.d0NetValue > m.avgDailyNet      // D-0 shows acceleration, not fading
  );
}
```

#### Spike Volume Scoring

D-0 spike matters — the bigger the last-day net value relative to average, the more the score:

```typescript
function spikeScore(d0Net: number, avgDailyNet: number): number {
  const ratio = d0Net / avgDailyNet;
  if (ratio >= 3.0) return 1.0;    // massive spike
  if (ratio >= 2.0) return 0.85;   // strong spike
  if (ratio >= 1.5) return 0.70;   // moderate spike
  if (ratio >= 1.0) return 0.50;   // above average
  return 0.30;                      // below average (still passed filter)
}
```

---

## Step 4 — Price Action Analysis (Bonus Scoring)

Based on the price data within the selected period, classify the stock's current price action phase. This is a **bonus scoring layer** — it doesn't disqualify candidates but adjusts ranking.

### Phase Classification

Analyze the price series (close prices) over the selected period:

```typescript
type PricePhase = 
  | 'dip_buy'        // sharp recent drop from higher levels, RSI oversold zone
  | 'correction'     // gradual pullback within uptrend, healthy retracement
  | 'sideways'       // range-bound, low volatility consolidation
  | 'pre_breakout'   // tightening range near resistance, volume building
  | 'strong_bullish' // clear uptrend, higher highs and higher lows
  | 'bearish'        // downtrend, lower lows — but bandar accumulating = contrarian

function classifyPricePhase(prices: number[]): PricePhase {
  // Implementation guidance:
  // 1. Calculate price change over period (first vs last)
  // 2. Calculate recent 5-day change vs full period change
  // 3. Calculate volatility (ATR or stddev of daily returns)
  // 4. Check if price near period high, low, or middle
  //
  // Classification heuristics:
  // - dip_buy: period change < -8%, last 5d change < -3%
  // - correction: period change > 0% but last 5d < -3%
  // - sideways: abs(period change) < 5% AND low volatility
  // - pre_breakout: price within 3% of period high AND volatility compressing
  // - strong_bullish: period change > 10%, consistent higher closes
  // - bearish: period change < -10%, consistent lower closes
}
```

### Phase Scoring

**Important: bearish and dip_buy are PRIORITIZED over strong_bullish.** The thesis is contrarian accumulation — bandar buying while price is weak gives the best entry. Strong bullish means we're late.

```typescript
function phaseScore(phase: PricePhase): number {
  const scores: Record<PricePhase, number> = {
    'dip_buy':        1.00,   // ideal — price weak, bandar buying
    'correction':     0.90,   // great — pullback in structure
    'sideways':       0.80,   // good — accumulation base forming
    'pre_breakout':   0.75,   // good but higher entry risk
    'bearish':        0.70,   // contrarian — high R:R if thesis holds
    'strong_bullish': 0.40,   // worst — likely chasing, late entry
  };
  return scores[phase];
}
```

---

## Step 5 — Composite Scoring

### Formula

```typescript
interface ScoringWeights {
  consistency: 0.25;     // 25% — how persistent is the accumulation
  floatPL: 0.25;         // 25% — how much bandar pressure exists
  momentum: 0.20;        // 20% — is accumulation accelerating recently
  spike: 0.10;           // 10% — D-0 big net value bonus
  pricePhase: 0.15;      // 15% — price action favors entry
  brokerDensity: 0.05;   // 5%  — more tracked brokers = stronger signal
}

function computeCompositeScore(stock: AnalyzedStock): number {
  const w = WEIGHTS;
  
  const consistencyScore = stock.consistencyPct; // 0.0 to 1.0
  
  // Float P/L scoring — peak at -5%, falls off both sides
  const floatPLScore = computeFloatPLScore(stock.floatPL);
  
  // Momentum: green_days / 5
  const momentumScore = stock.greenDays / 5;
  
  // Spike: D-0 relative to avg
  const spikeScoreVal = spikeScore(stock.d0Net, stock.avgDailyNet);
  
  // Price phase
  const phaseScoreVal = phaseScore(stock.pricePhase);
  
  // Broker density: how many of the 5 tracked brokers are accumulating
  const brokerDensityScore = Math.min(stock.trackedBrokerCount / 3, 1.0);
  
  return (
    w.consistency * consistencyScore +
    w.floatPL * floatPLScore +
    w.momentum * momentumScore +
    w.spike * spikeScoreVal +
    w.pricePhase * phaseScoreVal +
    w.brokerDensity * brokerDensityScore
  ) * 100; // scale to 0-100
}

function computeFloatPLScore(floatPL: number): number {
  // Peak score at -5% (optimal bandar pressure point)
  // Score 1.0 at -5%, degrades toward edges of -8% to +2% window
  if (floatPL < -0.08 || floatPL > 0.02) return 0.0; // outside window
  
  const optimal = -0.05;
  const distance = Math.abs(floatPL - optimal);
  const maxDistance = 0.07; // from -0.05 to +0.02
  
  return Math.max(0, 1.0 - (distance / maxDistance));
}
```

### Tier Classification

| Score Range | Tier | Action                        |
|-------------|------|-------------------------------|
| ≥ 80        | A    | Strong buy — highest priority |
| 65 – 79     | B    | Buy — solid setup             |
| 50 – 64     | C    | Watchlist — wait for trigger  |
| < 50        | —    | Skip                          |

---

## Step 6 — Execution Plan Generation

For each Tier A and Tier B candidate, auto-generate a trading plan.

### TP/SL Formula

```typescript
interface ExecutionPlan {
  stockCode: string;
  tier: 'A' | 'B' | 'C';
  compositeScore: number;
  
  entryZone: { low: number; high: number };
  stopLoss: number;
  stopLossPct: number;
  
  tp1: { price: number; pct: number; action: string };  // avg bandar price
  tp2: { price: number; pct: number; action: string };  // bandar +6% profit
  tp3: { price: number; pct: number; action: string };  // extended run
  
  riskRewardTP1: number;
  riskRewardTP2: number;
  
  allocationPct: number;     // suggested % of portfolio
  estimatedDuration: string; // e.g. "2-5 weeks"
}

function generateExecutionPlan(stock: RankedStock): ExecutionPlan {
  const currentPrice = stock.currentPrice;
  const avgBandar = stock.avgBandarPrice;
  
  // Entry zone: current price ± 1%
  const entryLow = Math.round(currentPrice * 0.99);
  const entryHigh = Math.round(currentPrice * 1.01);
  const entryMid = (entryLow + entryHigh) / 2;
  
  // Stop loss: 3-4% below entry (tighter for Tier A)
  const slPct = stock.tier === 'A' ? 0.032 : 0.038;
  const stopLoss = Math.round(entryMid * (1 - slPct));
  
  // Take profits
  const tp1Price = Math.round(avgBandar);                     // bandar breakeven
  const tp2Price = Math.round(avgBandar * 1.06);              // bandar +6%
  const tp3Price = Math.round(avgBandar * 1.15);              // extended +15%
  
  // Risk:Reward
  const risk = entryMid - stopLoss;
  const rrTP1 = (tp1Price - entryMid) / risk;
  const rrTP2 = (tp2Price - entryMid) / risk;
  
  return {
    stockCode: stock.stockCode,
    tier: stock.tier,
    compositeScore: stock.compositeScore,
    entryZone: { low: entryLow, high: entryHigh },
    stopLoss,
    stopLossPct: slPct * 100,
    tp1: { price: tp1Price, pct: ((tp1Price - entryMid) / entryMid) * 100, action: 'Close 30%' },
    tp2: { price: tp2Price, pct: ((tp2Price - entryMid) / entryMid) * 100, action: 'Close 40%' },
    tp3: { price: tp3Price, pct: ((tp3Price - entryMid) / entryMid) * 100, action: 'Trail stop, close 30%' },
    riskRewardTP1: rrTP1,
    riskRewardTP2: rrTP2,
    allocationPct: stock.tier === 'A' ? 60 : 40,
    estimatedDuration: stock.tier === 'A' ? '2-5 weeks' : '3-6 weeks',
  };
}
```