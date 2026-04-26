import { useState, useCallback, useRef, useEffect } from 'react'
import type { NewsItem, MarketsData, WeatherData, IntelBrief, ScreenerResult, DeepDiveResult, WatchlistItem, Settings } from '../types.ts'

// In dev: '' — Vite proxy forwards /api/* to localhost:3001
// In production: set VITE_API_URL=https://your-backend.vercel.app in Vercel dashboard
const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

interface DashboardState {
    globalNews: NewsItem[]
    localNews: NewsItem[]
    markets: MarketsData | null
    weather: WeatherData | null
    intel: IntelBrief | null
    screener: ScreenerResult | null
    deepdive: DeepDiveResult | null
    loading: {
        globalNews: boolean
        localNews: boolean
        markets: boolean
        weather: boolean
        intel: boolean
        screener: boolean
        deepdive: boolean
    }
    errors: {
        globalNews: string | null
        localNews: string | null
        markets: string | null
        weather: string | null
        intel: string | null
        screener: string | null
        deepdive: string | null
    }
    lastUpdated: Date | null
}

const initialState: DashboardState = {
    globalNews: [],
    localNews: [],
    markets: null,
    weather: null,
    intel: null,
    screener: null,
    deepdive: null,
    loading: { globalNews: true, localNews: true, markets: true, weather: true, intel: false, screener: false, deepdive: false },
    errors: { globalNews: null, localNews: null, markets: null, weather: null, intel: null, screener: null, deepdive: null },
    lastUpdated: null,
}

export function useDashboard(settings: Settings) {
    const [state, setState] = useState<DashboardState>(initialState)
    const intelFetchingRef = useRef(false)

    const fetchData = useCallback(async () => {
        setState((prev) => ({
            ...prev,
            loading: { ...prev.loading, globalNews: true, localNews: true, markets: true, weather: true },
        }))

        const [globalNews, localNews, markets, weather] = await Promise.allSettled([
            fetch(`${API}/api/news/global`).then((r) => r.json()),
            fetch(`${API}/api/news/local?city=${encodeURIComponent(settings.city)}&country=${settings.country}`).then((r) => r.json()),
            fetch(`${API}/api/markets`).then((r) => r.json()),
            fetch(`${API}/api/weather?lat=${settings.lat}&lon=${settings.lon}&city=${encodeURIComponent(settings.city)}`).then((r) => r.json()),
        ])

        setState((prev) => ({
            ...prev,
            globalNews: globalNews.status === 'fulfilled' && !globalNews.value.error ? globalNews.value : prev.globalNews,
            localNews: localNews.status === 'fulfilled' && !localNews.value.error ? localNews.value : prev.localNews,
            markets: markets.status === 'fulfilled' && !markets.value.error ? markets.value : prev.markets,
            weather: weather.status === 'fulfilled' && !weather.value.error ? weather.value : prev.weather,
            loading: { ...prev.loading, globalNews: false, localNews: false, markets: false, weather: false },
            errors: {
                globalNews: globalNews.status === 'rejected' ? 'Feed fetch failed' : null,
                localNews: localNews.status === 'rejected' ? 'Local feed failed' : null,
                markets: markets.status === 'rejected' ? 'Markets unavailable' : null,
                weather: weather.status === 'rejected' ? 'Weather unavailable' : null,
                intel: prev.errors.intel,
                screener: prev.errors.screener,
                deepdive: prev.errors.deepdive,
            },
            lastUpdated: new Date(),
        }))
    }, [settings.city, settings.country, settings.lat, settings.lon])

    const fetchIntel = useCallback(
        async (globalHeadlines: NewsItem[], localHeadlines: NewsItem[]) => {
            if (intelFetchingRef.current) return
            intelFetchingRef.current = true
            setState((prev) => ({ ...prev, loading: { ...prev.loading, intel: true }, errors: { ...prev.errors, intel: null } }))
            try {
                const res = await fetch(`${API}/api/intel/brief`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ headlines: [...globalHeadlines, ...localHeadlines] }),
                })
                const data = await res.json()
                setState((prev) => ({
                    ...prev,
                    intel: data.error ? prev.intel : data,
                    loading: { ...prev.loading, intel: false },
                    errors: { ...prev.errors, intel: data.error ?? null },
                }))
            } catch (e) {
                setState((prev) => ({
                    ...prev,
                    loading: { ...prev.loading, intel: false },
                    errors: { ...prev.errors, intel: String(e) },
                }))
            } finally {
                intelFetchingRef.current = false
            }
        },
        []
    )

    const fetchScreener = useCallback(async (period = '1M', startDate?: string, endDate?: string) => {
        setState((prev) => ({ ...prev, loading: { ...prev.loading, screener: true }, errors: { ...prev.errors, screener: null } }))
        try {
            const res = await fetch(`${API}/api/screener/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period, ...(startDate && endDate ? { startDate, endDate } : {}) }),
            })
            const data = await res.json()
            setState((prev) => ({
                ...prev,
                screener: data.error ? prev.screener : data,
                loading: { ...prev.loading, screener: false },
                errors: { ...prev.errors, screener: data.error ?? null },
            }))
        } catch (e) {
            setState((prev) => ({
                ...prev,
                loading: { ...prev.loading, screener: false },
                errors: { ...prev.errors, screener: String(e) },
            }))
        }
    }, [])

    const fetchDeepDive = useCallback(async (watchlist: WatchlistItem[]) => {
        setState((prev) => ({ ...prev, loading: { ...prev.loading, deepdive: true }, errors: { ...prev.errors, deepdive: null } }))
        try {
            const res = await fetch(`${API}/api/deepdive/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ watchlist }),
            })
            const data = await res.json()
            setState((prev) => ({
                ...prev,
                deepdive: data.error ? prev.deepdive : data,
                loading: { ...prev.loading, deepdive: false },
                errors: { ...prev.errors, deepdive: data.error ?? null },
            }))
        } catch (e) {
            setState((prev) => ({
                ...prev,
                loading: { ...prev.loading, deepdive: false },
                errors: { ...prev.errors, deepdive: String(e) },
            }))
        }
    }, [])

    // Silently restore last screener + deepdive from disk on mount
    useEffect(() => {
        Promise.allSettled([
            fetch(`${API}/api/screener/last`).then(r => r.json()),
            fetch(`${API}/api/deepdive/last`).then(r => r.json()),
        ]).then(([screenerRes, deepdiveRes]) => {
            setState(prev => ({
                ...prev,
                screener: screenerRes.status === 'fulfilled' && !screenerRes.value.error
                    ? screenerRes.value : prev.screener,
                deepdive: deepdiveRes.status === 'fulfilled' && !deepdiveRes.value.error
                    ? deepdiveRes.value : prev.deepdive,
            }))
        })
    }, [])

    // Auto refresh every N seconds (default 5)
    useEffect(() => {
        fetchData()
        const intervalMs = (settings.refreshInterval ?? 5) * 1000
        const timer = setInterval(fetchData, intervalMs)
        return () => clearInterval(timer)
    }, [fetchData, settings.refreshInterval])

    return { state, fetchData, fetchIntel, fetchScreener, fetchDeepDive }
}
