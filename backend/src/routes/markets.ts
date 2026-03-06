import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'

const router = new Hono()

// ── Crypto (CoinGecko free API) ────────────────────────────────────────────

const defaultCryptoIds = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'cardano']

async function fetchCrypto() {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${defaultCryptoIds.join(',')}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    })
    if (res.status === 429) throw new Error('CoinGecko rate limited')
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
    const raw: Array<{
        id: string; symbol: string; name: string; current_price: number;
        price_change_percentage_24h: number; market_cap: number; total_volume: number;
    }> = await res.json()
    return raw.map((r) => ({
        id: r.id,
        symbol: r.symbol.toUpperCase(),
        name: r.name,
        priceUSD: r.current_price,
        change24h: r.price_change_percentage_24h,
        marketCapUSD: r.market_cap,
        volume24hUSD: r.total_volume,
    }))
}

// ── Yahoo Finance chart (stocks + commodities) ─────────────────────────────

async function fetchYahooChart(symbol: string) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status} for ${symbol}`)
    const json: {
        chart: {
            result: Array<{ meta: { symbol: string; regularMarketPrice: number; previousClose: number; chartPreviousClose: number; regularMarketChangePercent: number } }> | null
            error: { description: string } | null
        }
    } = await res.json()
    if (json.chart.error) throw new Error(json.chart.error.description)
    if (!json.chart.result?.length) throw new Error(`No result for ${symbol}`)
    const meta = json.chart.result[0].meta
    const prev = meta.previousClose || meta.chartPreviousClose || 0
    let changePct = meta.regularMarketChangePercent
    if (!changePct && prev) changePct = ((meta.regularMarketPrice - prev) / prev) * 100
    return {
        symbol: meta.symbol ?? symbol,
        price: meta.regularMarketPrice,
        prevClose: prev,
        changePct,
    }
}

async function fetchIndices() {
    const defs = [
        { symbol: '%5EGSPC', name: 'S&P 500' },
        { symbol: '%5EDJI', name: 'Dow Jones' },
        { symbol: '%5EIXIC', name: 'NASDAQ' },
    ]
    const results = await Promise.allSettled(defs.map((d) => fetchYahooChart(d.symbol)))
    return defs.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') return { symbol: d.symbol, name: d.name, price: 0, prevClose: 0, changePct: 0, error: r.reason?.message }
        return { name: d.name, ...r.value }
    })
}

async function fetchCommodities() {
    const defs = [
        { symbol: 'CL%3DF', name: 'WTI Crude Oil', unit: '$/bbl' },
        { symbol: 'GC%3DF', name: 'Gold', unit: '$/oz' },
        { symbol: 'HG%3DF', name: 'Copper', unit: '$/lb' },
    ]
    const results = await Promise.allSettled(defs.map((d) => fetchYahooChart(d.symbol)))
    return defs.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') return { symbol: d.symbol, name: d.name, unit: d.unit, price: 0, prevClose: 0, changePct: 0 }
        return { name: d.name, unit: d.unit, ...r.value }
    })
}

// ── Polymarket prediction markets ─────────────────────────────────────────

async function fetchPredictions() {
    const url = 'https://gamma-api.polymarket.com/markets?tag_id=100265&limit=20&closed=false&active=true&order=volume&ascending=false'
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Polymarket HTTP ${res.status}`)
    const raw: Array<{
        question: string; outcomeprices?: string; outcomePrices?: string;
        volume?: string; endDateIso?: string; slug?: string;
        tags?: Array<{ slug: string }>
    }> = await res.json()
    return raw
        .filter((r) => r.question)
        .slice(0, 10)
        .map((r) => {
            let prob = 0.5
            const pricesRaw = r.outcomeprices ?? r.outcomePrices ?? '[]'
            try {
                const prices: string[] = JSON.parse(pricesRaw)
                if (prices.length > 0) prob = parseFloat(prices[0]) || 0.5
            } catch { /* ignore */ }
            const vol = parseFloat(r.volume ?? '0') || 0
            return {
                title: r.question,
                probability: prob,
                volume: vol,
                category: r.tags?.[0]?.slug ?? 'politics',
                endDate: (r.endDateIso ?? '').slice(0, 10),
                slug: r.slug ?? '',
            }
        })
}

// ── Main route ─────────────────────────────────────────────────────────────

router.get('/', async (c) => {
    const cached = cacheGet<object>('markets')
    if (cached) return c.json(cached)

    const [crypto, indices, commodities, predictions] = await Promise.allSettled([
        fetchCrypto(),
        fetchIndices(),
        fetchCommodities(),
        fetchPredictions(),
    ])

    const data = {
        crypto: crypto.status === 'fulfilled' ? crypto.value : [],
        indices: indices.status === 'fulfilled' ? indices.value : [],
        commodities: commodities.status === 'fulfilled' ? commodities.value : [],
        predictions: predictions.status === 'fulfilled' ? predictions.value : [],
        fetchedAt: new Date().toISOString(),
    }

    cacheSet('markets', data, TTL.MARKETS)
    return c.json(data)
})

export default router
