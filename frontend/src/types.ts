// Shared types between frontend and backend

export type ThreatLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export interface NewsItem {
    title: string
    source: string
    publishedAt: string
    url: string
    level: ThreatLevel
    category: string
    isLocal: boolean
}

export interface StockIndex {
    symbol: string
    name: string
    price: number
    prevClose: number
    changePct: number
}

export interface Commodity {
    symbol: string
    name: string
    price: number
    prevClose: number
    unit: string
    changePct: number
}

export interface MarketsData {
    indices: StockIndex[]
    commodities: Commodity[]
    fetchedAt: string
}

export interface WeatherConditions {
    city: string
    tempC: number
    feelsLikeC: number
    humidity: number
    windSpeedKmh: number
    windDirection: string
    description: string
    icon: string
    visibility: number
    uvIndex: number
    isDay: boolean
}

export interface DayForecast {
    date: string
    maxTempC: number
    minTempC: number
    rainMM: number
    icon: string
    desc: string
}

export interface WeatherData {
    conditions: WeatherConditions
    forecast: DayForecast[]
    fetchedAt: string
}

export interface MomentumStock {
    ticker: string
    sentiment: 'BULLISH' | 'BEARISH'
    reason: string
}

export interface SectorRisk {
    sector: string
    score: number
    reason: string
}

export interface IntelBrief {
    summary: string
    momentumStocks: MomentumStock[]
    sectorRisks: SectorRisk[]
    generatedAt: string
    model: string
}

export interface Settings {
    city: string
    country: string
    lat: number
    lon: number
    refreshInterval: number // seconds
    enableIntelBrief: boolean
}

// ── Smart Money Screener ─────────────────────────────────────────────────────

export interface BrokerFlow {
    broker_code: string
    broker_status: string   // "Whale", "Bandar", "Retail", "Retail / Bandar", etc.
    net_value: number
    buy_days: number
    avg_price: number
}

export interface DailyData {
    d: string   // "YYYY-MM-DD"
    n: number   // daily net flow value
    p: number   // closing price
}

export interface StockEntry {
    stock_code: string
    stock_name: string
    total_net_value: string
    broker_count: string
    avg_consistency: string
    top_brokers: BrokerFlow[]
    current_price: string
    avg_price: string
    float_pl_pct: string
    daily_data: DailyData[]
}

export interface BrokerDataset {
    trading_dates: string[]
    total_trading_days: number
    stocks: StockEntry[]
}

export interface WatchlistItem {
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

export interface ScreenerResult {
    period?: string   // '2W' | '1M' | '3M'
    marketPulse: string
    watchlist: WatchlistItem[]
    riskRadar: Array<{
        ticker: string
        netValue: string
        riskLevel: string
        reason: string
    }>
    methodologyNote: string
    generatedAt: string
    model: string
}

// ── Deep Dive ────────────────────────────────────────────────────────────────

export type AccelerationLabel = 'FRESH_ENTRY' | 'ACCELERATING' | 'STEADY' | 'DECELERATING' | 'REVERSING'

export type MultiTfTrend =
    | 'ACCELERATING_BUY' | 'STEADY_BUY' | 'DECELERATING_BUY'
    | 'ACCELERATING_SELL' | 'STEADY_SELL' | 'DECELERATING_SELL'
    | 'MIXED'

export interface TopBrokerInfo {
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

export interface StockDeepDive {
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

export interface DeepDiveScore {
    foreignConviction: number
    classificationHealth: number
    multiTimeframe: number
    claudeSignal: number
    composite: number
}

export interface DeepDivePick {
    rank: number
    stockCode: string
    smartScanScore: number
    deepDiveScore: number
    combinedScore: number
    deepDive: StockDeepDive
    scoreBreakdown: DeepDiveScore
    claudeNarrative?: string
}

export interface DeepDiveResult {
    period: { start: string; end: string }
    analyzed: number
    allRanked: DeepDivePick[]
    generatedAt: string
    markdownBrief?: string
}

export const DEFAULT_SETTINGS: Settings = {
    city: 'Jakarta',
    country: 'ID',
    lat: -6.2,
    lon: 106.8,
    refreshInterval: 5,
    enableIntelBrief: false,
}
