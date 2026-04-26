# SMART_MONEY_SCREENER.md

> **Feature Spec** — Smart Money Flow Screener for IHSG Stock Scanner CLI
> Target: Claude Code development reference & prompt template

---

## 1. Overview

Fitur ini menganalisis data broker accumulation/distribution dari IDX untuk menghasilkan **5 watchlist saham** dengan conviction score, trade plan, estimated profit, dan hold period. Analisis berbasis Smart Money Flow — bukan headline berita.

### Input

Dua JSON dataset yang di-fetch dari broker summary API:

- `accumulation.json` — Saham yang di-net-buy oleh Bandar/Whale
- `distribution.json` — Saham yang di-net-sell oleh Bandar/Whale

### Output

Structured analysis: `MARKET_PULSE` → `WATCHLIST[5]` → `RISK_RADAR[3]` → `METHODOLOGY_NOTE`

---

## 2. Data Contract

### 2.1 Dataset Schema

```typescript
interface BrokerFlow {
  broker_code: string;
  broker_status: "Whale" | "Bandar";
  net_value: number;       // positive = net buy, negative = net sell
  buy_days: number;        // days broker was net buyer
  avg_price: number;       // volume-weighted avg transaction price
}

interface DailyData {
  d: string;   // "YYYY-MM-DD"
  n: number;   // daily net flow value
  p: number;   // closing price
}

interface StockEntry {
  stock_code: string;
  stock_name: string;
  total_net_value: string;    // total net broker flow (string, parse to number)
  broker_count: string;       // unique brokers involved (string, parse to number)
  avg_consistency: string;    // avg trading days active (string, parse to float)
  top_brokers: BrokerFlow[];  // top 3 by absolute net value
  current_price: string;      // latest closing price (string, parse to float)
  avg_price: string;          // avg broker transaction price (string, parse to float)
  float_pl_pct: string;       // floating P/L % (string, parse to float)
  daily_data: DailyData[];    // per-day breakdown
}

interface BrokerDataset {
  trading_dates: string[];
  total_trading_days: number;
  stocks: StockEntry[];
}
```

### 2.2 Field Semantics

| Field | Meaning | Analysis Use |
|-------|---------|-------------|
| `total_net_value` | Aggregated net flow over period | Primary ranking metric |
| `broker_count` | Unique broker participants | Breadth of conviction |
| `avg_consistency` | Avg days brokers were active | Persistence signal |
| `broker_status` | `"Whale"` = institutional/foreign, `"Bandar"` = local big player | Player profiling |
| `buy_days` | Days a specific broker was net buyer | Individual conviction |
| `avg_price` | VWAP of broker transactions | Support/resistance derivation |
| `current_price` | Latest close | Entry/exit reference |
| `float_pl_pct` | P/L of accumulated position | Position economics |
| `daily_data[].n` | Daily net flow | Acceleration detection |
| `daily_data[].p` | Daily closing price | Trend & pattern analysis |

---

## 3. Analysis Framework (4 Layers)

### Layer 1: Smart Money Profiling

Evaluate each stock in accumulation data:

**a) Broker Composition Score**
- Whale-dominant → institutional conviction (stronger)
- Bandar-dominant → local manipulation risk (weaker)
- Mixed Whale + Bandar alignment → highest conviction
- Higher `broker_count` → broader participation → stronger signal

**b) Accumulation Intensity**
- `avg_consistency / total_trading_days` > 80% → aggressive accumulation
- `buy_days` of top brokers relative to `total_trading_days` → individual persistence
- Check if `daily_data[].n` is increasing in recent days → acceleration pattern

**c) Position Economics**
- `float_pl_pct > 0` → smart money is underwater → likely to defend/add position
- `float_pl_pct < 0` → smart money is in profit → potential hidden distribution
- `avg_price` vs `current_price` gap → upside room measurement

### Layer 2: Price Action Analysis

Derive from `daily_data[]` series:

**a) Trend Structure**
- Compare avg price of first 3 days vs last 3 days → classify UPTREND / DOWNTREND / SIDEWAYS / V-RECOVERY

**b) Support/Resistance Detection**
- Smart money `avg_price` cluster → likely support zone
- `current_price` near or below accumulator `avg_price` → price at support

**c) Pre-Breakout Signal**
- Narrowing price range (last 3-5 days) + increasing net accumulation → compression before expansion
- Price holding above smart money `avg_price` while flow increases

**d) Dip-Buy Opportunity**
- `current_price` significantly below accumulator `avg_price` (negative `float_pl_pct`)
- Daily flow still positive/increasing → smart money buying the dip

### Layer 3: Cross-Reference (Accumulation vs Distribution)

Stocks appearing in **both** datasets reveal the battle:

- Compare `total_net_value` magnitude → which side dominates?
- Compare `broker_count` → more participants = stronger conviction
- Compare `avg_consistency` → who is more persistent?
- Accumulation >>> Distribution → net bullish (rotation in)
- Distribution >>> Accumulation → net bearish (smart money exit)
- Roughly equal → contested zone, avoid or wait

### Layer 4: Risk Assessment

Red flags to filter:

- Low `broker_count` (<10) in accumulation but high in distribution → **trap**
- Bandar-only accumulation without Whale participation → **manipulation risk**
- `float_pl_pct` deeply negative (< -10%) → smart money may cut loss
- Price falling despite accumulation → absorption phase (bullish) OR failed support (bearish)

---

## 4. Scoring System

### Conviction Score (0–100)

| Component | Weight | Inputs |
|-----------|--------|--------|
| Smart Money Flow | 40% | `total_net_value`, `broker_count`, `avg_consistency`, broker composition |
| Price Action | 30% | Trend, support proximity, breakout setup, dip detection |
| Cross-Reference | 20% | Acc vs Dist imbalance, broker count comparison |
| Risk Profile | 10% | Trap detection, manipulation risk, float P/L health |

### Signal Classification

| Score Range | Signal | Meaning |
|-------------|--------|---------|
| 80–100 | `STRONG_BUY` | High conviction, multiple layers aligned |
| 60–79 | `BUY` | Good setup, minor concerns |
| 40–59 | `SPECULATIVE_BUY` | Promising but needs confirmation |

### Setup Type Classification

| Type | Condition |
|------|-----------|
| `DIP_BUY` | Price below smart money avg, daily flow still positive |
| `PRE_BREAKOUT` | Price range narrowing + increasing accumulation |
| `ACCUMULATION_PHASE` | Steady buying, price sideways, compression forming |
| `MOMENTUM_CONTINUATION` | Price trending up + flow accelerating |

---

## 5. Prompt Template

System prompt yang dikirim ke Claude API bersama data:

```
You are a Senior Indonesian Equity Analyst specializing in Smart Money Flow Analysis
and Technical Momentum Trading on the IDX (Bursa Efek Indonesia).

Your task: Analyze broker accumulation/distribution data to identify the TOP 5
highest-conviction trade setups and produce an actionable watchlist.

═══════════════════════════════════════════════════════════════
DATA SCHEMA REFERENCE
═══════════════════════════════════════════════════════════════

Each dataset (accumulation & distribution) contains an array of stocks. Per stock:
- total_net_value   : Total net broker flow over the period (positive = buying, negative = selling)
- broker_count      : Number of unique brokers involved in the flow
- avg_consistency   : Average number of trading days brokers were active (max = total_trading_days)
- top_brokers[]     : Top 3 brokers by absolute net value
  - broker_status   : "Whale" (institutional/foreign) or "Bandar" (local market maker/big player)
  - net_value       : Net transaction value (positive = net buy, negative = net sell)
  - buy_days        : Days the broker was net buyer
  - avg_price       : Volume-weighted average transaction price
- current_price     : Latest closing price
- avg_price         : Average broker transaction price over the period
- float_pl_pct      : Floating P/L of accumulated position vs current price
- daily_data[]      : Per-day net flow (n) and closing price (p)

═══════════════════════════════════════════════════════════════
ACCUMULATION DATA (Net Buying by Smart Money)
═══════════════════════════════════════════════════════════════
${accumulationJSON}

═══════════════════════════════════════════════════════════════
DISTRIBUTION DATA (Net Selling by Smart Money)
═══════════════════════════════════════════════════════════════
${distributionJSON}

═══════════════════════════════════════════════════════════════
ANALYSIS FRAMEWORK — Apply ALL layers below
═══════════════════════════════════════════════════════════════

LAYER 1: SMART MONEY PROFILING
For each stock in accumulation data, evaluate:
a) Broker Composition Score
   - Whale-dominant (institutional conviction) vs Bandar-dominant (local manipulation risk)
   - Higher broker_count = broader institutional participation = stronger signal
   - Mixed Whale+Bandar alignment = highest conviction
b) Accumulation Intensity
   - avg_consistency relative to total_trading_days (>80% = aggressive accumulation)
   - buy_days of top brokers relative to total_trading_days
   - Acceleration pattern: is daily net flow increasing in recent days?
c) Position Economics
   - float_pl_pct: If positive, smart money is underwater → they are likely to defend/add
   - If negative, smart money is in profit → potential distribution disguised as accumulation
   - Compare avg_price vs current_price: discount = upside room

LAYER 2: PRICE ACTION ANALYSIS (from daily_data)
For each stock, derive from the price series:
a) Trend Structure
   - Compare first 3 days avg price vs last 3 days avg price → uptrend/downtrend/sideways
   - Identify if price is in a dip (recent decline from local high)
b) Support/Resistance Detection
   - Find price clusters where smart money avg_price concentrates → likely support zone
   - If current_price is near or below avg_price of top accumulators → price at support
c) Pre-Breakout Signal
   - Narrowing price range in last 3-5 days + increasing net accumulation = compression before expansion
   - Price holding above smart money avg_price while volume increases
d) Dip-Buy Opportunity
   - current_price significantly below avg_price of accumulators (negative float_pl_pct)
   - BUT daily flow still positive/increasing = smart money buying the dip

LAYER 3: CROSS-REFERENCE (ACCUMULATION vs DISTRIBUTION)
Critical: A stock appearing in BOTH datasets reveals the battle:
- Compare total_net_value magnitude: which side dominates?
- Compare broker_count: more participants = stronger conviction
- Compare avg_consistency: who is more persistent?
- If accumulation >>> distribution → net bullish (smart money rotating in)
- If distribution >>> accumulation → net bearish (smart money exiting)
- If roughly equal → contested, avoid or wait

LAYER 4: RISK ASSESSMENT
- If a stock has low broker_count (<10) in accumulation but high in distribution → trap
- If Bandar-only accumulation without Whale participation → manipulation risk
- If float_pl_pct is deeply negative (>-10%) → smart money may cut loss soon
- If price is falling despite accumulation → absorption phase (bullish) or failed support (bearish)

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT — Respond EXACTLY as below, no markdown code blocks
═══════════════════════════════════════════════════════════════

MARKET_PULSE:
<3-5 sentences. Summarize the overall smart money flow direction. Are institutions
net accumulating or distributing? Which sectors see the strongest inflow? Any notable
divergence between price action and broker flow?>

WATCHLIST:
<Repeat this block exactly 5 times, ranked by conviction score>

---STOCK_#N---
TICKER: <4-letter IDX code>
NAME: <Full company name>
CONVICTION_SCORE: <0-100, weighted: 40% smart money flow, 30% price action, 20% cross-reference, 10% risk>
SIGNAL: <STRONG_BUY | BUY | SPECULATIVE_BUY>
SETUP_TYPE: <DIP_BUY | PRE_BREAKOUT | ACCUMULATION_PHASE | MOMENTUM_CONTINUATION>

SMART_MONEY_PROFILE:
- Dominant Flow: <NET_ACCUMULATION | NET_DISTRIBUTION | CONTESTED>
- Acc. Net Value: <formatted in Trillions/Billions IDR>
- Dist. Net Value: <formatted in Trillions/Billions IDR, or "N/A" if not in distribution data>
- Net Imbalance: <Acc minus Dist value, formatted>
- Top Broker Type: <Whale-Led | Bandar-Led | Mixed>
- Broker Count (Acc/Dist): <X / Y>
- Consistency: <avg_consistency / total_trading_days> (<percentage>%)
- Key Brokers: <top 2 broker codes + status, e.g. "ZP (Whale), SQ (Bandar)">

PRICE_ANALYSIS:
- Current Price: <price>
- Smart Money Avg Price: <avg_price from accumulation>
- Distance to Avg: <percentage above or below>
- 11-Day Trend: <UPTREND | DOWNTREND | SIDEWAYS | V-RECOVERY>
- Price Range: <lowest daily_data.p> - <highest daily_data.p>
- Support Zone: <derived from smart money avg_price cluster>
- Resistance Zone: <derived from recent highs or distribution avg_price>

TRADE_PLAN:
- Entry Zone: <price range for entry>
- Stop Loss: <price level, typically below support/smart money avg>
- Target 1: <conservative target with reasoning>
- Target 2: <aggressive target with reasoning>
- Risk/Reward Ratio: <calculated from entry midpoint to targets vs stop loss>
- Estimated Profit: <percentage range from entry to T1 and T2>
- Hold Period: <estimated in trading days or weeks, based on accumulation pace>
- Exit Signal: <what would invalidate the thesis>

CATALYST:
<1-2 sentences. Why this stock, why now. Connect the smart money flow to a potential narrative.>

---END_STOCK---

RISK_RADAR:
<List 3 stocks from distribution data that show WARNING signs — heavy smart money exit. Format:>
<TICKER>|<Dist. Net Value>|<Risk Level: HIGH/CRITICAL>|<3-5 word reason>
<TICKER>|<Dist. Net Value>|<Risk Level: HIGH/CRITICAL>|<3-5 word reason>
<TICKER>|<Dist. Net Value>|<Risk Level: HIGH/CRITICAL>|<3-5 word reason>

METHODOLOGY_NOTE:
<2-3 sentences. Briefly state key assumptions and limitations of this analysis.
Mention that broker summary data is backward-looking and does not guarantee future price action.>
```

---

## 6. Implementation Guide

### 6.1 Prompt Builder Function

```typescript
// src/prompts/smart-money-screener.ts

export function buildScreenerPrompt(
  accumulation: BrokerDataset,
  distribution: BrokerDataset
): string {
  const accJSON = JSON.stringify(accumulation);
  const distJSON = JSON.stringify(distribution);

  // Replace ${accumulationJSON} and ${distributionJSON} in template above
  return PROMPT_TEMPLATE
    .replace("${accumulationJSON}", accJSON)
    .replace("${distributionJSON}", distJSON);
}
```

### 6.2 API Call

```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  }),
});
```

### 6.3 Response Parser

The output uses a structured plain-text format. Parse with regex or line-by-line:

```typescript
// src/parsers/screener-parser.ts

interface WatchlistItem {
  ticker: string;
  name: string;
  convictionScore: number;
  signal: "STRONG_BUY" | "BUY" | "SPECULATIVE_BUY";
  setupType: string;
  smartMoneyProfile: Record<string, string>;
  priceAnalysis: Record<string, string>;
  tradePlan: {
    entryZone: string;
    stopLoss: string;
    target1: string;
    target2: string;
    riskReward: string;
    estimatedProfit: string;
    holdPeriod: string;
    exitSignal: string;
  };
  catalyst: string;
}

interface ScreenerResult {
  marketPulse: string;
  watchlist: WatchlistItem[];
  riskRadar: Array<{
    ticker: string;
    netValue: string;
    riskLevel: string;
    reason: string;
  }>;
  methodologyNote: string;
}
```

### 6.4 CLI Integration

```typescript
// Add to commander program

program
  .command("smart-scan")
  .description("AI-powered Smart Money Flow screening")
  .option("--top <n>", "Number of watchlist items", "5")
  .action(async (opts) => {
    const acc = await fetchAccumulationData();
    const dist = await fetchDistributionData();
    const prompt = buildScreenerPrompt(acc, dist);
    const result = await callClaudeAPI(prompt);
    const parsed = parseScreenerResult(result);
    renderWatchlist(parsed); // chalk + cli-table3
  });
```

---

## 7. Token Optimization Notes

Full accumulation + distribution data for 30 stocks each ≈ 15K–20K tokens input. Strategies to reduce:

1. **Truncate to top 15 stocks per dataset** — sorted by `abs(total_net_value)`
2. **Trim daily_data** — keep only last 5 days instead of 11 if token budget is tight
3. **Pre-compute cross-reference** — merge acc/dist per ticker before sending, reduce redundancy
4. **Strip stock_name** — AI can infer from ticker, saves ~500 tokens

```typescript
// Example: pre-filter top N stocks by flow magnitude
function trimDataset(data: BrokerDataset, topN = 15): BrokerDataset {
  const sorted = [...data.stocks].sort(
    (a, b) => Math.abs(Number(b.total_net_value)) - Math.abs(Number(a.total_net_value))
  );
  return { ...data, stocks: sorted.slice(0, topN) };
}
```

---

## 8. Changelog vs Original Prompt

| Aspect | Original Prompt | This Spec |
|--------|----------------|-----------|
| Data Source | News headlines (text) | Broker flow JSON (structured) |
| Analysis | Sentiment parsing | 4-layer quantitative framework |
| Output | 5 tickers + BULLISH/BEARISH | 5 watchlist + trade plan + risk radar |
| Scoring | Sector risk 0-100 | Conviction score with weighted components |
| Trade Plan | None | Entry, SL, TP1, TP2, R/R, hold period |
| Risk | Sector-level only | Stock-level trap detection + risk radar |
| Cross-validation | None | Acc vs Dist battle analysis |
| Data utilization | ~0% of available fields | 100% of available fields |
