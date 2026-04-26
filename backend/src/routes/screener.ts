/// <reference types="bun-types" />
import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'
import { persistGet, persistSet } from '../services/persist.ts'

const router = new Hono()
const MODEL_NAME = 'claude-opus-4-7'
const TRADERSAHAM_BASE = 'https://apiv2.tradersaham.com/api/market-insight/broker-intelligence/by-stock'

// ── Raw API types ─────────────────────────────────────────────────────────────

interface RawBroker {
    broker_code: string
    broker_status: string   // "Whale", "Bandar", "Retail", "Retail / Bandar"
    net_value: number
    buy_days: number
    avg_price: number
}

interface RawStock {
    stock_code: string
    total_net_value: string
    broker_count: string
    avg_consistency: string   // avg buy_days of top brokers over period
    float_pl_pct: string | number  // API returns string or number inconsistently
    top_brokers: RawBroker[]
    current_price: string
    daily_data: Array<{ d: string; n: number; p: number }>
    [key: string]: unknown
}

interface BrokerDataset {
    trading_dates: string[]
    total_trading_days: number
    stocks: RawStock[]
}

// ── Pre-processed types ───────────────────────────────────────────────────────

interface ScoredStock {
    stock_code: string
    total_net_value: number
    broker_count: number
    current_price: number
    smart_share: number      // Whale broker % of total accumulation flow
    smart_vwap: number       // VWAP of smart money brokers
    avg_consistency: number  // avg buy_days of top brokers / total_days
    float_pl_pct: number     // accumulator unrealised P&L %
    dist_net_value: number   // matching distribution net value (0 if absent)
    period_high: number
    period_low: number
    drawdown_pct: number
    flow_direction: 'ACCELERATING' | 'STEADY' | 'DECELERATING'
    conviction: number
    signal: 'STRONG_BUY' | 'BUY' | 'SPECULATIVE_BUY'
    setup_type: string
    top_brokers: RawBroker[]
    daily_data: Array<{ d: string; n: number; p: number }>
}

interface RejectedStock {
    stock_code: string
    total_net_value: number
    gate_failure: 'GATE_0_FAIL' | 'GATE_1_FAIL' | 'GATE_2_FAIL' | 'GATE_3_FAIL'
    smart_share_pct: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWhaleBroker(status: string): boolean {
    return status === 'Whale'
}

function mean(arr: number[]): number {
    return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
}

function getDateRange(period: string): { startDate: string; endDate: string } {
    const end = new Date()
    const start = new Date(end)
    if (period === '2W') start.setDate(start.getDate() - 14)
    else if (period === '3M') start.setMonth(start.getMonth() - 3)
    else start.setMonth(start.getMonth() - 1) // '1M' default
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { startDate: fmt(start), endDate: fmt(end) }
}

const WHALE_BROKER_CODES = 'AG,AH,AI,AK,BK,BQ,DP,FS,GW,HD,MI,RX,TP,YU,ZP';
//&broker_codes=${WHALE_BROKER_CODES}

function buildUrls(startDate: string, endDate: string): { accUrl: string; distUrl: string } {
    const base = `${TRADERSAHAM_BASE}?limit=100&page=1&sort_by=net_value&investor_type=all&board=R&start_date=${startDate}&end_date=${endDate}`
    return {
        accUrl: `${base}&sort_order=desc&mode=accum&broker_codes=${WHALE_BROKER_CODES}`,
        distUrl: `${base}&sort_order=asc&mode=dist`,
    }
}

// ── Pre-processing ────────────────────────────────────────────────────────────

function computeDerived(s: {
    current_price: number
    top_brokers: RawBroker[]
    daily_data: Array<{ d: string; n: number; p: number }>
}): {
    smart_vwap: number
    period_high: number
    period_low: number
    drawdown_pct: number
    flow_direction: 'ACCELERATING' | 'STEADY' | 'DECELERATING'
} {
    const smartBrokers = s.top_brokers.filter(b => isWhaleBroker(b.broker_status))
    const smartNetTotal = smartBrokers.reduce((sum, b) => sum + Math.abs(b.net_value), 0)
    const smart_vwap = smartNetTotal > 0
        ? smartBrokers.reduce((sum, b) => sum + b.avg_price * Math.abs(b.net_value), 0) / smartNetTotal
        : s.current_price

    const prices = s.daily_data.map(d => d.p)
    const period_high = prices.length ? Math.max(...prices) : s.current_price
    const period_low = prices.length ? Math.min(...prices) : s.current_price
    const drawdown_pct = period_high > 0
        ? parseFloat(((s.current_price - period_high) / period_high * 100).toFixed(1))
        : 0

    const third = Math.max(Math.floor(s.daily_data.length / 3), 1)
    const recentFlow = mean(s.daily_data.slice(0, third).map(d => d.n))
    const earlyFlow = mean(s.daily_data.slice(-third).map(d => d.n))
    const flow_direction: 'ACCELERATING' | 'STEADY' | 'DECELERATING' =
        earlyFlow !== 0 && recentFlow > earlyFlow * 1.2 ? 'ACCELERATING'
        : earlyFlow !== 0 && recentFlow < earlyFlow * 0.8 ? 'DECELERATING'
        : 'STEADY'

    return { smart_vwap, period_high, period_low, drawdown_pct, flow_direction }
}

function scoreStock(
    s: Pick<ScoredStock, 'broker_count' | 'current_price' | 'smart_vwap' | 'drawdown_pct' | 'flow_direction' | 'avg_consistency' | 'float_pl_pct'>,
    setup_type: string,
    rankIndex: number,
    totalPassed: number,
    totalDays: number
): number {
    // MAGNITUDE (40%) — rank-based + breadth bonus
    const magnitudeRaw = 100 - (rankIndex / Math.max(totalPassed, 1)) * 100
    const magnitude = Math.min(magnitudeRaw + (s.broker_count > 25 ? 10 : 0), 100)

    // PERSISTENCE (30%) — avg_consistency / total days
    const persistRatio = totalDays > 0 ? s.avg_consistency / totalDays : 0
    const persistence = persistRatio > 0.8 ? 100 : persistRatio > 0.6 ? 75 : persistRatio > 0.4 ? 50 : 25

    // PRICE SETUP (30%) — drawdown + smart VWAP proximity + flow direction
    const c1 = s.drawdown_pct < -10 ? 100 : s.drawdown_pct < -5 ? 80 : s.drawdown_pct < -2 ? 60 : 40

    const distPct = s.smart_vwap > 0
        ? (s.current_price - s.smart_vwap) / s.smart_vwap * 100
        : 0
    // DIP_BUY: price below vwap is always valid entry proximity — floor at 70
    const c2 = Math.abs(distPct) <= 3 ? 100 : (setup_type === 'DIP_BUY' || distPct <= 10) ? 70 : 40

    const c3 = s.flow_direction === 'ACCELERATING' ? 100 : s.flow_direction === 'STEADY' ? 70 : 40

    const base = Math.round(magnitude * 0.4 + persistence * 0.3 + ((c1 + c2 + c3) / 3) * 0.3)

    // FLOAT P&L BONUS — accumulators winning = positive signal
    const floatBonus =
        s.float_pl_pct > 10 ? 10
        : s.float_pl_pct > 0 ? 5
        : s.float_pl_pct > -5 ? 0
        : s.float_pl_pct > -15 ? -5
        : -10

    // SETUP BONUS — prioritize actionable entry setups for 1M timeframe
    const setupBonus =
        setup_type === 'DIP_BUY' ? 15       // price below whale avg: ideal risk/reward entry
        : setup_type === 'PRE_BREAKOUT' ? 12 // flow accelerating, price pre-move: high upside
        : setup_type === 'MOMENTUM_CONTINUATION' ? 5
        : 0   // ACCUMULATION_PHASE: no catalyst yet

    return Math.min(100, Math.max(0, base + floatBonus + setupBonus))
}

function classifySetup(s: Pick<ScoredStock, 'current_price' | 'smart_vwap' | 'flow_direction' | 'daily_data'>): string {
    const recentPriceAvg = mean(s.daily_data.slice(0, 5).map(d => d.p))
    const earlyPriceAvg = mean(s.daily_data.slice(-5).map(d => d.p))
    const priceUptrend = earlyPriceAvg > 0 && recentPriceAvg > earlyPriceAvg * 1.02

    const vwapDist = s.smart_vwap > 0
        ? (s.current_price - s.smart_vwap) / s.smart_vwap * 100
        : 0

    // Price below whale avg cost — highest priority, best risk/reward for 1M entry
    if (s.current_price < s.smart_vwap) return 'DIP_BUY'
    // Accelerating flow + price hugging vwap (≤8% above) — pre-move coiling zone
    if (s.flow_direction === 'ACCELERATING' && vwapDist <= 8) return 'PRE_BREAKOUT'
    // Accelerating flow + price already running — momentum chase, lower priority
    if (s.flow_direction === 'ACCELERATING' && priceUptrend) return 'MOMENTUM_CONTINUATION'
    return 'ACCUMULATION_PHASE'
}

function preProcess(data: BrokerDataset, distMap: Map<string, number>): {
    passed: ScoredStock[]
    rejected: RejectedStock[]
    totalDays: number
    totalScanned: number
    gate1PassCount: number
} {
    const totalDays = data.total_trading_days
    const totalScanned = data.stocks.length
    const gate1Pass: RawStock[] = []
    const rejected: RejectedStock[] = []

    for (const s of data.stocks) {
        const total = Number(s.total_net_value)
        const brokerCount = Number(s.broker_count)
        const smartBrokers = s.top_brokers.filter(b => isWhaleBroker(b.broker_status))
        const smartVal = smartBrokers.reduce((sum, b) => sum + b.net_value, 0)
        const smartShare = total > 0 ? (smartVal / total) * 100 : 0
        const smartSharePct = parseFloat(smartShare.toFixed(1))

        // Gate 0: minimum breadth — at least 2 whale brokers must be present
        if (brokerCount < 2) {
            rejected.push({ stock_code: s.stock_code, total_net_value: total, gate_failure: 'GATE_0_FAIL', smart_share_pct: smartSharePct })
            continue
        }

        // Gate 1: whale broker flow ≥ 10% of total accumulation flow
        if (smartShare < 10) {
            rejected.push({ stock_code: s.stock_code, total_net_value: total, gate_failure: 'GATE_1_FAIL', smart_share_pct: smartSharePct })
        } else {
            gate1Pass.push(s)
        }
    }
    const gate1PassCount = gate1Pass.length

    // Gate 2: flow reversal — reject if ≥3 of last 5 days are negative
    const gate2Pass: RawStock[] = []
    for (const s of gate1Pass) {
        const total = Number(s.total_net_value)
        const negDays = s.daily_data.slice(0, 5).filter(d => d.n < 0).length
        if (negDays >= 3) {
            const smartBrokers = s.top_brokers.filter(b => isWhaleBroker(b.broker_status))
            const smartVal = smartBrokers.reduce((sum, b) => sum + b.net_value, 0)
            const smartShare = total > 0 ? (smartVal / total) * 100 : 0
            rejected.push({ stock_code: s.stock_code, total_net_value: total, gate_failure: 'GATE_2_FAIL', smart_share_pct: parseFloat(smartShare.toFixed(1)) })
        } else {
            gate2Pass.push(s)
        }
    }

    // Gate 3: distribution cross-reference — reject if dist flow ≥ accum flow
    const gate3Pass: RawStock[] = []
    for (const s of gate2Pass) {
        const total = Number(s.total_net_value)
        const distVal = distMap.get(s.stock_code) ?? 0
        if (distVal > 0 && distVal >= total * 3.0) {
            const smartBrokers = s.top_brokers.filter(b => isWhaleBroker(b.broker_status))
            const smartVal = smartBrokers.reduce((sum, b) => sum + b.net_value, 0)
            const smartShare = total > 0 ? (smartVal / total) * 100 : 0
            rejected.push({ stock_code: s.stock_code, total_net_value: total, gate_failure: 'GATE_3_FAIL', smart_share_pct: parseFloat(smartShare.toFixed(1)) })
        } else {
            gate3Pass.push(s)
        }
    }

    // Sort by total_net_value for rank-based magnitude scoring
    const sortedByValue = [...gate3Pass].sort((a, b) => Number(b.total_net_value) - Number(a.total_net_value))

    const scored: ScoredStock[] = sortedByValue.map((s, idx) => {
        const total = Number(s.total_net_value)
        const smartBrokers = s.top_brokers.filter(b => isWhaleBroker(b.broker_status))
        const smartVal = smartBrokers.reduce((sum, b) => sum + b.net_value, 0)
        const smartShare = total > 0 ? (smartVal / total) * 100 : 0
        const daily_data = s.daily_data.slice(0, 11)
        const current_price = Number(s.current_price)
        const avg_consistency = Number(s.avg_consistency)
        const float_pl_pct = Number(s.float_pl_pct)
        const dist_net_value = distMap.get(s.stock_code) ?? 0
        const derived = computeDerived({ current_price, top_brokers: s.top_brokers, daily_data })

        const base: ScoredStock = {
            stock_code: s.stock_code,
            total_net_value: total,
            broker_count: Number(s.broker_count),
            current_price,
            smart_share: parseFloat(smartShare.toFixed(1)),
            avg_consistency,
            float_pl_pct,
            dist_net_value,
            ...derived,
            conviction: 0,
            signal: 'SPECULATIVE_BUY',
            setup_type: 'ACCUMULATION_PHASE',
            top_brokers: s.top_brokers,
            daily_data,
        }

        base.setup_type = classifySetup(base)
        base.conviction = scoreStock(base, base.setup_type, idx, sortedByValue.length, totalDays)
        base.signal = base.conviction >= 80 ? 'STRONG_BUY' : base.conviction >= 65 ? 'BUY' : 'SPECULATIVE_BUY'
        return base
    })

    return {
        passed: scored.sort((a, b) => b.conviction - a.conviction),
        rejected,
        totalDays,
        totalScanned,
        gate1PassCount,
    }
}

// ── Prompt v3.2 (spec-aligned) ────────────────────────────────────────────────

function buildPromptV3(
    passed: ScoredStock[],
    totalDays: number,
    totalScanned: number,
    gate1PassCount: number,
    dateStart: string,
    dateEnd: string,
    period: string,
    distTopStocks: RawStock[],
    distBrokerCountMap: Map<string, number>
): string {
    const topN = Math.min(passed.length, 10)
    const top = passed.slice(0, topN)

    // Express net values in millions IDR — drops 4-6 digits per number
    const M = (v: number) => Math.round(v / 1_000_000)
    const brkSt = (s: string) => s === 'Whale' ? 'W' : s === 'Bandar' ? 'B' : s.startsWith('Retail /') ? 'RB' : 'R'
    const flowCode = (f: string) => f[0] // A / S / D

    const accData = top.map(s => ({
        t: s.stock_code,
        sc: s.conviction,
        sig: s.signal,
        setup: s.setup_type,
        wpct: s.smart_share,
        vwap: Math.round(s.smart_vwap),
        ph: Math.round(s.period_high),
        pl: Math.round(s.period_low),
        flow: flowCode(s.flow_direction),
        cons: Math.round(s.avg_consistency * 10) / 10,
        fpl: Math.round(s.float_pl_pct * 10) / 10,
        dnv: M(s.dist_net_value),
        dbc: distBrokerCountMap.get(s.stock_code) ?? 0,
        tnv: M(s.total_net_value),
        bc: s.broker_count,
        cp: s.current_price,
        br: s.top_brokers.slice(0, 3).map(b => ({
            c: b.broker_code,
            s: brkSt(b.broker_status),
            nv: M(b.net_value),
            bd: b.buy_days,
            ap: Math.round(b.avg_price),
        })),
        // dd: [net_flow_M, close_price] newest-first
        dd: s.daily_data.map(d => [M(d.n), d.p]),
    }))

    const distData = distTopStocks.map(s => ({
        t: s.stock_code,
        tnv: M(Math.abs(Number(s.total_net_value))),
        bc: Number(s.broker_count),
        cp: Number(s.current_price),
        cons: Math.round(Number(s.avg_consistency) * 10) / 10,
        br: s.top_brokers.slice(0, 2).map(b => ({
            c: b.broker_code,
            s: brkSt(b.broker_status),
            nv: M(b.net_value),
            bd: b.buy_days,
        })),
    }))

    return `You are a Senior Indonesian Equity Analyst specializing in Smart Money Flow Analysis and Technical Momentum Trading on the IDX.

Your task: Analyze pre-filtered broker accumulation/distribution data. Produce an actionable watchlist with trade plans for the top 5 highest-conviction setups. Prioritize DIP_BUY and PRE_BREAKOUT setups.

--- FIELD GUIDE ---
All net values (tnv, dnv, nv) are in millions IDR (M IDR). 1000M=1B IDR.
t=ticker | sc=conviction_score | sig=signal | setup=setup_type
wpct=whale% of total acc flow | vwap=whale VWAP | ph/pl=period high/low | cp=current price
flow: A=ACCELERATING, S=STEADY, D=DECELERATING
cons=avg buy_days of top brokers (max=${totalDays}d) | fpl=accumulator unrealised P&L%
dnv=dist net value (0=none) | dbc=dist broker count | tnv=acc total net value | bc=acc broker count
br[]: c=broker_code, s=W(Whale)/B(Bandar)/RB(Retail-Bandar)/R(Retail), nv=net_val_M, bd=buy_days, ap=avg_price
dd: [[net_flow_M, close_price],...] newest-first — sc/sig/setup are pre-computed: copy EXACTLY into output

--- ACCUMULATION DATA (${topN} stocks, 4-gate filtered, sorted by conviction desc) ---
${JSON.stringify(accData)}

--- DISTRIBUTION DATA (top ${distData.length} by selling flow — RISK_RADAR only) ---
${JSON.stringify(distData)}

--- ANALYSIS INSTRUCTIONS ---

LAYER 1 — SMART MONEY PROFILING
- Dominant Flow: dnv=0 or dnv<tnv×30% → NET_ACCUMULATION | dnv≥tnv×30% and <70% → CONTESTED | dnv≥tnv×70% → NET_DISTRIBUTION
- Top Broker Type: Whale-Led if top br[].s=W, Bandar-Led if only B, Mixed if both
- Consistency % = cons/${totalDays}×100
- Key Brokers: top 2 br[] with s=W or B, format: c(s) @ap (bd d)
- Broker Count (Acc/Dist): bc / dbc

LAYER 2 — PRICE ACTION (from dd)
- 11-Day Trend: compare avg price of dd[0..2] vs dd[-3..] (index 1 of each tuple)
  * recent>early by >2% → UPTREND | recent<early by >2% → DOWNTREND | dip then recovered → V-RECOVERY | else → SIDEWAYS
- Price Range: pl - ph | Support Zone: near vwap | Resistance Zone: ph

LAYER 3 — CROSS-REFERENCE
- Note stocks where dbc > bc (distribution breadth exceeds accum)

LAYER 4 — RISK NUANCE
- br[].s all B with no W → manipulation risk, note in CATALYST
- fpl < -10% → smart money may cut loss soon

Select TOP 5 by sc. For RISK_RADAR: pick 3 from distData. CRITICAL if bc≥10 or tnv large; else HIGH.

--- SCAN CONTEXT ---
Period: ${dateStart}→${dateEnd} (${period}, ${totalDays}d) | Scanned: ${totalScanned} | Gate1: ${gate1PassCount} | Passed: ${passed.length}

--- OUTPUT FORMAT (respond EXACTLY as below, no markdown code blocks) ---

MARKET_PULSE:
<3-5 sentences: smart money flow direction, sectors with strongest inflow, float P&L posture, any flow vs price divergence>

WATCHLIST:
<repeat exactly 5 times>

---STOCK_#N---
TICKER: <t>
NAME: <t>
CONVICTION_SCORE: <sc — copy exactly>
SIGNAL: <sig — copy exactly>
SETUP_TYPE: <setup — copy exactly>

SMART_MONEY_PROFILE:
- Dominant Flow: <NET_ACCUMULATION | CONTESTED | NET_DISTRIBUTION>
- Acc. Net Value: <tnv×1M formatted in T/B IDR>
- Dist. Net Value: <dnv×1M formatted in T/B IDR, or "N/A" if 0>
- Net Imbalance: <(tnv-dnv)×1M formatted in T/B IDR>
- Top Broker Type: <Whale-Led | Bandar-Led | Mixed>
- Broker Count (Acc/Dist): <bc> / <dbc>
- Consistency: <cons>/${totalDays}d (<percentage>%)
- Key Brokers: <top 2 W/B brokers: c(s) @ap (bd d)>

PRICE_ANALYSIS:
- Current Price: <cp>
- Smart Money Avg Price: <vwap — copy exactly>
- Distance to Avg: <+/-X% from vwap to cp>
- 11-Day Trend: <UPTREND | DOWNTREND | SIDEWAYS | V-RECOVERY>
- Price Range: <pl> - <ph>
- Support Zone: <zone derived from vwap or pl>
- Resistance Zone: <ph or derived level>

TRADE_PLAN:
- Entry Zone: <price range for entry>
- Stop Loss: <price level below support>
- Target 1: <price> (<+X%>) — <reasoning>
- Target 2: <price> (<+X%>) — <reasoning>
- Risk/Reward Ratio: 1:<X.X>
- Estimated Profit: T1: <+X%>, T2: <+X%>
- Hold Period: <X-Y weeks>
- Exit Signal: <invalidation condition>

CATALYST:
<1-2 sentences: why this stock, why now>
---END_STOCK---

RISK_RADAR:
<TICKER>|<tnv×1M in T/B IDR>|<CRITICAL | HIGH>|<3-5 word reason>
<TICKER>|<tnv×1M in T/B IDR>|<CRITICAL | HIGH>|<3-5 word reason>
<TICKER>|<tnv×1M in T/B IDR>|<CRITICAL | HIGH>|<3-5 word reason>

METHODOLOGY_NOTE:
<2-3 sentences: key assumptions and limitations. Broker data is backward-looking and does not guarantee future price action.>`
}

// ── Parser v3.1 ───────────────────────────────────────────────────────────────

function sectionBetween(block: string, startHeader: string, endHeaders: string[]): string {
    const colonIdx = block.indexOf(`${startHeader}:`)
    if (colonIdx === -1) return ''
    const nlIdx = block.indexOf('\n', colonIdx)
    if (nlIdx === -1) return ''
    const from = nlIdx + 1

    let endIdx = block.length
    for (const h of endHeaders) {
        const idx = block.indexOf(`\n${h}:`, from)
        if (idx !== -1 && idx < endIdx) endIdx = idx
    }
    return block.slice(from, endIdx)
}

function parseBullets(content: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const line of content.split('\n')) {
        const kv = line.match(/^\s*-\s+(.+?):\s*(.+?)\s*$/)
        if (kv) result[kv[1].trim()] = kv[2].trim()
    }
    return result
}

function getField(block: string, key: string): string {
    const m = block.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))
    return m ? m[1] : ''
}

function parseStockBlock(block: string) {
    const smpContent = sectionBetween(block, 'SMART_MONEY_PROFILE', ['PRICE_ANALYSIS', 'TRADE_PLAN'])
    const paContent = sectionBetween(block, 'PRICE_ANALYSIS', ['TRADE_PLAN'])
    const tpContent = sectionBetween(block, 'TRADE_PLAN', ['CATALYST'])
    const catalystRaw = sectionBetween(block, 'CATALYST', []).trim()

    const smp = parseBullets(smpContent)
    const pa = parseBullets(paContent)
    const tp = parseBullets(tpContent)
    const catalyst = catalystRaw || getField(block, 'CATALYST')

    return {
        ticker: getField(block, 'TICKER'),
        name: getField(block, 'NAME'),
        convictionScore: parseInt(getField(block, 'CONVICTION_SCORE'), 10) || 0,
        signal: getField(block, 'SIGNAL') as 'STRONG_BUY' | 'BUY' | 'SPECULATIVE_BUY',
        setupType: getField(block, 'SETUP_TYPE'),
        smartMoneyProfile: smp,
        priceAnalysis: pa,
        tradePlan: {
            entryZone: tp['Entry Zone'] ?? '',
            stopLoss: tp['Stop Loss'] ?? '',
            target1: tp['Target 1'] ?? '',
            target2: tp['Target 2'] ?? '',
            riskReward: tp['Risk/Reward Ratio'] ?? '',
            estimatedProfit: tp['Estimated Profit'] ?? '',
            holdPeriod: tp['Hold Period'] ?? '',
            exitSignal: tp['Exit Signal'] ?? '',
        },
        catalyst,
    }
}

function parseScreenerResponse(content: string, model: string, period: string) {
    const clean = content.replace(/```[a-z]*\n?/gi, '').replace(/```/gi, '').trim()
    console.log('[screener v3.2] output preview:', clean.slice(0, 600))

    const marketPulseMatch = clean.match(/MARKET_PULSE:\s*\n([\s\S]*?)(?=\nWATCHLIST:|\n---STOCK_|$)/)
    const marketPulse = marketPulseMatch ? marketPulseMatch[1].trim() : ''

    const blockStartRe = /---STOCK_#\d+---[^\n]*/g
    const rawParts = clean.split(blockStartRe)

    const watchlist: ReturnType<typeof parseStockBlock>[] = []
    for (let i = 1; i < rawParts.length; i++) {
        let blockContent = rawParts[i].split(/---END_STOCK---/)[0]
        blockContent = blockContent.split(/\nRISK_RADAR:/)[0]
        blockContent = blockContent.trim()
        if (blockContent) watchlist.push(parseStockBlock(blockContent))
    }

    console.log(`[screener v3.2] parsed watchlist: ${watchlist.length} stocks`)

    const riskRadarMatch = clean.match(/RISK_RADAR:\s*\n([\s\S]*?)(?=\nMETHODOLOGY_NOTE:|$)/)
    const riskRadar = riskRadarMatch
        ? riskRadarMatch[1].trim().split('\n').filter(l => l.includes('|')).map(line => {
            const cols = line.split('|')
            return {
                ticker: cols[0]?.trim() ?? '',
                netValue: cols[1]?.trim() ?? '',
                riskLevel: cols[2]?.trim() ?? '',
                reason: cols[3]?.trim() ?? '',
            }
        })
        : []

    const methodMatch = clean.match(/METHODOLOGY_NOTE:\s*\n([\s\S]*?)$/)
    const methodologyNote = methodMatch
        ? methodMatch[1].trim()
        : 'Backward-looking broker data. Smart money flow ≠ guaranteed price direction. Risk management mandatory.'

    return {
        period,
        marketPulse,
        watchlist,
        riskRadar,
        methodologyNote,
        generatedAt: new Date().toISOString(),
        model,
    }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/last', async (c) => {
    const last = await persistGet<ReturnType<typeof parseScreenerResponse>>('screener_last_v2')
    if (!last) return c.json({ error: 'No previous scan found' }, 404)
    return c.json(last)
})

router.post('/analyze', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as { period?: string; startDate?: string; endDate?: string }
        const period = (['2W', '1M', '3M', 'CUSTOM'].includes(body.period ?? '')) ? body.period! : '1M'

        let startDate: string, endDate: string
        if (period === 'CUSTOM' && body.startDate && body.endDate) {
            startDate = body.startDate
            endDate = body.endDate
        } else {
            const range = getDateRange(period)
            startDate = range.startDate
            endDate = range.endDate
        }

        const { accUrl, distUrl } = buildUrls(startDate, endDate)
        const cacheKey = `screener:v32:${startDate}:${endDate}`
        console.log('[screener v3.2] period:', period, '| date range:', startDate, '→', endDate)

        const cached = cacheGet<ReturnType<typeof parseScreenerResponse>>(cacheKey)
        if (cached) {
            console.log('[screener v3.2] cache hit')
            return c.json(cached)
        }

        console.log('[screener v3.2] fetching accum + dist in parallel...')
        let acc: BrokerDataset
        const distMap = new Map<string, number>()
        const distBrokerCountMap = new Map<string, number>()
        let distTopStocks: RawStock[] = []

        try {
            const [accRes, distRes] = await Promise.allSettled([
                fetch(accUrl, { signal: AbortSignal.timeout(20000) }),
                fetch(distUrl, { signal: AbortSignal.timeout(20000) }),
            ])

            if (accRes.status !== 'fulfilled' || !accRes.value.ok) {
                throw new Error(`Accumulation API failed: ${accRes.status === 'rejected' ? accRes.reason : accRes.value.status}`)
            }
            acc = await accRes.value.json() as BrokerDataset

            if (distRes.status === 'fulfilled' && distRes.value.ok) {
                const dist = await distRes.value.json() as BrokerDataset
                const distStocks = dist.stocks ?? []
                for (const s of distStocks) {
                    distMap.set(s.stock_code, Math.abs(Number(s.total_net_value)))
                    distBrokerCountMap.set(s.stock_code, Number(s.broker_count))
                }
                distTopStocks = [...distStocks]
                    .sort((a, b) => Math.abs(Number(b.total_net_value)) - Math.abs(Number(a.total_net_value)))
                    .slice(0, 15)
                console.log(`[screener v3.2] dist stocks loaded: ${distMap.size}, top ${distTopStocks.length} for RISK_RADAR`)
            } else {
                console.warn('[screener v3.2] dist fetch failed — skipping Gate 3 + RISK_RADAR')
            }

            console.log(`[screener v3.2] raw stocks: ${acc.stocks?.length}, trading_days: ${acc.total_trading_days}`)
        } catch (e) {
            console.error('[screener v3.2] fetch error:', e)
            return c.json({ error: `Failed to fetch broker data: ${String(e)}` }, 502)
        }

        if (!acc.stocks?.length) {
            return c.json({ error: 'Broker data is empty or malformed' }, 422)
        }

        console.log('[screener v3.2] pre-processing: gate filter + scoring...')
        const { passed, rejected, totalDays, totalScanned, gate1PassCount } = preProcess(acc, distMap)
        console.log(`[screener v3.2] gate1 passed: ${gate1PassCount}/${totalScanned}, all gates passed: ${passed.length}`)

        // Write debug snapshot for pre-process review (Whale-only logic)
        void persistSet('debug_preprocess', {
            scannedAt: new Date().toISOString(),
            period,
            startDate,
            endDate,
            totalScanned,
            totalDays,
            gate1PassCount,
            allGatesPassedCount: passed.length,
            passed,
            rejected,
        })

        if (passed.length === 0) {
            return c.json({ error: 'No stocks passed all gate filters' }, 422)
        }

        const prompt = buildPromptV3(passed, totalDays, totalScanned, gate1PassCount, startDate, endDate, period, distTopStocks, distBrokerCountMap)
        console.log(`[screener v3.2] prompt: ${prompt.length} chars, top ${Math.min(passed.length, 10)} stocks to Claude`);

        try {
            const proc = Bun.spawn(['claude', '-p', prompt, '--model', MODEL_NAME], {
                stdout: 'pipe',
                stderr: 'pipe',
            })

            const timeout = setTimeout(() => {
                console.log('[screener v3.2] timeout — killing Claude')
                proc.kill()
            }, 300000)

            const [content, errText] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
            ])
            const exitCode = await proc.exited
            clearTimeout(timeout)

            console.log(`[screener v3.2] exit: ${exitCode}, output: ${content.length} chars`)

            if (exitCode !== 0) {
                console.error('[screener v3.2] stderr:', errText.slice(0, 500))
                return c.json({ error: `Claude CLI exited ${exitCode}: ${errText.slice(0, 300)}` }, 500)
            }

            const result = parseScreenerResponse(content.trim(), MODEL_NAME, period)
            cacheSet(cacheKey, result, TTL.INTEL)
            void persistSet('screener_last_v2', result)
            return c.json(result)
        } catch (e: any) {
            console.error('[screener v3.2] Claude spawn error:', e)
            if (e?.code === 'ENOENT') {
                return c.json({ error: 'Claude CLI not found. Run `claude` once to authenticate.' }, 500)
            }
            return c.json({ error: String(e) }, 500)
        }
        return;
    } catch (e) {
        console.error('[screener v3.2] unhandled error:', e)
        return c.json({ error: `Internal error: ${String(e)}` }, 500)
    }
})

export default router
