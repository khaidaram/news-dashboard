import { useState, useCallback, useRef, useEffect } from 'react'
import type { NewsItem, MarketsData, WeatherData, IntelBrief, Settings } from '../types.ts'

// In dev: '' — Vite proxy forwards /api/* to localhost:3001
// In production: set VITE_API_URL=https://your-backend.vercel.app in Vercel dashboard
const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

interface DashboardState {
    globalNews: NewsItem[]
    localNews: NewsItem[]
    markets: MarketsData | null
    weather: WeatherData | null
    intel: IntelBrief | null
    loading: {
        globalNews: boolean
        localNews: boolean
        markets: boolean
        weather: boolean
        intel: boolean
    }
    errors: {
        globalNews: string | null
        localNews: string | null
        markets: string | null
        weather: string | null
        intel: string | null
    }
    lastUpdated: Date | null
}

const initialState: DashboardState = {
    globalNews: [],
    localNews: [],
    markets: null,
    weather: null,
    intel: null,
    loading: { globalNews: true, localNews: true, markets: true, weather: true, intel: false },
    errors: { globalNews: null, localNews: null, markets: null, weather: null, intel: null },
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
            },
            lastUpdated: new Date(),
        }))
    }, [settings.city, settings.country, settings.lat, settings.lon])

    const fetchIntel = useCallback(
        async (headlines: NewsItem[]) => {
            if (intelFetchingRef.current) return
            intelFetchingRef.current = true
            setState((prev) => ({ ...prev, loading: { ...prev.loading, intel: true }, errors: { ...prev.errors, intel: null } }))
            try {
                const res = await fetch(`${API}/api/intel/brief`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ headlines }),
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

    // Auto refresh every N seconds (default 5)
    useEffect(() => {
        fetchData()
        const intervalMs = (settings.refreshInterval ?? 5) * 1000
        const timer = setInterval(fetchData, intervalMs)
        return () => clearInterval(timer)
    }, [fetchData, settings.refreshInterval])

    return { state, fetchData, fetchIntel }
}
