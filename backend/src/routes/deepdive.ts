/// <reference types="bun-types" />
import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'
import { persistGet, persistSet } from '../services/persist.ts'

const router = new Hono()
const PROFILER_BASE = 'https://apiv2.tradersaham.com/api/market-insight/broker-profiler'
const TRACKED_BROKERS = new Set(['AK', 'BK', 'ZP', 'KZ', 'RX'])
const CONCURRENCY = 3
const MODEL_NAME = 'claude-opus-4-7'

// ── Broker Profile Lookup ─────────────────────────────────────────────────────

interface BrokerProfile {
    broker_code: string
    broker_name: string
    status: string
    smart_money_weight: string
    primary_clientele: string
    behavioral_signal: string
    notes_for_ai: string
}

const _profilesRaw: BrokerProfile[] = JSON.parse(
    await Bun.file(`${import.meta.dir}/../../../docs/v2/broker-profile/broker_profiles_enriched.json`).text()
)
const BROKER_PROFILES = new Map(_profilesRaw.map(b => [b.broker_code, b]))

// ── API Types ─────────────────────────────────────────────────────────────────

interface SummaryBroker {
    broker_code: string
    broker_name: string
    broker_type: 'Foreign' | 'Domestic'
    buy_val: number
    buy_avg: number
    sell_val: number
    sell_avg: number
    net_val: number
}

interface SummaryResponse {
    stock_code: string
    buyers: SummaryBroker[]
    sellers: SummaryBroker[]
    meta: { buy_count: number; sell_count: number; total: number }
}

interface ProfilerBrokerDetail {
    broker_code: string
    broker_name: string
    broker_type: 'Foreign' | 'Domestic'
    net_val_full: number
    net_10d_val: number
    net_5d_val: number
    trading_days: number
    buy_days: number
    market_share_pct: number
    avg_price: number
    classification: string
    score: number
}

interface ProfilerResponse {
    stock_code: string
    signal?: {
        signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
        confidence: number
        summary: string
        brokerBreakdown?: {
            foreign: Array<{ code: string; name: string; classification: string }>
            domestic: Array<{ code: string; name: string; classification: string }>
        }
    }
    brokers: ProfilerBrokerDetail[]
    brokers_overflow: ProfilerBrokerDetail[]
    meta?: { total_net_value?: number }
}

interface CombinedData {
    ticker: string
    profile: ProfilerResponse | null
    summary: SummaryResponse | null
}

// ── Output Types (mirror frontend/src/types.ts) ───────────────────────────────

type AccelerationLabel = 'FRESH_ENTRY' | 'ACCELERATING' | 'STEADY' | 'DECELERATING' | 'REVERSING'
type MultiTfTrend =
    | 'ACCELERATING_BUY' | 'STEADY_BUY' | 'DECELERATING_BUY'
    | 'ACCELERATING_SELL' | 'STEADY_SELL' | 'DECELERATING_SELL'
    | 'MIXED'

interface TopBrokerInfo {
    code: string
    name: string
    type: 'Foreign' | 'Domestic'
    netValFull: number
    netVal5d: number
    netVal10d: number
    classification: string
    score: number
    buyDays: number
    tradingDays: number
    marketSharePct: number
    avgPrice: number
    acceleration: AccelerationLabel
    buyAvg: number
    sellAvg: number
}

interface TrackedPosition {
    code: string
    name: string
    side: 'BUY' | 'SELL'
    netVal: number
    buyAvg: number
    sellAvg: number
}

interface StockDeepDive {
    stockCode: string
    apiSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    apiConfidence: number
    apiSummary: string
    foreignBrokers: {
        total: number
        smartAccumulators: string[]
        trappedBuyers: string[]
        netSellers: string[]
        profitTakers: string[]
    }
    domesticBrokers: {
        total: number
        smartAccumulators: string[]
        netSellers: string[]
    }
    topBuyers: TopBrokerInfo[]
    topSellers: TopBrokerInfo[]
    totalNetValue: number
    foreignNetValue: number
    domesticNetValue: number
    foreignDomesticRatio: number
    classificationCounts: {
        SMART_ACCUMULATOR: number
        TRAPPED_BUYER: number
        PROFIT_TAKER: number
        NET_SELLER: number
        MIXED_RETAIL: number
    }
    multiTimeframe: {
        full: number
        recent10d: number
        recent5d: number
        trend: MultiTfTrend
    }
    totalAccumNetValue: number
    totalDistNetValue: number
    meanBuyAvg: number
    meanSellAvg: number
    trackedPositions: TrackedPosition[]
}

interface ClaudeSignal {
    score: number
    signal: string
    reason: string
    catalyst?: string
}

interface DeepDiveScore {
    foreignConviction: number
    classificationHealth: number
    multiTimeframe: number
    claudeSignal: number
    composite: number
}

interface DeepDivePick {
    rank: number
    stockCode: string
    smartScanScore: number
    deepDiveScore: number
    combinedScore: number
    deepDive: StockDeepDive
    scoreBreakdown: DeepDiveScore
    claudeNarrative?: string
    claudeCatalyst?: string
}

interface DeepDiveResult {
    period: { start: string; end: string }
    analyzed: number
    allRanked: DeepDivePick[]
    generatedAt: string
    markdownBrief?: string
}

// ── Date Helpers ──────────────────────────────────────────────────────────────

function getDateRange(): { startDate: string; endDate: string } {
    const end = new Date()
    const start = new Date(end)
    start.setMonth(start.getMonth() - 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { startDate: fmt(start), endDate: fmt(end) }
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchWithRetry<T>(url: string, timeoutMs = 12000): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.json() as T
        } catch (e) {
            if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
            else throw e
        }
    }
    throw new Error('unreachable')
}

async function fetchCombined(ticker: string, startDate: string, endDate: string): Promise<CombinedData> {
    const profileUrl = `${PROFILER_BASE}?stock_code=${ticker}&start_date=${startDate}&end_date=${endDate}&board=R`
    const summaryUrl = `${PROFILER_BASE}/summary?stock_code=${ticker}&metric=net&start_date=${startDate}&end_date=${endDate}&board=R`

    const [profileResult, summaryResult] = await Promise.allSettled([
        fetchWithRetry<ProfilerResponse>(profileUrl),
        fetchWithRetry<SummaryResponse>(summaryUrl),
    ])

    return {
        ticker,
        profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
        summary: summaryResult.status === 'fulfilled' ? summaryResult.value : null,
    }
}

async function fetchAllCombined(
    tickers: string[],
    startDate: string,
    endDate: string,
): Promise<Map<string, CombinedData>> {
    const results = new Map<string, CombinedData>()

    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        const batch = tickers.slice(i, i + CONCURRENCY)
        const settled = await Promise.allSettled(
            batch.map(t => fetchCombined(t, startDate, endDate))
        )
        settled.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                results.set(batch[idx], result.value)
            } else {
                console.error(`[deepdive] failed ${batch[idx]}:`, result.reason)
                results.set(batch[idx], { ticker: batch[idx], profile: null, summary: null })
            }
        })
        if (i + CONCURRENCY < tickers.length) await new Promise(r => setTimeout(r, 250))
    }

    return results
}

// ── Analysis Helpers ──────────────────────────────────────────────────────────

function computeAcceleration(netValFull: number, netVal5d: number): AccelerationLabel {
    if (netValFull === 0) return 'STEADY'
    const ratio = netVal5d / netValFull
    if (ratio > 0.90) return 'FRESH_ENTRY'
    if (ratio > 0.60) return 'ACCELERATING'
    if (ratio > 0.35) return 'STEADY'
    if (ratio > 0) return 'DECELERATING'
    return 'REVERSING'
}

function computeMultiTfTrend(full: number, recent10d: number, recent5d: number): MultiTfTrend {
    if (full === 0) return 'MIXED'
    if (full > 0) {
        const r = recent10d > 0 ? recent5d / recent10d : 0
        if (r > 0.6) return 'ACCELERATING_BUY'
        if (r > 0.3) return 'STEADY_BUY'
        return 'DECELERATING_BUY'
    } else {
        const r = recent10d < 0 ? recent5d / recent10d : 0
        if (r > 0.6) return 'ACCELERATING_SELL'
        if (r > 0.3) return 'STEADY_SELL'
        return 'DECELERATING_SELL'
    }
}

// ── Extractor ─────────────────────────────────────────────────────────────────

function extractMetrics(combined: CombinedData): StockDeepDive {
    const { ticker, profile, summary } = combined

    // ── /summary → positions, accum/dist, foreign/domestic split, top brokers ──
    const buyers = summary?.buyers ?? []
    const sellers = summary?.sellers ?? []
    const allSummary = [...buyers, ...sellers]

    // Market-wide accumulation and distribution
    const totalAccumNetValue = buyers.reduce((s, b) => s + b.net_val, 0)
    const totalDistNetValue = Math.abs(sellers.reduce((s, b) => s + b.net_val, 0))

    // Volume-weighted mean prices from summary
    const totalBuyVal = buyers.reduce((s, b) => s + b.buy_val, 0)
    const meanBuyAvg = totalBuyVal > 0
        ? buyers.reduce((s, b) => s + b.buy_avg * b.buy_val, 0) / totalBuyVal
        : 0
    const totalSellVal = sellers.reduce((s, b) => s + b.sell_val, 0)
    const meanSellAvg = totalSellVal > 0
        ? sellers.reduce((s, b) => s + b.sell_avg * b.sell_val, 0) / totalSellVal
        : 0

    // Foreign / domestic net from summary (authoritative for the scan period)
    const foreignNetValue = allSummary
        .filter(b => b.broker_type === 'Foreign')
        .reduce((s, b) => s + b.net_val, 0)
    const domesticNetValue = allSummary
        .filter(b => b.broker_type === 'Domestic')
        .reduce((s, b) => s + b.net_val, 0)
    const totalNetValue = foreignNetValue + domesticNetValue

    // Tracked whale positions (AK/BK/ZP/KZ/RX) from summary
    const trackedPositions: TrackedPosition[] = []
    for (const b of buyers) {
        if (TRACKED_BROKERS.has(b.broker_code)) {
            trackedPositions.push({ code: b.broker_code, name: b.broker_name, side: 'BUY', netVal: b.net_val, buyAvg: b.buy_avg, sellAvg: b.sell_avg })
        }
    }
    for (const b of sellers) {
        if (TRACKED_BROKERS.has(b.broker_code)) {
            trackedPositions.push({ code: b.broker_code, name: b.broker_name, side: 'SELL', netVal: Math.abs(b.net_val), buyAvg: b.buy_avg, sellAvg: b.sell_avg })
        }
    }

    // ── /profiler → inventory tracking: multi-TF flow, acceleration, classification
    const allBrokers: ProfilerBrokerDetail[] = [
        ...(profile?.brokers ?? []),
        ...(profile?.brokers_overflow ?? []),
    ]

    // Profiler lookup keyed by broker_code — used only to enrich movement data
    const profilerMap = new Map<string, ProfilerBrokerDetail>()
    for (const b of allBrokers) profilerMap.set(b.broker_code, b)

    // Classification counts from profiler (SMART_ACCUMULATOR / TRAPPED_BUYER / etc.)
    const classificationCounts = { SMART_ACCUMULATOR: 0, TRAPPED_BUYER: 0, PROFIT_TAKER: 0, NET_SELLER: 0, MIXED_RETAIL: 0 }
    for (const b of profile?.brokers ?? []) {
        const k = b.classification as keyof typeof classificationCounts
        if (k in classificationCounts) classificationCounts[k]++
    }

    // Multi-timeframe inventory flow from profiler
    const full = allBrokers.reduce((s, b) => s + b.net_val_full, 0)
    const recent10d = allBrokers.reduce((s, b) => s + b.net_10d_val, 0)
    const recent5d = allBrokers.reduce((s, b) => s + b.net_5d_val, 0)

    // Foreign/domestic breakdown classifications from profiler signal
    const foreignBd = profile?.signal?.brokerBreakdown?.foreign ?? []
    const domesticBd = profile?.signal?.brokerBreakdown?.domestic ?? []
    const foreignBrokers = {
        total: foreignBd.length,
        smartAccumulators: foreignBd.filter(b => b.classification === 'SMART_ACCUMULATOR').map(b => b.code),
        trappedBuyers: foreignBd.filter(b => b.classification === 'TRAPPED_BUYER').map(b => b.code),
        netSellers: foreignBd.filter(b => b.classification === 'NET_SELLER').map(b => b.code),
        profitTakers: foreignBd.filter(b => b.classification === 'PROFIT_TAKER').map(b => b.code),
    }
    const domesticBrokers = {
        total: domesticBd.length,
        smartAccumulators: domesticBd.filter(b => b.classification === 'SMART_ACCUMULATOR').map(b => b.code),
        netSellers: domesticBd.filter(b => b.classification === 'NET_SELLER').map(b => b.code),
    }

    // ── Merge: map summary brokers, enrich with profiler movement data ──────────
    const mapBroker = (b: SummaryBroker): TopBrokerInfo => {
        const p = profilerMap.get(b.broker_code)
        const net5d = p?.net_5d_val ?? 0
        return {
            code: b.broker_code,
            name: b.broker_name,
            type: b.broker_type,
            netValFull: b.net_val,             // summary is authoritative for position side
            netVal5d: net5d,                   // profiler: short-term inventory flow
            netVal10d: p?.net_10d_val ?? 0,    // profiler: medium-term inventory flow
            classification: p?.classification ?? (b.net_val > 0 ? 'NET_BUYER' : 'NET_SELLER'),
            score: p?.score ?? 0,
            buyDays: p?.buy_days ?? 0,
            tradingDays: p?.trading_days ?? 0,
            marketSharePct: p?.market_share_pct ?? 0,
            avgPrice: b.buy_avg,
            acceleration: computeAcceleration(b.net_val, net5d),
            buyAvg: b.buy_avg,
            sellAvg: b.sell_avg,
        }
    }

    // Separate buyer and seller lists from /summary — all entries, frontend slices to 5 each
    const topBuyers: TopBrokerInfo[] = buyers.map(mapBroker)
    const topSellers: TopBrokerInfo[] = sellers.map(mapBroker)

    // ── Signal derivation ────────────────────────────────────────────────────────
    const netImbalance = totalAccumNetValue - totalDistNetValue
    const trackedBuyers = trackedPositions.filter(p => p.side === 'BUY')
    const apiSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
        profile?.signal?.signal ??
        (trackedBuyers.length >= 2 && netImbalance > 0 ? 'BULLISH'
            : netImbalance < 0 ? 'BEARISH' : 'NEUTRAL')
    const apiConfidence = profile?.signal?.confidence ?? Math.round(Math.min(
        Math.abs(netImbalance) / (totalAccumNetValue + totalDistNetValue + 1) * 100, 95
    ))

    return {
        stockCode: ticker,
        apiSignal,
        apiConfidence,
        apiSummary: profile?.signal?.summary ?? '',
        foreignBrokers,
        domesticBrokers,
        topBuyers,
        topSellers,
        totalNetValue,
        foreignNetValue,
        domesticNetValue,
        foreignDomesticRatio: totalNetValue !== 0 ? foreignNetValue / Math.abs(totalNetValue) : 0,
        classificationCounts,
        multiTimeframe: {
            full,
            recent10d,
            recent5d,
            trend: computeMultiTfTrend(full, recent10d, recent5d),
        },
        totalAccumNetValue,
        totalDistNetValue,
        meanBuyAvg,
        meanSellAvg,
        trackedPositions,
    }
}

// ── Claude Analysis ───────────────────────────────────────────────────────────

function fmtB(val: number): string {
    const abs = Math.abs(val)
    const sign = val < 0 ? '-' : '+'
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`
    return `${sign}${(abs / 1e3).toFixed(0)}K`
}

function formatBrokerLine(b: SummaryBroker, profilerClass?: string): string {
    const p = BROKER_PROFILES.get(b.broker_code)
    const weight = p ? p.smart_money_weight.replace('VERY HIGH (TIER 1)', 'TIER1').replace('Very High (TIER 1-2)', 'TIER1-2').replace('Very High', 'VH').replace('High', 'H').replace('Medium-High', 'MH').replace('Medium', 'M').replace(/Low.*/, 'L') : '?'
    const status = p?.status ?? '?'
    const signal = p ? p.behavioral_signal.slice(0, 90) : ''
    const cls = profilerClass ? ` [${profilerClass.replace('_', '')}]` : ''
    return `  ${b.broker_code} | ${b.broker_type} | ${weight}/${status} | net=${fmtB(b.net_val)} buy_avg=${b.buy_avg} sell_avg=${b.sell_avg}${cls} → ${signal}`
}

function buildDeepDivePrompt(
    metrics: StockDeepDive[],
    combinedMap: Map<string, CombinedData>,
): string {
    const stocksBlock = metrics.map(m => {
        const combined = combinedMap.get(m.stockCode)
        const buyers = combined?.summary?.buyers ?? []
        const sellers = combined?.summary?.sellers ?? []
        const allProfilerBrokers = [
            ...(combined?.profile?.brokers ?? []),
            ...(combined?.profile?.brokers_overflow ?? []),
        ]
        const classMap = new Map(allProfilerBrokers.map(b => [b.broker_code, b.classification]))

        const tf = m.multiTimeframe
        const cc = m.classificationCounts

        const buyerLines = buyers.slice(0, 5)
            .map(b => formatBrokerLine(b, classMap.get(b.broker_code)))
            .join('\n')
        const sellerLines = sellers.slice(0, 5)
            .map(b => formatBrokerLine(b, classMap.get(b.broker_code)))
            .join('\n')

        const trackedBuyers = m.trackedPositions.filter(p => p.side === 'BUY')
        const trackedSellers = m.trackedPositions.filter(p => p.side === 'SELL')
        const trackedSummary = [
            trackedBuyers.length > 0
                ? `Buying: ${trackedBuyers.map(p => `${p.code}(net=${fmtB(p.netVal)},buy_avg=${p.buyAvg})`).join(', ')}`
                : null,
            trackedSellers.length > 0
                ? `Selling: ${trackedSellers.map(p => `${p.code}(net=${fmtB(p.netVal)},sell_avg=${p.sellAvg})`).join(', ')}`
                : null,
        ].filter(Boolean).join(' | ') || 'none in top-30'

        return [
            `STOCK: ${m.stockCode}`,
            `Market pressure: accum=${fmtB(m.totalAccumNetValue)} | dist=${fmtB(m.totalDistNetValue)} | net=${fmtB(m.totalAccumNetValue - m.totalDistNetValue)}`,
            `Mean prices: buy_avg=${Math.round(m.meanBuyAvg)} | sell_avg=${Math.round(m.meanSellAvg)}`,
            `Foreign net: ${fmtB(m.foreignNetValue)} | Domestic net: ${fmtB(m.domesticNetValue)}`,
            `Broker classifications: SA=${cc.SMART_ACCUMULATOR} TB=${cc.TRAPPED_BUYER} NS=${cc.NET_SELLER} PT=${cc.PROFIT_TAKER}`,
            `Multi-TF: full=${fmtB(tf.full)} 10d=${fmtB(tf.recent10d)} 5d=${fmtB(tf.recent5d)} trend=${tf.trend}`,
            `Tracked SM brokers (AK/BK/ZP/KZ/RX): ${trackedSummary}`,
            ``,
            `TOP BUYERS (CODE | type | weight/status | net buy_avg sell_avg [class] → behavioral signal):`,
            buyerLines || '  (none)',
            ``,
            `TOP SELLERS:`,
            sellerLines || '  (none)',
        ].join('\n')
    }).join('\n\n---\n\n')

    return `You are an expert broker flow analyst for Indonesian equities (IDX).

Analyze broker flow data for each stock to determine the market structure, dominant player type, and investment thesis.

## Broker weight legend (smart_money_weight):
- TIER1 / VH = Tier-1 global/ASEAN institutional (AK=UBS, BK=JPMorgan, RX=Macquarie, ZP=Maybank, GW=HSBC, DP=DBS, YU=CGS, KZ=CLSA) — highest signal quality
- H = High (CC=Mandiri, DX=Bahana, LG=Trimegah, SQ=BCA, HP=Henan) — strong domestic institutional
- MH = Medium-High (YP=Mirae, NI=BNI, AI=UOB) — mixed institutional-retail
- M = Medium — moderate informed, tier-2 institutions
- L = Low (XL=Stockbit, XC=Ajaib, YP apps) — retail proxy, often CONTRA-SIGNAL when parabolic

## Broker status legend:
- Whale = Tier-1 smart money (AK, BK, RX, ZP)
- Bandar = Local institutional/informed
- Retail/Bandar = Mix
- Retail = Pure retail proxy

## Key analysis rules:
1. FOREIGN TIER1 convergence (≥2 of AK/BK/RX/ZP/GW/DP/YU/KZ buying together) = strongest signal
2. Retail FOMO warning: XL/XC net buying large while TIER1 distributing = distribution trap
3. Group-affiliation bias: DH (Sinarmas) buying DSSA/SMRA, CC (Mandiri) buying BMRI, NI buying BBNI = downweight (internal flow, not external signal)
4. Price efficiency: buyers buying BELOW mean_buy_avg = smart accumulation; above = chasing
5. Distribution pattern: TIER1 in sellers + retail in buyers = classic distribution setup

## Scoring (0–100):
- 80–100: Strong — TIER1 foreign convergence, large net surplus, SMART_ACCUMULATOR dominated, accelerating TF
- 60–79: Moderate — some TIER1 buyers or strong domestic institutional, moderate surplus
- 40–59: Neutral — mixed, no clear dominant, or fragmented flow
- 20–39: Weak — sellers dominant, retail churn, or TIER1 distributing
- 0–19: Avoid — institutional distribution, TIER1 all selling, classic retail trap

## Dominant player categories:
- FOREIGN_TIER1: ≥2 Tier-1 foreign brokers leading accumulation
- LOCAL_INSTITUTION: domestic H/VH brokers (CC, DX, LG, SQ, HP) leading
- MIXED_INSTITUTION: foreign + domestic institutions buying together
- RETAIL_FOMO: XL/XC/YP leading buyers (retail-driven, low quality signal)
- DISTRIBUTION: Net sellers dominant, institutions exiting into retail demand
- MIXED: no clear dominant group

## Thesis categories:
- FRESH_ACCUMULATION: new position building, buy_avg ≈ mean_buy
- INSTITUTIONAL_DEFENSE: TIER1 buying to defend underwater position
- PROFIT_TAKING: sellers have low buy_avg vs high sell_avg (taking gains)
- DISTRIBUTION: systematic institutional exit
- ROTATION: some TIER1 buying while others sell (sector rotation)
- CONTRARIAN: buying into market weakness, buy_avg below recent price
- MOMENTUM: fresh entry or accelerating into existing trend
- RETAIL_TRAP: retail accumulating while institutions distribute

---

${stocksBlock}

---

Output EXACTLY one line per stock — no headers, no extra text. Format:
STOCK:{code}|SCORE:{0-100}|SIGNAL:{BUY|SELL|NEUTRAL}|DOMINANT:{category}|THESIS:{category}|CATALYST:{1 concrete catalyst, no pipe chars}|REASON:{broker flow analysis}

CATALYST must be a specific, concrete trigger for the move — e.g. "Q3 earnings beat + MSCI rebalancing inflow", "Insider defense of 1,200 support by SQ+CC ahead of rights issue", "Commodity supercycle play — ZP+AK positioning for nickel demand surge". Avoid generic phrases like "positive outlook".

Example:
STOCK:MAIN|SCORE:78|SIGNAL:BUY|DOMINANT:FOREIGN_TIER1|THESIS:FRESH_ACCUMULATION|CATALYST:MSCI EM rebalancing + UBS positioning ahead of Q2 earnings|REASON:AK/ZP/BK all buying (+17.7B combined) at 996-1012 near mean_buy 996, Mirae/YP retail selling into them, ACCELERATING_BUY multi-TF confirms momentum
`
}

async function analyzeWithClaude(
    metrics: StockDeepDive[],
    combinedMap: Map<string, CombinedData>,
): Promise<Map<string, ClaudeSignal>> {
    const signals = new Map<string, ClaudeSignal>()
    const fallback = (code: string) => signals.set(code, { score: 50, signal: 'NEUTRAL', reason: 'Claude analysis unavailable' })

    try {
        const prompt = buildDeepDivePrompt(metrics, combinedMap)
        console.log(`[deepdive] calling Claude for ${metrics.length} stocks`)

        const proc = Bun.spawn(['claude', '-p', prompt, '--model', MODEL_NAME], {
            stdout: 'pipe',
            stderr: 'pipe',
        })

        const timeout = setTimeout(() => {
            console.log('[deepdive] Claude timeout — killing')
            proc.kill()
        }, 120000)

        const [content, errText] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])
        const exitCode = await proc.exited
        clearTimeout(timeout)

        if (exitCode !== 0) {
            console.error('[deepdive] Claude CLI error:', errText.slice(0, 300))
            metrics.forEach(m => fallback(m.stockCode))
            return signals
        }

        console.log(`[deepdive] Claude output: ${content.length} chars`)

        for (const line of content.split('\n')) {
            const m = line.match(/STOCK:(\w+)\|SCORE:(\d+)\|SIGNAL:(\w+)\|DOMINANT:(\w+)\|THESIS:(\w+)\|CATALYST:([^|]+)\|REASON:(.+)/)
            if (m) {
                signals.set(m[1], {
                    score: Math.min(100, Math.max(0, parseInt(m[2], 10))),
                    signal: m[3],
                    reason: `[${m[4]} · ${m[5]}] ${m[7].trim()}`,
                    catalyst: m[6].trim(),
                })
                continue
            }
            // fallback: old format without CATALYST
            const old = line.match(/STOCK:(\w+)\|SCORE:(\d+)\|SIGNAL:(\w+)\|DOMINANT:(\w+)\|THESIS:(\w+)\|REASON:(.+)/)
            if (old) {
                signals.set(old[1], {
                    score: Math.min(100, Math.max(0, parseInt(old[2], 10))),
                    signal: old[3],
                    reason: `[${old[4]} · ${old[5]}] ${old[6].trim()}`,
                })
            }
        }

        for (const m of metrics) {
            if (!signals.has(m.stockCode)) fallback(m.stockCode)
        }
    } catch (e: unknown) {
        console.error('[deepdive] Claude spawn error:', e)
        metrics.forEach(m => fallback(m.stockCode))
    }

    return signals
}

// ── Scorer ────────────────────────────────────────────────────────────────────

function scoreDeepDive(metrics: StockDeepDive, claudeScore: number): DeepDiveScore {
    // Dimension 1: Smart Money Conviction (35%) — tracked broker buy side strength
    const trackedBuyers = metrics.trackedPositions.filter(p => p.side === 'BUY')
    const trackedSellers = metrics.trackedPositions.filter(p => p.side === 'SELL')
    const trackedBuyNet = trackedBuyers.reduce((s, p) => s + p.netVal, 0)
    const trackedSellNet = trackedSellers.reduce((s, p) => s + p.netVal, 0)

    let foreignConviction = 40
    if (trackedBuyers.length >= 3) foreignConviction = 85
    else if (trackedBuyers.length === 2) foreignConviction = 70
    else if (trackedBuyers.length === 1) foreignConviction = 50
    else foreignConviction = 20  // all selling

    // Boost if buy net >> sell net
    if (trackedBuyNet > trackedSellNet * 2) foreignConviction = Math.min(foreignConviction + 15, 100)

    // Boost if buying below market mean (price efficiency)
    const buyingBelowMean = trackedBuyers.filter(p => metrics.meanBuyAvg > 0 && p.buyAvg < metrics.meanBuyAvg)
    foreignConviction = Math.min(foreignConviction + buyingBelowMean.length * 5, 100)

    // Dimension 2: Accumulation Quality (25%) — net imbalance + price efficiency
    const netImbalance = metrics.totalAccumNetValue - metrics.totalDistNetValue
    const totalFlow = metrics.totalAccumNetValue + metrics.totalDistNetValue
    const imbalanceRatio = totalFlow > 0 ? netImbalance / totalFlow : 0

    let classificationHealth = 50
    if (imbalanceRatio > 0.3) classificationHealth = 90
    else if (imbalanceRatio > 0.1) classificationHealth = 75
    else if (imbalanceRatio > 0) classificationHealth = 60
    else if (imbalanceRatio > -0.1) classificationHealth = 40
    else classificationHealth = 20

    // Dimension 3: Multi-Timeframe Alignment (25%)
    const trend = metrics.multiTimeframe.trend
    let multiTimeframe: number
    if (trend === 'ACCELERATING_BUY') multiTimeframe = 100
    else if (trend === 'STEADY_BUY') multiTimeframe = 75
    else if (trend === 'DECELERATING_BUY') multiTimeframe = 45
    else if (trend === 'MIXED') multiTimeframe = 30
    else multiTimeframe = 10

    const topBuyer = metrics.topBuyers[0]
    if (topBuyer?.acceleration === 'FRESH_ENTRY') multiTimeframe = Math.min(multiTimeframe + 15, 100)
    else if (topBuyer?.acceleration === 'ACCELERATING') multiTimeframe = Math.min(multiTimeframe + 10, 100)

    // Dimension 4: Claude Signal (15%)
    const claudeSignalScore = Math.min(100, Math.max(0, claudeScore))

    const composite = Math.round(
        foreignConviction * 0.35 +
        classificationHealth * 0.25 +
        multiTimeframe * 0.25 +
        claudeSignalScore * 0.15
    )

    return {
        foreignConviction: Math.round(foreignConviction),
        classificationHealth: Math.round(classificationHealth),
        multiTimeframe: Math.round(multiTimeframe),
        claudeSignal: Math.round(claudeSignalScore),
        composite,
    }
}

// ── Markdown Brief ────────────────────────────────────────────────────────────

function generateMarkdownBrief(
    result: DeepDiveResult,
    signals: Map<string, ClaudeSignal>,
    period: { start: string; end: string },
): string {
    const top5 = result.allRanked.slice(0, 10)
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

    const lines: string[] = [
        `# Deep Dive Brief — ${date}`,
        `**Period:** ${period.start} → ${period.end} | **Analyzed:** ${result.analyzed} stocks | **Model:** ${MODEL_NAME}`,
        '',
        '---',
        '',
        '## Top 5 Picks',
        '',
    ]

    for (const pick of top5) {
        const sig = signals.get(pick.stockCode)
        const sb = pick.scoreBreakdown
        const dd = pick.deepDive
        const tf = dd.multiTimeframe

        const trackedBuyers = dd.trackedPositions.filter(p => p.side === 'BUY')
        const trackedSellers = dd.trackedPositions.filter(p => p.side === 'SELL')

        lines.push(`### ${pick.rank}. ${pick.stockCode} — Combined Score: ${pick.combinedScore}/100`)
        lines.push(`**Signal:** ${sig?.signal?.replace('_', ' ') ?? 'N/A'} | **DeepDive:** ${pick.deepDiveScore}/100 | **SmartScan:** ${pick.smartScanScore}/100`)
        lines.push('')
        lines.push('| Dimension | Score | Weight |')
        lines.push('|-----------|-------|--------|')
        lines.push(`| Smart Money Conviction | ${sb.foreignConviction}/100 | 35% |`)
        lines.push(`| Accumulation Quality | ${sb.classificationHealth}/100 | 25% |`)
        lines.push(`| Multi-Timeframe | ${sb.multiTimeframe}/100 | 25% |`)
        lines.push(`| Claude Signal | ${sb.claudeSignal}/100 | 15% |`)
        lines.push('')

        if (trackedBuyers.length > 0) {
            lines.push(`**Tracked Buyers:** ${trackedBuyers.map(p => `${p.code}(buy:${p.buyAvg})`).join(', ')}`)
        }
        if (trackedSellers.length > 0) {
            lines.push(`**Tracked Sellers:** ${trackedSellers.map(p => `${p.code}(sell:${p.sellAvg})`).join(', ')}`)
        }
        lines.push(`**Market Flow:** Accum ${fmtB(dd.totalAccumNetValue)} | Dist ${fmtB(dd.totalDistNetValue)} | Mean Buy ${Math.round(dd.meanBuyAvg)} | Trend: ${tf.trend.replace(/_/g, ' ')}`)
        if (sig?.reason) {
            lines.push(`**AI Assessment:** ${sig.reason}`)
        }
        lines.push('')
        lines.push('---')
        lines.push('')
    }

    lines.push(`*Generated at ${new Date().toISOString()} by Blossom Terminal*`)
    return lines.join('\n')
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/last', async (c) => {
    const last = await persistGet<DeepDiveResult>('deepdive_last_v2')
    if (!last) return c.json({ error: 'No previous deep dive found' }, 404)
    return c.json(last)
})

router.post('/analyze', async (c) => {
    try {
        const body = await c.req.json()
        const watchlist: Array<{ ticker: string; convictionScore: number }> = body.watchlist ?? []

        if (!watchlist.length) {
            return c.json({ error: 'No watchlist provided' }, 400)
        }

        const { startDate, endDate } = getDateRange()
        const top = watchlist
        const tickers = top.map(w => w.ticker).filter(Boolean)

        const cacheKey = `deepdive:v7:${endDate}:${[...tickers].sort().join(',')}`
        const cached = cacheGet<DeepDiveResult>(cacheKey)
        if (cached) {
            console.log('[deepdive] cache hit')
            return c.json(cached)
        }

        console.log(`[deepdive] fetching ${tickers.length} combined profiles (${startDate} → ${endDate})`)
        const combinedMap = await fetchAllCombined(tickers, startDate, endDate)

        const hasData = [...combinedMap.values()].filter(d => d.profile || d.summary)
        if (hasData.length < 2) {
            return c.json({ error: `Too few profiles fetched (${hasData.length}/${tickers.length}) — check API availability` }, 502)
        }

        const metricsMap = new Map<string, StockDeepDive>()
        for (const ticker of tickers) {
            const combined = combinedMap.get(ticker)
            if (combined) metricsMap.set(ticker, extractMetrics(combined))
        }

        const metricsArray = Array.from(metricsMap.values())
        const claudeSignals = await analyzeWithClaude(metricsArray, combinedMap)

        const scored: Array<{
            ticker: string
            smartScanScore: number
            metrics: StockDeepDive
            score: DeepDiveScore
            combinedScore: number
        }> = []

        for (const w of top) {
            const metrics = metricsMap.get(w.ticker)
            if (!metrics) continue
            const claudeScore = claudeSignals.get(w.ticker)?.score ?? 50
            const score = scoreDeepDive(metrics, claudeScore)
            const combinedScore = Math.round(w.convictionScore * 0.4 + score.composite * 0.6)
            scored.push({ ticker: w.ticker, smartScanScore: w.convictionScore, metrics, score, combinedScore })
        }

        scored.sort((a, b) => b.combinedScore - a.combinedScore)
        console.log(`[deepdive] scored ${scored.length} stocks: ${scored.map(s => `${s.ticker}(${s.combinedScore})`).join(', ')}`)

        const allRanked: DeepDivePick[] = scored.map((s, i) => ({
            rank: i + 1,
            stockCode: s.ticker,
            smartScanScore: s.smartScanScore,
            deepDiveScore: s.score.composite,
            combinedScore: s.combinedScore,
            deepDive: s.metrics,
            scoreBreakdown: s.score,
            claudeNarrative: claudeSignals.get(s.ticker)?.reason,
            claudeCatalyst: claudeSignals.get(s.ticker)?.catalyst,
        }))

        const result: DeepDiveResult = {
            period: { start: startDate, end: endDate },
            analyzed: scored.length,
            allRanked,
            generatedAt: new Date().toISOString(),
        }

        result.markdownBrief = generateMarkdownBrief(result, claudeSignals, { start: startDate, end: endDate })

        cacheSet(cacheKey, result, TTL.INTEL)
        void persistSet('deepdive_last_v2', result)
        return c.json(result)
    } catch (e) {
        console.error('[deepdive] error:', e)
        return c.json({ error: String(e) }, 500)
    }
})

export default router
