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

export interface CryptoPrice {
    id: string
    symbol: string
    name: string
    priceUSD: number
    change24h: number
    marketCapUSD: number
    volume24hUSD: number
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

export interface PredictionMarket {
    title: string
    probability: number
    volume: number
    category: string
    endDate: string
    slug: string
}

export interface MarketsData {
    crypto: CryptoPrice[]
    indices: StockIndex[]
    commodities: Commodity[]
    predictions: PredictionMarket[]
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

export interface CountryRisk {
    country: string
    score: number
    reason: string
}

export interface IntelBrief {
    summary: string
    threats: string[]
    countryRisks: CountryRisk[]
    generatedAt: string
    model: string
}

export interface Settings {
    city: string
    country: string
    lat: number
    lon: number
    refreshInterval: number // seconds
}

export const DEFAULT_SETTINGS: Settings = {
    city: 'Jakarta',
    country: 'ID',
    lat: -6.2,
    lon: 106.8,
    refreshInterval: 5,
}
