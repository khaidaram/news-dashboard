/// <reference types="bun-types" />
import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'
import { persistGet, persistSet } from '../services/persist.ts'

const router = new Hono()
const PROFILER_BASE = 'https://apiv2.tradersaham.com/api/market-insight/broker-profiler'
const CONCURRENCY = 3
const MAX_STOCKS = 10
const MODEL_NAME = 'claude-opus-4-7'

// ── Profiler API types ────────────────────────────────────────────────────────

interface BrokerClassification {
    code: string
    name: string
    classification: string
}

interface BrokerDetail {
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
    signal: {
        signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
        confidence: number
        summary: string
        brokerBreakdown: {
            foreign: BrokerClassification[]
            domestic: BrokerClassification[]
        }
    }
    brokers: BrokerDetail[]
    brokers_overflow: BrokerDetail[]
    meta: {
        total_net_value: number
        [key: string]: unknown
    }
}

// ── Output types (mirror frontend/src/types.ts) ───────────────────────────────

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
    topBrokers: TopBrokerInfo[]
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
}

interface ClaudeSignal {
    score: number
    signal: string
    reason: string
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
}

interface DeepDiveResult {
    period: { start: string; end: string }
    analyzed: number
    allRanked: DeepDivePick[]
    generatedAt: string
    markdownBrief?: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDateRange(): { startDate: string; endDate: string } {
    const end = new Date()
    const start = new Date(end)
    start.setMonth(start.getMonth() - 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { startDate: fmt(start), endDate: fmt(end) }
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchProfile(ticker: string, startDate: string, endDate: string): Promise<ProfilerResponse> {
    const url = `${PROFILER_BASE}?stock_code=${ticker}&start_date=${startDate}&end_date=${endDate}&board=R`

    async function attempt(): Promise<ProfilerResponse> {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`)
        return res.json() as Promise<ProfilerResponse>
    }

    try {
        return await attempt()
    } catch {
        return await attempt()
    }
}

async function fetchAllProfiles(
    tickers: string[],
    startDate: string,
    endDate: string,
): Promise<Map<string, ProfilerResponse>> {
    const results = new Map<string, ProfilerResponse>()

    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        const batch = tickers.slice(i, i + CONCURRENCY)
        const settled = await Promise.allSettled(
            batch.map(t => fetchProfile(t, startDate, endDate))
        )
        settled.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                results.set(batch[idx], result.value)
            } else {
                console.error(`[deepdive] failed ${batch[idx]}:`, result.reason)
            }
        })
    }

    return results
}

// ── Extractor ─────────────────────────────────────────────────────────────────

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

function extractMetrics(response: ProfilerResponse): StockDeepDive {
    const foreignBd = response.signal?.brokerBreakdown?.foreign ?? []
    const domesticBd = response.signal?.brokerBreakdown?.domestic ?? []

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

    const topBrokers: TopBrokerInfo[] = [...(response.brokers ?? [])]
        .sort((a, b) => Math.abs(b.net_val_full) - Math.abs(a.net_val_full))
        .slice(0, 5)
        .map(b => ({
            code: b.broker_code,
            name: b.broker_name,
            type: b.broker_type,
            netValFull: b.net_val_full,
            netVal5d: b.net_5d_val,
            netVal10d: b.net_10d_val,
            classification: b.classification,
            score: b.score,
            buyDays: b.buy_days,
            tradingDays: b.trading_days,
            marketSharePct: b.market_share_pct,
            avgPrice: b.avg_price,
            acceleration: computeAcceleration(b.net_val_full, b.net_5d_val),
        }))

    const allBrokers = [...(response.brokers ?? []), ...(response.brokers_overflow ?? [])]
    const foreignNetValue = allBrokers
        .filter(b => b.broker_type === 'Foreign')
        .reduce((s, b) => s + (b.net_val_full ?? 0), 0)
    const domesticNetValue = allBrokers
        .filter(b => b.broker_type === 'Domestic')
        .reduce((s, b) => s + (b.net_val_full ?? 0), 0)
    const totalNetValue = response.meta?.total_net_value ?? (foreignNetValue + domesticNetValue)

    const classificationCounts = {
        SMART_ACCUMULATOR: 0, TRAPPED_BUYER: 0, PROFIT_TAKER: 0, NET_SELLER: 0, MIXED_RETAIL: 0,
    }
    for (const b of response.brokers ?? []) {
        const k = b.classification as keyof typeof classificationCounts
        if (k in classificationCounts) classificationCounts[k]++
    }

    const full = allBrokers.reduce((s, b) => s + (b.net_val_full ?? 0), 0)
    const recent10d = allBrokers.reduce((s, b) => s + (b.net_10d_val ?? 0), 0)
    const recent5d = allBrokers.reduce((s, b) => s + (b.net_5d_val ?? 0), 0)

    return {
        stockCode: response.stock_code,
        apiSignal: response.signal?.signal ?? 'NEUTRAL',
        apiConfidence: response.signal?.confidence ?? 0,
        apiSummary: response.signal?.summary ?? '',
        foreignBrokers,
        domesticBrokers,
        topBrokers,
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
    }
}

// ── Claude Analysis ───────────────────────────────────────────────────────────

function fmtB(val: number): string {
    const abs = Math.abs(val)
    if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}B`
    if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`
    return `${(val / 1e3).toFixed(0)}K`
}

function buildDeepDivePrompt(metrics: StockDeepDive[]): string {
    const stocksBlock = metrics.map(m => {
        const fb = m.foreignBrokers
        const db = m.domesticBrokers
        const tf = m.multiTimeframe
        const cc = m.classificationCounts
        const topForeign = m.topBrokers.filter(b => b.type === 'Foreign').slice(0, 3)
            .map(b => `${b.code}(${b.classification.replace('_', '').slice(0, 4)},${b.acceleration.replace('_', '')})`).join(', ')

        return [
            `STOCK: ${m.stockCode}`,
            `Foreign brokers: ${fb.total} total | SA: ${fb.smartAccumulators.join(',') || 'none'} | TB: ${fb.trappedBuyers.join(',') || 'none'} | NS: ${fb.netSellers.join(',') || 'none'} | PT: ${fb.profitTakers.join(',') || 'none'}`,
            `Domestic brokers: ${db.total} total | SA: ${db.smartAccumulators.join(',') || 'none'} | NS: ${db.netSellers.join(',') || 'none'}`,
            `Classification counts: SA=${cc.SMART_ACCUMULATOR} TB=${cc.TRAPPED_BUYER} PT=${cc.PROFIT_TAKER} NS=${cc.NET_SELLER} MR=${cc.MIXED_RETAIL}`,
            `Net values: total=${fmtB(m.totalNetValue)} foreign=${fmtB(m.foreignNetValue)} domestic=${fmtB(m.domesticNetValue)}`,
            `Multi-timeframe: full=${fmtB(tf.full)} 10d=${fmtB(tf.recent10d)} 5d=${fmtB(tf.recent5d)} trend=${tf.trend}`,
            `Top foreign brokers: ${topForeign || 'none'}`,
        ].join('\n')
    }).join('\n\n')

    return `You are a quantitative broker flow analyst for Indonesian equities (IDX).

Analyze the broker profiler data below for each stock and assign a conviction score (0–100) plus a brief reason.

Scoring guide:
- Score 80–100: Strong institutional accumulation — multiple foreign smart accumulators, accelerating multi-timeframe flow, low net sellers
- Score 60–79: Moderate conviction — some smart accumulation but mixed signals or decelerating
- Score 40–59: Neutral — balanced buying/selling or insufficient data
- Score 20–39: Weak — net sellers dominating or distribution pattern
- Score 0–19: Bearish — strong sell classification or reversing flow

Key factors (in order of importance):
1. Foreign smart accumulator count and quality (most important)
2. Multi-timeframe trend and acceleration (fresh entry vs decelerating)
3. Classification distribution ratio (SA+TB vs NS+PT)
4. Foreign vs domestic dominance (foreign > domestic = stronger signal)
5. Concentration risk (fewer brokers = more volatile)

DO NOT reference or use any pre-computed API signal — derive your own assessment purely from the raw broker data above.

${stocksBlock}

Output one line per stock in EXACTLY this format (no extra text, no headers):
STOCK:BBCA|SCORE:85|SIGNAL:STRONG_BUY|REASON:3 foreign smart accumulators with fresh entry acceleration, 84% foreign dominance
STOCK:TLKM|SCORE:62|SIGNAL:BUY|REASON:1 foreign SA but decelerating trend, mixed domestic flow
`
}

async function analyzeWithClaude(metrics: StockDeepDive[]): Promise<Map<string, ClaudeSignal>> {
    const signals = new Map<string, ClaudeSignal>()
    const fallback = (code: string) => signals.set(code, { score: 50, signal: 'NEUTRAL', reason: 'Claude analysis unavailable' })

    try {
        const prompt = buildDeepDivePrompt(metrics)
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
            const m = line.match(/STOCK:(\w+)\|SCORE:(\d+)\|SIGNAL:(\w+)\|REASON:(.+)/)
            if (!m) continue
            signals.set(m[1], {
                score: Math.min(100, Math.max(0, parseInt(m[2], 10))),
                signal: m[3],
                reason: m[4].trim(),
            })
        }

        // Fill any stocks Claude missed with neutral fallback
        for (const m of metrics) {
            if (!signals.has(m.stockCode)) fallback(m.stockCode)
        }
    } catch (e: any) {
        console.error('[deepdive] Claude spawn error:', e)
        metrics.forEach(m => fallback(m.stockCode))
    }

    return signals
}

// ── Scorer ────────────────────────────────────────────────────────────────────

function scoreDeepDive(metrics: StockDeepDive, claudeScore: number): DeepDiveScore {
    // Dimension 1: Foreign Conviction (35%)
    const { foreignBrokers, foreignNetValue, domesticNetValue } = metrics
    const buyerCount = foreignBrokers.smartAccumulators.length + foreignBrokers.trappedBuyers.length
    const sellerCount = foreignBrokers.netSellers.length + foreignBrokers.profitTakers.length

    let foreignConviction: number
    if (buyerCount > sellerCount && foreignNetValue > 0) foreignConviction = 80
    else if (buyerCount > 0 && foreignNetValue > 0) foreignConviction = 60
    else if (buyerCount === 0) foreignConviction = 20
    else foreignConviction = 40

    foreignConviction += Math.min(foreignBrokers.smartAccumulators.length * 10, 20)
    if (foreignNetValue > 0 && foreignNetValue > domesticNetValue) foreignConviction += 10
    foreignConviction = Math.min(foreignConviction, 100)

    // Dimension 2: Classification Health (25%)
    const { SMART_ACCUMULATOR: smart, TRAPPED_BUYER: trapped, PROFIT_TAKER: profit, NET_SELLER: seller } = metrics.classificationCounts
    const totalClassified = smart + trapped + profit + seller

    let classificationHealth: number
    if (totalClassified === 0) {
        classificationHealth = 50
    } else {
        const pos = smart * 2 + trapped * 0.5
        const neg = seller * 2 + profit * 1
        classificationHealth = Math.round((pos / (pos + neg)) * 100)
    }

    // Dimension 3: Multi-Timeframe Alignment (25%)
    const trend = metrics.multiTimeframe.trend
    let multiTimeframe: number
    if (trend === 'ACCELERATING_BUY') multiTimeframe = 100
    else if (trend === 'STEADY_BUY') multiTimeframe = 75
    else if (trend === 'DECELERATING_BUY') multiTimeframe = 45
    else if (trend === 'MIXED') multiTimeframe = 30
    else multiTimeframe = 10

    const topForeignBuyer = metrics.topBrokers.find(b => b.type === 'Foreign' && b.netValFull > 0)
    if (topForeignBuyer?.acceleration === 'FRESH_ENTRY') multiTimeframe += 15
    else if (topForeignBuyer?.acceleration === 'ACCELERATING') multiTimeframe += 10
    multiTimeframe = Math.min(multiTimeframe, 100)

    // Dimension 4: Claude Signal (15%) — replaces static API signal lookup
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
    const top5 = result.allRanked.slice(0, 5)
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

        lines.push(`### ${pick.rank}. ${pick.stockCode} — Combined Score: ${pick.combinedScore}/100`)
        lines.push(`**Signal:** ${sig?.signal?.replace('_', ' ') ?? 'N/A'} | **DeepDive:** ${pick.deepDiveScore}/100 | **SmartScan:** ${pick.smartScanScore}/100`)
        lines.push('')
        lines.push('| Dimension | Score | Weight |')
        lines.push('|-----------|-------|--------|')
        lines.push(`| Foreign Conviction | ${sb.foreignConviction}/100 | 35% |`)
        lines.push(`| Classification Health | ${sb.classificationHealth}/100 | 25% |`)
        lines.push(`| Multi-Timeframe | ${sb.multiTimeframe}/100 | 25% |`)
        lines.push(`| Claude Signal | ${sb.claudeSignal}/100 | 15% |`)
        lines.push('')
        lines.push(`**Flow:** Foreign ${fmtB(dd.foreignNetValue)} | Domestic ${fmtB(dd.domesticNetValue)} | Trend: ${tf.trend.replace(/_/g, ' ')}`)
        if (dd.foreignBrokers.smartAccumulators.length > 0) {
            lines.push(`**Foreign SA:** ${dd.foreignBrokers.smartAccumulators.join(', ')}`)
        }
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

// ── Route ─────────────────────────────────────────────────────────────────────

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
        const top = watchlist.slice(0, MAX_STOCKS)
        const tickers = top.map(w => w.ticker).filter(Boolean)

        const cacheKey = `deepdive:v2:${endDate}:${[...tickers].sort().join(',')}`
        const cached = cacheGet<DeepDiveResult>(cacheKey)
        if (cached) {
            console.log('[deepdive] cache hit')
            return c.json(cached)
        }

        console.log(`[deepdive] fetching ${tickers.length} profiles (${startDate} → ${endDate})`)
        const profiles = await fetchAllProfiles(tickers, startDate, endDate)

        if (profiles.size < 2) {
            return c.json({ error: `Too few profiles fetched (${profiles.size}/${tickers.length}) — check API availability` }, 502)
        }

        const metricsMap = new Map<string, StockDeepDive>()
        for (const ticker of tickers) {
            const profile = profiles.get(ticker)
            if (profile) metricsMap.set(ticker, extractMetrics(profile))
        }

        const metricsArray = Array.from(metricsMap.values())

        // Claude analyzes all stocks' broker data to produce per-stock signal scores
        const claudeSignals = await analyzeWithClaude(metricsArray)

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
