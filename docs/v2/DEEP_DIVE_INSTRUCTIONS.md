# TASK: Implement Deep-Dive Analysis (`deep-dive` command)

> Claude Code instruction file.
> Read this ENTIRE document before writing any code.
> **Prerequisite:** `smart-scan` feature must be implemented first (see SMART_SCAN_INSTRUCTIONS.md).

---

## Context

After `smart-scan` produces a top 10 conviction watchlist, `deep-dive` takes those 10 stocks, hits the Broker Profiler API for each, runs a deterministic scoring engine, and outputs the **final 2 stocks** to trade.

The user trades a maximum of 1-2 stocks at a time. This command is the final filter.

---

## Architecture

```
smart-scan top 10
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  deep-dive command                                       │
│                                                          │
│  1. RECEIVE top 10 from smart-scan (or JSON file)        │
│  2. HIT Broker Profiler API × 10 stocks (parallel)       │
│  3. EXTRACT key metrics per stock (client-side)          │
│  4. SCORE on 4 dimensions (client-side, deterministic)   │
│  5. RANK → select top 2                                  │
│  6. AI NARRATIVE (optional) — final conviction thesis    │
│  7. RENDER CLI output                                    │
└──────────────────────────────────────────────────────────┘
```

### Why Only Broker Profiler API (Skip Summary API)

The Summary API (`/broker-profiler/summary`) is a **strict subset** of the Profiler API (`/broker-profiler`). The Profiler API provides everything Summary has, PLUS:

- `signal{}` — pre-computed signal + confidence + summary text
- `brokerBreakdown` — classified foreign/domestic brokers with roles
- Per-broker `daily_data[]` — day-by-day flow with avg buy price (`b` field)
- Multi-timeframe values: `net_val_full`, `net_10d_val`, `net_5d_val`
- `classification` — SMART_ACCUMULATOR / TRAPPED_BUYER / PROFIT_TAKER / NET_SELLER / MIXED_RETAIL
- `score` — pre-computed broker conviction score (0-100)
- `market_share_pct` — broker's share of total volume

**Hitting only Profiler saves 10 API calls** (10 instead of 20) with zero data loss.

---

## API Reference

### Broker Profiler Endpoint

```
GET https://apiv2.tradersaham.com/api/market-insight/broker-profiler
  ?stock_code={TICKER}
  &start_date={YYYY-MM-DD}
  &end_date={YYYY-MM-DD}
  &board=R
```

### Response Schema

```typescript
interface ProfilerResponse {
  stock_code: string;
  period: {
    start_date: string;
    end_date: string;
    net_recent_days: number;    // ~10-13 trading days window
    net_very_recent_days: number; // ~5-6 trading days window
  };
  signal: {
    signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;          // 0-2 (0=low, 1=med, 2=high)
    summary: string;             // human-readable summary in Bahasa
    brokerBreakdown: {
      foreign: BrokerClassification[];
      domestic: BrokerClassification[];
    };
  };
  brokers: BrokerDetail[];       // top brokers by activity (primary)
  brokers_overflow: BrokerDetail[]; // remaining brokers (smaller activity)
  meta: {
    total_brokers: number;
    total_gross: number;
    total_net_value: number;
    primary_count: number;
    overflow_count: number;
  };
}

interface BrokerClassification {
  code: string;
  name: string;
  classification: "SMART_ACCUMULATOR" | "TRAPPED_BUYER" | "PROFIT_TAKER"
                | "NET_SELLER" | "MIXED_RETAIL";
}

interface BrokerDetail {
  broker_code: string;
  broker_name: string;
  broker_type: "Foreign" | "Domestic";
  net_full: number;           // net lots (full period)
  net_10d: number;            // net lots (last ~10 days)
  net_5d: number;             // net lots (last ~5 days)
  net_val_full: number;       // net value IDR (full period)
  net_10d_val: number;        // net value IDR (last ~10 days)
  net_5d_val: number;         // net value IDR (last ~5 days)
  total_buy_val: number;
  total_sell_val: number;
  gross_full: number;         // total lots traded
  total_buy_lot: number;
  total_sell_lot: number;
  trading_days: number;
  buy_days: number;
  market_share_pct: number;   // % of total stock volume
  gross_market_share_pct: number;
  net_market_share_pct: number;
  avg_price: number;
  daily_data: Array<{
    d: string;                // date
    n: number;                // net value
    p: number;                // closing price
    b: number | null;         // avg buy price (null if no buys that day)
  }>;
  classification: string;     // SMART_ACCUMULATOR | TRAPPED_BUYER | etc
  score: number;              // 0-100 conviction score
}
```

---

## File Structure

```
src/
├── deep-dive/
│   ├── types.ts              # All interfaces
│   ├── fetcher.ts            # API client — hit Profiler endpoint
│   ├── extractor.ts          # Extract key metrics from raw response
│   ├── scorer.ts             # 4-dimension scoring engine
│   ├── renderer.ts           # CLI output formatting
│   └── index.ts              # Orchestrator
```

---

## Step-by-Step Implementation

### FILE: `src/deep-dive/types.ts`

```typescript
// === INPUT (from smart-scan output) ===

export interface ConvictionStock {
  stock_code: string;
  stock_name: string;
  conviction_score: number;   // from smart-scan
  signal: string;
  setup_type: string;
}

// === API RESPONSE TYPES ===
// (copy the ProfilerResponse, BrokerClassification, BrokerDetail interfaces
//  from the API Reference section above)

// === EXTRACTED METRICS ===

export interface StockDeepDive {
  stock_code: string;

  // From API signal
  apiSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  apiConfidence: number;      // 0-2
  apiSummary: string;

  // Foreign broker analysis
  foreignBrokers: {
    total: number;
    smartAccumulators: string[];     // broker codes
    trappedBuyers: string[];
    netSellers: string[];
    profitTakers: string[];
  };

  // Domestic broker analysis
  domesticBrokers: {
    total: number;
    smartAccumulators: string[];
    netSellers: string[];
  };

  // Top 5 brokers by |net_val_full|
  topBrokers: Array<{
    code: string;
    name: string;
    type: "Foreign" | "Domestic";
    netValFull: number;
    netVal5d: number;
    netVal10d: number;
    classification: string;
    score: number;
    buyDays: number;
    tradingDays: number;
    marketSharePct: number;
    avgPrice: number;
    acceleration: "FRESH_ENTRY" | "ACCELERATING" | "STEADY" | "DECELERATING" | "REVERSING";
  }>;

  // Aggregated metrics
  totalNetValue: number;
  foreignNetValue: number;     // sum of net_val_full for Foreign brokers
  domesticNetValue: number;    // sum of net_val_full for Domestic brokers
  foreignDomesticRatio: number; // foreignNetValue / totalNetValue (can be negative)

  // Classification distribution (from primary brokers only)
  classificationCounts: {
    SMART_ACCUMULATOR: number;
    TRAPPED_BUYER: number;
    PROFIT_TAKER: number;
    NET_SELLER: number;
    MIXED_RETAIL: number;
  };

  // Multi-timeframe signal
  multiTimeframe: {
    full: number;              // total net value (full period)
    recent10d: number;         // total net value (10d)
    recent5d: number;          // total net value (5d)
    trend: "ACCELERATING_BUY" | "STEADY_BUY" | "DECELERATING_BUY"
         | "ACCELERATING_SELL" | "STEADY_SELL" | "DECELERATING_SELL"
         | "MIXED";
  };
}

// === SCORING ===

export interface DeepDiveScore {
  foreignConviction: number;    // 0-100
  classificationHealth: number; // 0-100
  multiTimeframe: number;       // 0-100
  apiSignalBoost: number;       // 0-100
  composite: number;            // 0-100 weighted
}

// === FINAL OUTPUT ===

export interface DeepDiveResult {
  period: { start: string; end: string };
  analyzed: number;
  finalPicks: Array<{
    rank: 1 | 2;
    stock_code: string;
    smartScanScore: number;      // from smart-scan
    deepDiveScore: number;       // from this analysis
    combinedScore: number;       // weighted blend
    deepDive: StockDeepDive;
    thesis: string;              // AI-generated or template
  }>;
  eliminated: Array<{
    stock_code: string;
    reason: string;
  }>;
}
```

---

### FILE: `src/deep-dive/fetcher.ts`

```typescript
export async function fetchBrokerProfile(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<ProfilerResponse>
```

Requirements:
- HTTP GET to `https://apiv2.tradersaham.com/api/market-insight/broker-profiler`
- Query params: `stock_code`, `start_date`, `end_date`, `board=R`
- Use `fetch()` or `node-fetch`
- Timeout: 10 seconds per request
- Retry once on failure
- Return typed `ProfilerResponse`

```typescript
export async function fetchAllProfiles(
  stocks: ConvictionStock[],
  startDate: string,
  endDate: string
): Promise<Map<string, ProfilerResponse>>
```

Requirements:
- Fetch all stocks in **parallel** (Promise.allSettled)
- Limit concurrency to 3 simultaneous requests (to avoid rate limiting)
- Return Map of stockCode → response
- Log failures but don't abort — continue with remaining stocks
- Minimum viable: if fewer than 5 stocks return data, warn user

---

### FILE: `src/deep-dive/extractor.ts`

Transform raw API response into the `StockDeepDive` metrics object.

```typescript
export function extractMetrics(response: ProfilerResponse): StockDeepDive
```

#### Extraction Logic

**1. Foreign Broker Analysis**

From `signal.brokerBreakdown.foreign[]`, group by `classification`:
```
foreignBrokers.smartAccumulators = foreign.filter(c => c.classification === "SMART_ACCUMULATOR").map(c => c.code)
foreignBrokers.trappedBuyers    = foreign.filter(c => c.classification === "TRAPPED_BUYER").map(c => c.code)
foreignBrokers.netSellers       = foreign.filter(c => c.classification === "NET_SELLER").map(c => c.code)
foreignBrokers.profitTakers     = foreign.filter(c => c.classification === "PROFIT_TAKER").map(c => c.code)
```

**2. Top 5 Brokers**

From `brokers[]` (primary list), sort by `Math.abs(net_val_full)` descending, take top 5.

Per broker, calculate **acceleration**:
```
ratio_5d = net_5d_val / net_full_val   (handle division by zero)

if net_val_full > 0 (buyer):
  if ratio_5d > 0.90          → "FRESH_ENTRY" (almost all buying is recent)
  if ratio_5d > 0.60          → "ACCELERATING"
  if ratio_5d > 0.35          → "STEADY"
  if ratio_5d > 0             → "DECELERATING"
  else (ratio_5d < 0)         → "REVERSING" (was buyer, now selling recently)

if net_val_full < 0 (seller):
  // Mirror logic — "FRESH_ENTRY" means fresh selling
  // Same thresholds but for selling acceleration
```

**3. Foreign vs Domestic Net Value**

Sum `net_val_full` across all brokers in `brokers[]` AND `brokers_overflow[]`:
```
foreignNetValue  = sum(net_val_full) where broker_type === "Foreign"
domesticNetValue = sum(net_val_full) where broker_type === "Domestic"
```

**4. Classification Distribution**

Count classifications from `brokers[]` only (ignore overflow):
```
classificationCounts = count of each classification type in brokers[]
```

**5. Multi-Timeframe Signal**

Sum across ALL brokers (both lists):
```
full    = meta.total_net_value  (or sum of all net_val_full)
recent10d = sum of all net_10d_val
recent5d  = sum of all net_5d_val

if full > 0:
  if recent5d > recent10d * 0.6   → "ACCELERATING_BUY"
  if recent5d > recent10d * 0.3   → "STEADY_BUY"
  else                            → "DECELERATING_BUY"
elif full < 0:
  // mirror for sell
else:
  → "MIXED"
```

---

### FILE: `src/deep-dive/scorer.ts`

Score each stock on 4 dimensions.

```typescript
export function scoreDeepDive(
  metrics: StockDeepDive,
  smartScanScore: number
): DeepDiveScore
```

#### Dimension 1: Foreign Conviction (35%)

Measures whether foreign institutional money is committed.

```
foreignBuyerCount = foreignBrokers.smartAccumulators.length + foreignBrokers.trappedBuyers.length
foreignSellerCount = foreignBrokers.netSellers.length + foreignBrokers.profitTakers.length

// Foreign net stance
if foreignBuyerCount > foreignSellerCount AND foreignNetValue > 0:
  base = 80
elif foreignBuyerCount > 0 AND foreignNetValue > 0:
  base = 60
elif foreignBuyerCount === 0:
  base = 20
else:
  base = 40

// Bonus: SMART_ACCUMULATOR foreign count
base += foreignBrokers.smartAccumulators.length * 10  (cap at +20)

// Bonus: foreign net value dominance
if foreignNetValue > 0 AND foreignNetValue > domesticNetValue:
  base += 10

foreignConviction = min(base, 100)
```

#### Dimension 2: Classification Health (25%)

Measures the overall broker ecosystem health — are more brokers accumulating or distributing?

```
smart = classificationCounts.SMART_ACCUMULATOR
trapped = classificationCounts.TRAPPED_BUYER
profit = classificationCounts.PROFIT_TAKER
seller = classificationCounts.NET_SELLER
total_classified = smart + trapped + profit + seller  (exclude MIXED_RETAIL)

if total_classified === 0 → 50 (neutral)

// Weighted score: smart accumulators are best, trapped buyers are ambiguous
positive_weight = (smart * 2 + trapped * 0.5)
negative_weight = (seller * 2 + profit * 1)

ratio = positive_weight / (positive_weight + negative_weight)
classificationHealth = ratio * 100
```

#### Dimension 3: Multi-Timeframe Alignment (25%)

Measures whether money flow is accelerating in the right direction.

```
if multiTimeframe.trend === "ACCELERATING_BUY":
  base = 100
elif multiTimeframe.trend === "STEADY_BUY":
  base = 75
elif multiTimeframe.trend === "DECELERATING_BUY":
  base = 45
elif multiTimeframe.trend === "MIXED":
  base = 30
elif multiTimeframe.trend contains "SELL":
  base = 10

// Bonus: check if top foreign broker is accelerating
topForeignBuyer = topBrokers.find(b => b.type === "Foreign" && b.netValFull > 0)
if topForeignBuyer?.acceleration === "FRESH_ENTRY" → base += 15
if topForeignBuyer?.acceleration === "ACCELERATING" → base += 10

multiTimeframe = min(base, 100)
```

#### Dimension 4: API Signal Alignment (15%)

The API pre-computes a signal. Use it as confirmation, not primary driver.

```
if apiSignal === "BULLISH":
  if apiConfidence === 2 → 100
  if apiConfidence === 1 → 80
  if apiConfidence === 0 → 60
elif apiSignal === "NEUTRAL":
  base = 50
elif apiSignal === "BEARISH":
  if apiConfidence === 2 → 10
  if apiConfidence === 1 → 25
  if apiConfidence === 0 → 40
```

#### Composite Score

```
deepDiveScore = foreignConviction * 0.35
              + classificationHealth * 0.25
              + multiTimeframe * 0.25
              + apiSignalBoost * 0.15

// Blend with smart-scan score for final ranking
combinedScore = smartScanScore * 0.40 + deepDiveScore * 0.60
```

**Why 60% deep-dive weight:** Deep-dive has richer, fresher data (per-broker daily granularity + multi-timeframe). Smart-scan is the initial filter; deep-dive is the final verdict.

---

### FILE: `src/deep-dive/renderer.ts`

```typescript
export function renderDeepDiveResult(result: DeepDiveResult): void
```

Target output:

```
┌─────────────────────────────────────────────────────────────┐
│  🔬 DEEP-DIVE ANALYSIS — Final 2 Picks                     │
│  Period: 2026-04-14 → 2026-04-21 | Analyzed: 10 stocks     │
└─────────────────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════════

  🥇 #1  AADI                            Combined: 82
  ├─ Smart-Scan: 85 │ Deep-Dive: 80
  │
  ├─ 📡 API Signal: NEUTRAL (confidence 1)
  │  "Aktivitas broker campuran — tidak ada bias arah jelas"
  │
  ├─ 🌐 Foreign Brokers:
  │  ├─ ✅ SMART_ACCUMULATOR: BK (J.P. Morgan)
  │  ├─ ⚠️  TRAPPED_BUYER: KZ (CLSA) — 100.8B net, ALL in last 5d
  │  └─ ❌ NET_SELLER: ZP (Maybank) — selling accelerating
  │
  ├─ 📊 Top 5 Brokers by Flow:
  │  ┌──────┬──────────────┬───────────┬───────────┬─────────────┬──────────────┐
  │  │ Code │ Type         │ Net Value │ 5d Value  │ Accel       │ Class        │
  │  ├──────┼──────────────┼───────────┼───────────┼─────────────┼──────────────┤
  │  │ KZ   │ 🌐 Foreign   │ +100.8B   │ +100.8B   │ FRESH_ENTRY │ TRAPPED_BUY  │
  │  │ CC   │ 🏠 Domestic  │ -58.9B    │ -49.9B    │ STEADY      │ NET_SELLER   │
  │  │ YU   │ 🏠 Domestic  │ -49.0B    │ -37.8B    │ STEADY      │ NET_SELLER   │
  │  │ NI   │ 🏠 Domestic  │ +48.0B    │ +33.6B    │ ACCEL       │ SMART_ACC    │
  │  │ IF   │ 🏠 Domestic  │ -40.5B    │ -20.2B    │ DECEL       │ PROFIT_TAKE  │
  │  └──────┴──────────────┴───────────┴───────────┴─────────────┴──────────────┘
  │
  ├─ ⏱️  Multi-Timeframe: Full +575B → 10d +575B → 5d +408B
  │  Trend: STEADY_BUY
  │
  ├─ 📈 Score Breakdown:
  │  Foreign Conviction: 72  ███████░░░
  │  Classification:     65  ██████░░░░
  │  Multi-Timeframe:    75  ████████░░
  │  API Signal:         50  █████░░░░░
  │
  └─ 💡 Thesis: [AI-generated or template-based]

══════════════════════════════════════════════════════════════

  🥈 #2  ADRO  ...

══════════════════════════════════════════════════════════════

  ❌ ELIMINATED (8 stocks):
  ┌────────┬────────────┬────────────────────────────────────┐
  │ Ticker │ Combined   │ Reason                             │
  ├────────┼────────────┼────────────────────────────────────┤
  │ PTBA   │ 68         │ Foreign net seller, decelerating   │
  │ BRMS   │ 65         │ API signal BEARISH, low confidence │
  │ ...    │            │                                    │
  └────────┴────────────┴────────────────────────────────────┘

  ⚠️  Data is backward-looking. Always use stop-loss and proper risk management.
```

Formatting notes:
- 🥇 for #1, 🥈 for #2
- `chalk.green` for positive net values, `chalk.red` for negative
- Classification abbreviations: SMART_ACC, TRAPPED_BUY, PROFIT_TAKE, NET_SELLER, MIXED
- Use `chalk.dim` for eliminated stocks section
- Format IDR: >1T = "X.XXT", >1B = "XXXB", else "XXXM"

---

### FILE: `src/deep-dive/index.ts`

Orchestrator.

```typescript
export async function runDeepDive(options: {
  input: string;               // path to smart-scan JSON output, or "stdin"
  startDate: string;           // for API date range
  endDate: string;
  top?: number;                // default 2
  ai?: boolean;                // enable AI thesis generation
  json?: boolean;              // raw JSON output
}): Promise<DeepDiveResult>
```

Flow:
1. Load top 10 conviction stocks from smart-scan output (JSON file or stdin pipe)
2. `fetchAllProfiles()` — hit API for all 10 stocks in parallel
3. For each response: `extractMetrics()`
4. For each metrics: `scoreDeepDive(metrics, smartScanScore)`
5. Calculate `combinedScore` per stock
6. Sort by combinedScore descending
7. Take top N (default 2) as `finalPicks`
8. Remaining 8 → `eliminated` with primary reason
9. If `--ai`: generate thesis per pick (optional)
10. Render or output JSON

---

### CLI Registration

```typescript
program
  .command('deep-dive')
  .description('Deep analysis of top conviction stocks — final 2 picks')
  .requiredOption('-i, --input <path>', 'Path to smart-scan JSON output')
  .requiredOption('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
  .option('-n, --top <number>', 'Final picks count', '2')
  .option('--ai', 'Enable AI thesis generation')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    const result = await runDeepDive({
      input: opts.input,
      startDate: opts.startDate,
      endDate: opts.endDate,
      top: parseInt(opts.top),
      ai: opts.ai || false,
      json: opts.json || false,
    });
  });
```

### Pipeline Usage

```bash
# Full pipeline: scan → deep-dive
npx tsx src/cli.ts smart-scan -f accumulation.json --json > scan-result.json
npx tsx src/cli.ts deep-dive -i scan-result.json -s 2026-04-14 -e 2026-04-21

# Or pipe directly
npx tsx src/cli.ts smart-scan -f accumulation.json --json | \
npx tsx src/cli.ts deep-dive -i stdin -s 2026-04-14 -e 2026-04-21
```

---

## Scoring Reference Table

Expected behavior with AADI sample data:

```
AADI Deep-Dive Metrics:
  API Signal: NEUTRAL, confidence 1
  Foreign: BK=SMART_ACC, KZ=TRAPPED_BUYER, ZP=NET_SELLER
  Foreign net: KZ(+100.8B) + BK(+25.4B) + AK(+14.8B) + ZP(-35.9B) = ~+105B
  Classifications: 6 SMART_ACC, 3 NET_SELLER, 1 TRAPPED, 1 PROFIT_TAKER
  Multi-TF: full=+575B, 10d=+575B, 5d=+408B → STEADY_BUY
  
Expected scores:
  Foreign Conviction:  ~70 (2 foreign buyers vs 1 seller, net positive)
  Classification:      ~60 (6 smart vs 4 negative, moderate)
  Multi-Timeframe:     ~75 (steady buying, top foreign accelerating)
  API Signal:          ~50 (neutral, confidence 1)
  Deep-Dive Composite: ~65
```

---

## Testing Checklist

- [ ] `deep-dive -i scan.json -s 2026-04-14 -e 2026-04-21` produces 2 final picks
- [ ] API failures for individual stocks don't crash — graceful degradation
- [ ] Concurrency limit works (max 3 parallel requests)
- [ ] Foreign vs Domestic net values are calculated from ALL brokers (including overflow)
- [ ] Multi-timeframe trend detection handles edge cases (net_val_full = 0)
- [ ] Acceleration detection handles division by zero (net_val_full = 0)
- [ ] Combined score correctly weights 40% smart-scan + 60% deep-dive
- [ ] `--json` output is valid parseable JSON matching `DeepDiveResult` interface
- [ ] Pipeline works: smart-scan --json | deep-dive -i stdin
- [ ] Eliminated stocks list shows primary disqualification reason
- [ ] Stocks with BEARISH API signal + high confidence score very low

---

## Do NOT

- Do NOT hit the Summary API (`/broker-profiler/summary`) — Profiler has all the data
- Do NOT use `brokers_overflow[]` for classification counting — only `brokers[]`
- Do NOT use `brokers_overflow[]` for top 5 broker selection — only `brokers[]`
- Do DO use both `brokers[]` AND `brokers_overflow[]` for foreign/domestic net value aggregation
- Do NOT block on single API failure — use Promise.allSettled
- Do NOT let LLM do the scoring — scoring is deterministic TypeScript
- Do NOT hardcode date ranges — always use user-provided `--start-date` and `--end-date`
