/// <reference types="bun-types" />
import { cacheGet, cacheSet, TTL } from './cache.ts'

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACKED_BROKERS = new Set(['AK', 'BK', 'ZP', 'KZ', 'RX'])
const PROFILER_BASE = 'https://apiv2.tradersaham.com/api/market-insight/broker-profiler'
const CONCURRENCY = 3
export const MODEL_VERSION = 'bandar-underwater-v2'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface RawBroker {
    broker_code: string
    broker_status: string
    net_value: number
    buy_days: number
    avg_price: number
}

export interface RawStock {
    stock_code: string
    stock_name?: string
    total_net_value: string
    broker_count: string
    avg_consistency: string
    float_pl_pct: string | number
    top_brokers: RawBroker[]
    current_price: string
    daily_data: Array<{ d: string; n: number; p: number }>
    [key: string]: unknown
}

export interface BrokerDataset {
    trading_dates: string[]
    total_trading_days: number
    stocks: RawStock[]
}

// ── Profiler/Summary API types ────────────────────────────────────────────────

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

// ── Domain types ──────────────────────────────────────────────────────────────

export type PricePhase =
    | 'dip_buy'
    | 'correction'
    | 'sideways'
    | 'pre_breakout'
    | 'strong_bullish'
    | 'bearish'

export type Tier = 'A' | 'B' | 'C'

interface BandarProfile {
    avgBandarPrice: number
    trackedBrokerCount: number  // tracked brokers in buyers (accumulating)
    fromFallback: boolean
    totalAccumNetValue: number  // sum net_val of all top buyers
    totalDistNetValue: number   // abs sum net_val of all top sellers
    meanBuyAvg: number          // weighted mean buy_avg across all buyers
    meanSellAvg: number         // weighted mean sell_avg across all sellers
    buyerCount: number          // buyers in summary response
    sellerCount: number         // sellers in summary response
    trackedInBuyers: Array<{ code: string; netVal: number; buyAvg: number }>
    trackedInSellers: Array<{ code: string; netVal: number; sellAvg: number }>
}

export interface AnalyzedStock {
    stockCode: string
    stockName: string
    currentPrice: number
    avgBandarPrice: number
    floatPL: number
    consistencyPct: number
    brokerCount: number
    trackedBrokerCount: number
    greenDays: number
    d0NetValue: number
    avgDailyNet: number
    d0IsSpike: boolean
    pricePhase: PricePhase
    trend11d: string
    compositeScore: number
    tier: Tier
    totalNetValue: number
    periodHigh: number
    periodLow: number
    topBrokers: RawBroker[]
    // From /summary API
    totalAccumNetValue: number
    totalDistNetValue: number
    meanBuyAvg: number
    meanSellAvg: number
    buyerCount: number
    sellerCount: number
    trackedInBuyers: Array<{ code: string; netVal: number; buyAvg: number }>
    trackedInSellers: Array<{ code: string; netVal: number; sellAvg: number }>
}

interface ExecutionPlan {
    stockCode: string
    tier: Tier
    compositeScore: number
    entryZone: { low: number; high: number }
    stopLoss: number
    stopLossPct: number
    tp1: { price: number; pct: number; action: string }
    tp2: { price: number; pct: number; action: string }
    tp3: { price: number; pct: number; action: string }
    riskRewardTP1: number
    riskRewardTP2: number
    allocationPct: number
    estimatedDuration: string
}

interface WatchlistItem {
    ticker: string
    name: string
    convictionScore: number
    signal: 'STRONG_BUY' | 'BUY' | 'SPECULATIVE_BUY'
    setupType: string
    smartMoneyProfile: Record<string, string>
    priceAnalysis: Record<string, string>
    tradePlan: {
        entryZone: string
        stopLoss: string
        target1: string
        target2: string
        riskReward: string
        estimatedProfit: string
        holdPeriod: string
        exitSignal: string
    }
    catalyst: string
}

export interface ScreenerV2Output {
    period?: string
    marketPulse: string
    watchlist: WatchlistItem[]
    riskRadar: Array<{ ticker: string; netValue: string; riskLevel: string; reason: string }>
    methodologyNote: string
    generatedAt: string
    model: string
}

// ── Step 2: Quality Gate ──────────────────────────────────────────────────────

function passQualityGate(stock: RawStock, totalDays: number): boolean {
    const consistencyPct = totalDays > 0 ? Number(stock.avg_consistency) / totalDays : 0
    const brokerCount = Number(stock.broker_count)
    return consistencyPct >= 0.60 && brokerCount >= 2
}

// ── Step 3A: Fetch Bandar Profile (via /summary) ──────────────────────────────

const PROFILER_FALLBACK: Omit<BandarProfile, 'avgBandarPrice'> = {
    trackedBrokerCount: 0, fromFallback: true,
    totalAccumNetValue: 0, totalDistNetValue: 0,
    meanBuyAvg: 0, meanSellAvg: 0,
    buyerCount: 0, sellerCount: 0,
    trackedInBuyers: [], trackedInSellers: [],
}

async function fetchBandarProfile(
    stockCode: string,
    startDate: string,
    endDate: string,
    currentPrice: number,
    fallbackFloatPLPct: number,
    cachePrefix: string
): Promise<BandarProfile> {
    const cacheKey = `profiler_summary:${cachePrefix}:${stockCode}`
    const hit = cacheGet<BandarProfile>(cacheKey)
    if (hit) return hit

    const url = `${PROFILER_BASE}/summary?stock_code=${stockCode}&metric=net&start_date=${startDate}&end_date=${endDate}&board=R`

    let data: SummaryResponse | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            data = await res.json() as SummaryResponse
            break
        } catch {
            if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        }
    }

    const fallbackPrice = fallbackFloatPLPct !== 0
        ? currentPrice / (1 + fallbackFloatPLPct / 100)
        : currentPrice

    if (!data || (!data.buyers.length && !data.sellers.length)) {
        const profile = { ...PROFILER_FALLBACK, avgBandarPrice: fallbackPrice }
        cacheSet(cacheKey, profile, TTL.INTEL)
        return profile
    }

    const { buyers, sellers } = data

    // Tracked broker positions
    const trackedInBuyers = buyers
        .filter(b => TRACKED_BROKERS.has(b.broker_code))
        .map(b => ({ code: b.broker_code, netVal: b.net_val, buyAvg: b.buy_avg }))
    const trackedInSellers = sellers
        .filter(b => TRACKED_BROKERS.has(b.broker_code))
        .map(b => ({ code: b.broker_code, netVal: Math.abs(b.net_val), sellAvg: b.sell_avg }))

    // avgBandarPrice: weighted avg buy_avg of tracked buyers
    let avgBandarPrice: number
    let fromFallback = false
    if (trackedInBuyers.length > 0) {
        const totalNetVal = trackedInBuyers.reduce((s, b) => s + b.netVal, 0)
        avgBandarPrice = trackedInBuyers.reduce((s, b) => s + b.buyAvg * b.netVal, 0) / totalNetVal
    } else {
        fromFallback = true
        avgBandarPrice = fallbackPrice
    }

    // Market-wide stats across all top buyers/sellers
    const totalAccumNetValue = buyers.reduce((s, b) => s + b.net_val, 0)
    const totalDistNetValue = Math.abs(sellers.reduce((s, b) => s + b.net_val, 0))

    const totalBuyVal = buyers.reduce((s, b) => s + b.buy_val, 0)
    const meanBuyAvg = totalBuyVal > 0
        ? buyers.reduce((s, b) => s + b.buy_avg * b.buy_val, 0) / totalBuyVal
        : 0
    const totalSellVal = sellers.reduce((s, b) => s + b.sell_val, 0)
    const meanSellAvg = totalSellVal > 0
        ? sellers.reduce((s, b) => s + b.sell_avg * b.sell_val, 0) / totalSellVal
        : 0

    const profile: BandarProfile = {
        avgBandarPrice,
        trackedBrokerCount: trackedInBuyers.length,
        fromFallback,
        totalAccumNetValue,
        totalDistNetValue,
        meanBuyAvg,
        meanSellAvg,
        buyerCount: buyers.length,
        sellerCount: sellers.length,
        trackedInBuyers,
        trackedInSellers,
    }

    cacheSet(cacheKey, profile, TTL.INTEL)
    return profile
}

async function fetchAllBandarProfiles(
    stocks: RawStock[],
    startDate: string,
    endDate: string,
    cachePrefix: string
): Promise<Map<string, BandarProfile>> {
    const results = new Map<string, BandarProfile>()

    for (let i = 0; i < stocks.length; i += CONCURRENCY) {
        const batch = stocks.slice(i, i + CONCURRENCY)
        const settled = await Promise.allSettled(
            batch.map(s => fetchBandarProfile(
                s.stock_code, startDate, endDate,
                Number(s.current_price), Number(s.float_pl_pct), cachePrefix
            ))
        )
        for (let j = 0; j < batch.length; j++) {
            const s = batch[j]
            const res = settled[j]
            if (res.status === 'fulfilled') {
                results.set(s.stock_code, res.value)
            } else {
                const cp = Number(s.current_price)
                const fpl = Number(s.float_pl_pct)
                const avgBandarPrice = fpl !== 0 ? cp / (1 + fpl / 100) : cp
                results.set(s.stock_code, { ...PROFILER_FALLBACK, avgBandarPrice })
            }
        }
        if (i + CONCURRENCY < stocks.length) await new Promise(r => setTimeout(r, 300))
    }

    return results
}

// ── Steps 3B/C: Float P/L ─────────────────────────────────────────────────────

function computeFloatPL(currentPrice: number, avgBandarPrice: number): number {
    return avgBandarPrice > 0 ? (currentPrice - avgBandarPrice) / avgBandarPrice : 0
}

function isInSweetSpot(floatPL: number): boolean {
    return floatPL >= -0.08 && floatPL <= 0.02
}

// ── Step 3D: Momentum ─────────────────────────────────────────────────────────

function computeMomentum(dailyData: Array<{ d: string; n: number; p: number }>) {
    const last5 = dailyData.slice(0, 5)
    if (last5.length === 0) return { greenDays: 0, d0NetValue: 0, avgDailyNet: 0, d0IsSpike: false }

    const greenDays = last5.filter(d => d.n > 0).length
    const d0NetValue = last5[0].n
    const avgDailyNet = last5.reduce((s, d) => s + d.n, 0) / last5.length
    const d0IsSpike = avgDailyNet > 0 && d0NetValue > avgDailyNet * 1.5

    return { greenDays, d0NetValue, avgDailyNet, d0IsSpike }
}

function passMomentumFilter(greenDays: number, d0NetValue: number, avgDailyNet: number): boolean {
    return greenDays >= 3 && d0NetValue > avgDailyNet
}

// ── Step 4: Price Phase + 11-day Trend ───────────────────────────────────────

function compute11DayTrend(prices: number[]): string {
    const available = prices.slice(0, Math.min(11, prices.length))
    if (available.length < 4) return 'SIDEWAYS'

    const last = available.length - 1
    const recentAvg = (available[0] + available[1] + (available[2] ?? available[1])) / 3
    const earlyAvg = (available[last] + available[last - 1] + (available[last - 2] ?? available[last - 1])) / 3

    if (earlyAvg === 0) return 'SIDEWAYS'

    // V-RECOVERY: middle prices lower than both endpoints and recent recovered
    const midPrices = available.slice(3, last - 2)
    const midAvg = midPrices.length
        ? midPrices.reduce((s, p) => s + p, 0) / midPrices.length
        : recentAvg
    if (midAvg < Math.min(recentAvg, earlyAvg) * 0.97 && recentAvg > earlyAvg * 1.01) return 'V-RECOVERY'

    const change = (recentAvg - earlyAvg) / earlyAvg
    if (change > 0.02) return 'UPTREND'
    if (change < -0.02) return 'DOWNTREND'
    return 'SIDEWAYS'
}

function classifyPricePhase(prices: number[]): PricePhase {
    if (prices.length < 3) return 'sideways'

    const newest = prices[0]
    const oldest = prices[prices.length - 1]
    if (oldest === 0 || newest === 0) return 'sideways'

    const periodChange = (newest - oldest) / oldest
    const price5dAgo = prices.length > 5 ? prices[5] : prices[prices.length - 1]
    const last5dChange = price5dAgo > 0 ? (newest - price5dAgo) / price5dAgo : 0

    const returns: number[] = []
    for (let i = 0; i < prices.length - 1; i++) {
        if (prices[i + 1] > 0) returns.push((prices[i] - prices[i + 1]) / prices[i + 1])
    }
    const meanRet = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0
    const volatility = returns.length
        ? Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length)
        : 0
    const isLowVol = volatility < 0.015

    const periodHigh = Math.max(...prices)
    const distFromHigh = periodHigh > 0 ? (newest - periodHigh) / periodHigh : 0

    if (periodChange <= -0.08 && last5dChange <= -0.03) return 'dip_buy'
    if (periodChange > 0 && last5dChange < -0.03) return 'correction'
    if (distFromHigh >= -0.03 && isLowVol) return 'pre_breakout'
    if (Math.abs(periodChange) < 0.05 && isLowVol) return 'sideways'
    if (periodChange > 0.10) return 'strong_bullish'
    if (periodChange < -0.10) return 'bearish'
    return 'sideways'
}

// ── Step 5: Composite Score ───────────────────────────────────────────────────

const WEIGHTS = {
    consistency: 0.25,
    floatPL: 0.25,
    momentum: 0.20,
    spike: 0.10,
    pricePhase: 0.15,
    brokerDensity: 0.05,
}

function computeFloatPLScore(floatPL: number): number {
    if (floatPL < -0.08 || floatPL > 0.02) return 0
    const distance = Math.abs(floatPL - (-0.05))
    return Math.max(0, 1 - distance / 0.07)
}

function spikeScore(d0Net: number, avgDailyNet: number): number {
    if (avgDailyNet <= 0) return 0.30
    const ratio = d0Net / avgDailyNet
    if (ratio >= 3.0) return 1.00
    if (ratio >= 2.0) return 0.85
    if (ratio >= 1.5) return 0.70
    if (ratio >= 1.0) return 0.50
    return 0.30
}

function phaseScore(phase: PricePhase): number {
    const scores: Record<PricePhase, number> = {
        dip_buy: 1.00,
        correction: 0.90,
        sideways: 0.80,
        pre_breakout: 0.75,
        bearish: 0.70,
        strong_bullish: 0.40,
    }
    return scores[phase]
}

function computeCompositeScore(
    consistencyPct: number,
    floatPL: number,
    greenDays: number,
    d0Net: number,
    avgDailyNet: number,
    phase: PricePhase,
    trackedBrokerCount: number
): number {
    const w = WEIGHTS
    return (
        w.consistency * consistencyPct +
        w.floatPL * computeFloatPLScore(floatPL) +
        w.momentum * (greenDays / 5) +
        w.spike * spikeScore(d0Net, avgDailyNet) +
        w.pricePhase * phaseScore(phase) +
        w.brokerDensity * Math.min(trackedBrokerCount / 3, 1)
    ) * 100
}

function classifyTier(score: number): Tier | null {
    if (score >= 80) return 'A'
    if (score >= 65) return 'B'
    if (score >= 50) return 'C'
    return null
}

// ── Step 6: Execution Plan ────────────────────────────────────────────────────

function generateExecutionPlan(stock: AnalyzedStock): ExecutionPlan {
    const cp = stock.currentPrice
    const avgBandar = stock.avgBandarPrice
    const tier = stock.tier

    const entryLow = Math.round(cp * 0.99)
    const entryHigh = Math.round(cp * 1.01)
    const entryMid = (entryLow + entryHigh) / 2

    const slPct = tier === 'A' ? 0.032 : 0.038
    const stopLoss = Math.round(entryMid * (1 - slPct))

    const tp1Price = Math.round(avgBandar)
    const tp2Price = Math.round(avgBandar * 1.06)
    const tp3Price = Math.round(avgBandar * 1.15)

    const risk = entryMid - stopLoss
    const rrTP1 = risk > 0 ? (tp1Price - entryMid) / risk : 0
    const rrTP2 = risk > 0 ? (tp2Price - entryMid) / risk : 0

    const tp1Pct = entryMid > 0 ? ((tp1Price - entryMid) / entryMid) * 100 : 0
    const tp2Pct = entryMid > 0 ? ((tp2Price - entryMid) / entryMid) * 100 : 0
    const tp3Pct = entryMid > 0 ? ((tp3Price - entryMid) / entryMid) * 100 : 0

    return {
        stockCode: stock.stockCode,
        tier,
        compositeScore: stock.compositeScore,
        entryZone: { low: entryLow, high: entryHigh },
        stopLoss,
        stopLossPct: slPct * 100,
        tp1: { price: tp1Price, pct: tp1Pct, action: 'Close 30%' },
        tp2: { price: tp2Price, pct: tp2Pct, action: 'Close 40%' },
        tp3: { price: tp3Price, pct: tp3Pct, action: 'Trail stop, close 30%' },
        riskRewardTP1: rrTP1,
        riskRewardTP2: rrTP2,
        allocationPct: tier === 'A' ? 60 : 40,
        estimatedDuration: tier === 'A' ? '2-5 weeks' : '3-6 weeks',
    }
}

// ── Output Formatters ─────────────────────────────────────────────────────────

function buildCatalyst(stock: AnalyzedStock): string {
    const floatPLAbs = Math.abs(stock.floatPL * 100).toFixed(1)
    const direction = stock.floatPL < 0
        ? `${floatPLAbs}% underwater`
        : `near breakeven (+${(stock.floatPL * 100).toFixed(1)}%)`

    const phaseDesc: Record<PricePhase, string> = {
        dip_buy: 'price in sharp dip while bandar continues accumulating',
        correction: 'healthy pullback into bandar support zone',
        sideways: 'base consolidation above bandar average cost',
        pre_breakout: 'tightening near resistance, bandar holding support',
        strong_bullish: 'price trending up with bandar flow',
        bearish: 'contrarian buy — bandar absorbing retail selling',
    }

    const momentumNote = stock.d0IsSpike
        ? 'D-0 spike confirms fresh institutional buying.'
        : `${stock.greenDays}/5 recent days green.`

    return `Tracked brokers are ${direction} — ${phaseDesc[stock.pricePhase]}. ${momentumNote}`
}

function toWatchlistItem(stock: AnalyzedStock, plan: ExecutionPlan): WatchlistItem {
    const phaseToSetup: Record<PricePhase, string> = {
        dip_buy: 'DIP_BUY',
        correction: 'DIP_BUY',
        bearish: 'DIP_BUY',
        pre_breakout: 'PRE_BREAKOUT',
        sideways: 'PRE_BREAKOUT',
        strong_bullish: 'MOMENTUM_CONTINUATION',
    }
    const tierToSignal: Record<Tier, 'STRONG_BUY' | 'BUY' | 'SPECULATIVE_BUY'> = {
        A: 'STRONG_BUY',
        B: 'BUY',
        C: 'SPECULATIVE_BUY',
    }

    const fmt = (p: number) => Math.round(p).toLocaleString('id-ID')
    const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`
    const fmtNet = (v: number) => {
        const m = Math.round(v / 1_000_000)
        return m >= 1000 ? `${(m / 1000).toFixed(2)}B IDR` : `${m}M IDR`
    }

    const floatPctNum = stock.floatPL * 100

    // Broker type classification from by-stock top_brokers (has broker_status)
    const trackedActiveByStock = stock.topBrokers.filter(
        b => TRACKED_BROKERS.has(b.broker_code) && b.net_value > 0
    )
    const statusMap = new Map(stock.topBrokers.map(b => [b.broker_code, b.broker_status]))

    const hasWhale = trackedActiveByStock.some(b => b.broker_status === 'Whale')
    const hasBandar = trackedActiveByStock.some(
        b => b.broker_status === 'Bandar' || b.broker_status === 'Retail / Bandar'
    )
    const topBrokerType = hasWhale && hasBandar ? 'Mixed'
        : hasWhale ? 'Whale-Led'
        : hasBandar ? 'Bandar-Led'
        : stock.trackedBrokerCount > 0 ? 'Institutional' : '—'

    // Key brokers: from /summary data, tracked buyers then tracked sellers
    const keyBrokerParts: string[] = []
    for (const b of [...stock.trackedInBuyers].sort((a, b2) => b2.netVal - a.netVal)) {
        const status = statusMap.get(b.code) ?? ''
        const sc = status === 'Whale' ? 'W' : status === 'Bandar' ? 'B'
            : status === 'Retail / Bandar' ? 'RB' : '+'
        keyBrokerParts.push(`${b.code}(${sc}) buy:${fmt(b.buyAvg)}`)
    }
    for (const b of [...stock.trackedInSellers].sort((a, b2) => b2.netVal - a.netVal)) {
        const status = statusMap.get(b.code) ?? ''
        const sc = status === 'Whale' ? 'W' : status === 'Bandar' ? 'B'
            : status === 'Retail / Bandar' ? 'RB' : '-'
        keyBrokerParts.push(`${b.code}(${sc}) sell:${fmt(b.sellAvg)}`)
    }
    const keyBrokers = keyBrokerParts.join('  ') || '—'

    const netImbalance = stock.totalAccumNetValue - stock.totalDistNetValue

    return {
        ticker: stock.stockCode,
        name: stock.stockName || stock.stockCode,
        convictionScore: Math.round(stock.compositeScore),
        signal: tierToSignal[stock.tier],
        setupType: phaseToSetup[stock.pricePhase],
        smartMoneyProfile: {
            'Dominant Flow': netImbalance >= 0 ? 'NET_ACCUMULATION' : 'NET_DISTRIBUTION',
            'Acc. Net Value': stock.totalAccumNetValue > 0 ? fmtNet(stock.totalAccumNetValue) : 'None',
            'Dist. Net Value': stock.totalDistNetValue > 0 ? fmtNet(stock.totalDistNetValue) : 'None',
            'Net Imbalance': `${netImbalance >= 0 ? '+' : ''}${fmtNet(netImbalance)}`,
            'Top Broker Type': topBrokerType,
            'Broker Count (Acc/Dist)': `${stock.buyerCount} / ${stock.sellerCount}`,
            'Consistency': `${(stock.consistencyPct * 100).toFixed(0)}%`,
            'Key Brokers': keyBrokers,
        },
        priceAnalysis: {
            'Current Price': fmt(stock.currentPrice),
            'Smart Money Avg Price': fmt(stock.avgBandarPrice),
            'Distance to Avg': fmtPct(floatPctNum),
            'Market Mean Buy': stock.meanBuyAvg > 0 ? fmt(stock.meanBuyAvg) : '—',
            'Market Mean Sell': stock.meanSellAvg > 0 ? fmt(stock.meanSellAvg) : '—',
            '11-Day Trend': stock.trend11d,
            'Price Range': `${fmt(stock.periodLow)} - ${fmt(stock.periodHigh)}`,
            'Support Zone': fmt(Math.round(stock.avgBandarPrice * 0.97)),
            'Resistance Zone': fmt(stock.periodHigh),
        },
        tradePlan: {
            entryZone: `${fmt(plan.entryZone.low)} - ${fmt(plan.entryZone.high)}`,
            stopLoss: `${fmt(plan.stopLoss)} (-${plan.stopLossPct.toFixed(1)}%)`,
            target1: `${fmt(plan.tp1.price)} (${fmtPct(plan.tp1.pct)}) — ${plan.tp1.action}`,
            target2: `${fmt(plan.tp2.price)} (${fmtPct(plan.tp2.pct)}) — ${plan.tp2.action}`,
            riskReward: `1:${Math.max(plan.riskRewardTP2, 0).toFixed(1)}`,
            estimatedProfit: `T1: ${fmtPct(plan.tp1.pct)}, T2: ${fmtPct(plan.tp2.pct)}`,
            holdPeriod: plan.estimatedDuration,
            exitSignal: `Close below ${fmt(plan.stopLoss)} or bandar exits position`,
        },
        catalyst: buildCatalyst(stock),
    }
}

function generateMarketPulse(
    analyzed: AnalyzedStock[],
    totalScanned: number,
    qualifiedCount: number,
    startDate: string,
    endDate: string
): string {
    const tierA = analyzed.filter(s => s.tier === 'A').length
    const tierB = analyzed.filter(s => s.tier === 'B').length
    const tierC = analyzed.filter(s => s.tier === 'C').length
    const avgFloatPL = analyzed.length
        ? analyzed.reduce((sum, s) => sum + s.floatPL, 0) / analyzed.length * 100
        : 0
    const totalNetM = analyzed.reduce((sum, s) => sum + s.totalNetValue, 0) / 1_000_000
    const dipCount = analyzed.filter(s =>
        s.pricePhase === 'dip_buy' || s.pricePhase === 'correction' || s.pricePhase === 'bearish'
    ).length

    const posture = avgFloatPL < -3
        ? 'substantially underwater — strong incentive to defend and push price'
        : avgFloatPL < 0
        ? 'slightly underwater — moderate defense pressure'
        : 'near breakeven — accumulation phase likely complete'

    return (
        `Scan ${startDate} to ${endDate}: ${totalScanned} stocks scanned, ${qualifiedCount} passed quality gate, ` +
        `${analyzed.length} confirmed in bandar underwater sweet spot. ` +
        `Found ${tierA} Tier A (STRONG_BUY), ${tierB} Tier B (BUY), and ${tierC} Tier C (SPECULATIVE_BUY) setups ` +
        `with combined tracked-broker net accumulation of ${Math.round(totalNetM)}M IDR. ` +
        `Average bandar float P/L: ${avgFloatPL.toFixed(1)}% — smart money is ${posture}. ` +
        `${dipCount} setups show price weakness (dip/correction/bearish) with continued accumulation — ` +
        `highest conviction entries for contrarian positioning.`
    )
}

function generateRiskRadar(
    qualified: RawStock[],
    sweetSpotPassedCodes: Set<string>
): Array<{ ticker: string; netValue: string; riskLevel: string; reason: string }> {
    return qualified
        .filter(s => !sweetSpotPassedCodes.has(s.stock_code))
        .sort((a, b) => Math.abs(Number(b.total_net_value)) - Math.abs(Number(a.total_net_value)))
        .slice(0, 3)
        .map(s => {
            const netM = Math.round(Math.abs(Number(s.total_net_value)) / 1_000_000)
            const netFormatted = netM >= 1000 ? `${(netM / 1000).toFixed(2)}B IDR` : `${netM}M IDR`
            const floatPLPct = Number(s.float_pl_pct)
            const riskLevel = Number(s.broker_count) >= 3 || netM > 5000 ? 'CRITICAL' : 'HIGH'
            const reason = floatPLPct < -8
                ? `bandar ${Math.abs(floatPLPct).toFixed(1)}% underwater, capitulation risk`
                : `bandar +${Math.abs(floatPLPct).toFixed(1)}% profit, upside limited`
            return { ticker: s.stock_code, netValue: netFormatted, riskLevel, reason }
        })
}

// ── Main V2 Pipeline ──────────────────────────────────────────────────────────

export async function runScreenerV2(
    rawStocks: RawStock[],
    totalDays: number,
    startDate: string,
    endDate: string,
    period: string
): Promise<ScreenerV2Output> {
    console.log(`[screener v2] total stocks: ${rawStocks.length}, totalDays: ${totalDays}`)

    // Step 2: Quality Gate
    const qualified = rawStocks.filter(s => passQualityGate(s, totalDays))
    console.log(`[screener v2] Step 2 quality gate: ${qualified.length}/${rawStocks.length} passed`)

    if (qualified.length === 0) {
        return {
            period,
            marketPulse: 'No stocks passed the quality gate for the selected period.',
            watchlist: [],
            riskRadar: [],
            methodologyNote: 'Bandar Underwater Scanner V2. No candidates met consistency and broker count thresholds.',
            generatedAt: new Date().toISOString(),
            model: MODEL_VERSION,
        }
    }

    // Step 3A: Fetch broker profiler for all qualified stocks
    const cachePrefix = `${startDate}:${endDate}`
    console.log(`[screener v2] Step 3A: fetching profiler for ${qualified.length} stocks...`)
    const bandarProfiles = await fetchAllBandarProfiles(qualified, startDate, endDate, cachePrefix)

    // Steps 3B/C → 3D → 4 → 5: filter + score
    const sweetSpotPassedCodes = new Set<string>()
    const analyzedList: AnalyzedStock[] = []

    for (const s of qualified) {
        const currentPrice = Number(s.current_price)
        const profile = bandarProfiles.get(s.stock_code)!

        // Step 3C: Sweet spot hard filter
        const floatPL = computeFloatPL(currentPrice, profile.avgBandarPrice)
        if (!isInSweetSpot(floatPL)) continue
        sweetSpotPassedCodes.add(s.stock_code)

        // Step 3D: Momentum from existing daily_data (newest-first)
        const { greenDays, d0NetValue, avgDailyNet, d0IsSpike } = computeMomentum(s.daily_data)
        if (!passMomentumFilter(greenDays, d0NetValue, avgDailyNet)) continue

        // Step 4: Price phase + 11-day trend
        const prices = s.daily_data.map(d => d.p)
        const pricePhase = classifyPricePhase(prices)
        const trend11d = compute11DayTrend(prices)

        // Step 5: Composite score
        const consistencyPct = totalDays > 0 ? Number(s.avg_consistency) / totalDays : 0
        const compositeScore = computeCompositeScore(
            consistencyPct, floatPL, greenDays, d0NetValue, avgDailyNet, pricePhase, profile.trackedBrokerCount
        )

        const tier = classifyTier(compositeScore)
        if (!tier) continue

        analyzedList.push({
            stockCode: s.stock_code,
            stockName: (s.stock_name as string) || s.stock_code,
            currentPrice,
            avgBandarPrice: profile.avgBandarPrice,
            floatPL,
            consistencyPct,
            brokerCount: Number(s.broker_count),
            trackedBrokerCount: profile.trackedBrokerCount,
            greenDays,
            d0NetValue,
            avgDailyNet,
            d0IsSpike,
            pricePhase,
            trend11d,
            compositeScore,
            tier,
            totalNetValue: Number(s.total_net_value),
            periodHigh: prices.length ? Math.max(...prices) : currentPrice,
            periodLow: prices.length ? Math.min(...prices) : currentPrice,
            topBrokers: s.top_brokers,
            totalAccumNetValue: profile.totalAccumNetValue,
            totalDistNetValue: profile.totalDistNetValue,
            meanBuyAvg: profile.meanBuyAvg,
            meanSellAvg: profile.meanSellAvg,
            buyerCount: profile.buyerCount,
            sellerCount: profile.sellerCount,
            trackedInBuyers: profile.trackedInBuyers,
            trackedInSellers: profile.trackedInSellers,
        })
    }

    analyzedList.sort((a, b) => b.compositeScore - a.compositeScore)
    console.log(`[screener v2] Step 5: ${analyzedList.length} stocks tiered (A/B/C)`)

    // Step 6: Execution plans → watchlist items
    const watchlist = analyzedList.map(stock => toWatchlistItem(stock, generateExecutionPlan(stock)))

    const riskRadar = generateRiskRadar(qualified, sweetSpotPassedCodes)
    const marketPulse = generateMarketPulse(analyzedList, rawStocks.length, qualified.length, startDate, endDate)

    return {
        period,
        marketPulse,
        watchlist,
        riskRadar,
        methodologyNote: [
            'Bandar Underwater Scanner V2.',
            'Tracked brokers: AK, BK, ZP, KZ, RX.',
            'Sweet spot: bandar float P/L -8% to +2%.',
            'Score weights: consistency 25%, float P/L 25%, momentum 20%, price phase 15%, spike 10%, broker density 5%.',
            'TP targets anchored to tracked-broker average accumulation price.',
            'Broker flow data is backward-looking and does not guarantee future price action.',
        ].join(' '),
        generatedAt: new Date().toISOString(),
        model: MODEL_VERSION,
    }
}
