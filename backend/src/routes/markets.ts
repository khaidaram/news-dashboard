import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'

const router = new Hono()

// ── Yahoo Finance chart API ────────────────────────────────────────────────
// Gunakan range=5d agar chartPreviousClose terisi benar & changePct akurat
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
    const json: any = await res.json()
    if (json.chart.error) throw new Error(json.chart.error.description)
    if (!json.chart.result?.length) throw new Error(`No result for ${symbol}`)

    const result = json.chart.result[0]
    const meta = result.meta
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

    const price = meta.regularMarketPrice
    // chartPreviousClose lebih akurat daripada previousClose di request tanpa range
    const prevClose = meta.chartPreviousClose
        || (closes.length >= 2 ? closes[closes.length - 2] : 0)
        || 0

    const changePct = meta.regularMarketChangePercent != null
        ? meta.regularMarketChangePercent
        : prevClose ? ((price - prevClose) / prevClose) * 100 : 0

    return {
        symbol: meta.symbol ?? symbol,
        price,
        prevClose,
        changePct,
    }
}

// ── Makro Indikator (IHSG & Global) ─────────────────────────────────────────
async function fetchIndices() {
    const defs = [
        { symbol: '%5EJKSE',    name: 'IHSG'      },
        { symbol: '%5EJKLQ45',  name: 'LQ45'      },
        { symbol: '%5EJKIDX30', name: 'IDX30'     },
        { symbol: 'IDR%3DX',    name: 'USD/IDR'   },
        { symbol: '%5EGSPC',    name: 'S&P 500'   },
        { symbol: '%5EDJI',     name: 'Dow Jones' },
    ]
    const results = await Promise.allSettled(defs.map((d) => fetchYahooChart(d.symbol)))
    return defs.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') return { symbol: d.symbol, name: d.name, price: 0, prevClose: 0, changePct: 0 }
        return { name: d.name, ...r.value }
    })
}

// ── Komoditas (Penggerak Saham Energi & Tambang) ─────────────────────────────
// Simbol yang terkonfirmasi aktif di Yahoo Finance per April 2026
async function fetchCommodities() {
    const defs = [
        // Energi
        { symbol: 'BZ%3DF',  name: 'Brent Oil',   unit: '$/bbl'   }, // MEDC, ENRG
        { symbol: 'NG%3DF',  name: 'Natural Gas',  unit: '$/MMBtu' }, // PGAS, RAJA

        // Batu Bara
        { symbol: 'MTF%3DF', name: 'Coal (API2)',  unit: '$/ton'   }, // ITMG, ADRO, PTBA, BUMI

        // Logam Mulia
        { symbol: 'GC%3DF',  name: 'Gold',         unit: '$/oz'    }, // ANTM, BRMS, MDKA

        // Base Metal
        { symbol: 'HG%3DF',  name: 'Copper',       unit: '$/lb'    }, // AMMN
        { symbol: 'ALI%3DF', name: 'Aluminum',      unit: '$/ton'   }, // ADMR, INALUM

        // Agrikultur — PALM.L (WisdomTree Palm Oil ETC, LSE) sebagai proxy CPO
        { symbol: 'PALM.L',  name: 'Palm Oil ETC', unit: 'GBp'     }, // AALI, LSIP, TAPG
    ]

    const results = await Promise.allSettled(defs.map((d) => fetchYahooChart(d.symbol)))
    return defs.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') {
            return { symbol: d.symbol, name: d.name, unit: d.unit, price: 0, prevClose: 0, changePct: 0 }
        }
        return { name: d.name, unit: d.unit, ...r.value }
    })
}

// ── Main route ───────────────────────────────────────────────────────────────
router.get('/', async (c) => {
    const cached = cacheGet<object>('markets')
    if (cached) return c.json(cached)

    const [indices, commodities] = await Promise.allSettled([
        fetchIndices(),
        fetchCommodities(),
    ])

    const data = {
        indices:     indices.status     === 'fulfilled' ? indices.value     : [],
        commodities: commodities.status === 'fulfilled' ? commodities.value : [],
        fetchedAt: new Date().toISOString(),
    }

    cacheSet('markets', data, TTL.MARKETS)
    return c.json(data)
})

export default router
