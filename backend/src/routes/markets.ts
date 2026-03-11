import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.js'

const router = new Hono()

// ── Yahoo Finance chart API (Core Engine) ─────────────────────────────
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

// ── 1. Pipeline Tahap 1: Fetch dari TraderSaham API ─────────────────────
// Mengambil Top 5 Akumulasi & Top 5 Distribusi Asing
async function getDynamicForeignFlowTickers(): Promise<{symbol: string, change_value?: string, close_price?: number, foreign_buy?: number, foreign_sell?: number, net_foreign?: number}[]> {
    try {
        const url = 'https://api.tradersaham.com/api/market-insight/active-stocks?limit=5'
        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
        })
        
        if (!res.ok) throw new Error(`TraderSaham API HTTP ${res.status}`)
        
        const json = await res.json()
        const dynamicWatchlist: {symbol: string, change_value: string, close_price: number, foreign_buy: number, foreign_sell: number, net_foreign: number}[] = []

        // Helper function format ke miliar (Billion Rupiah)
        const formatBillion = (val: number) => (val / 1_000_000_000).toFixed(1) + 'B'

        if (json.stocks && Array.isArray(json.stocks)) {
            for (const stock of json.stocks) {
                dynamicWatchlist.push({
                    symbol: `${stock.stock_code}`,
                    change_value: stock.change_value,
                    close_price: stock.close_price,
                    foreign_buy: stock.foreign_buy,
                    foreign_sell: stock.foreign_sell,
                    net_foreign: stock.net_foreign,
                })
            }
        }

        return dynamicWatchlist

    } catch (e) {
        console.warn("Gagal fetch TraderSaham API, menggunakan fallback", e)
        // Fallback jika API TraderSaham down
        return [
            { symbol: 'BBCA.JK'},
            { symbol: 'BMRI.JK'},
            { symbol: 'ASII.JK'},
        ]
    }
}

// ── 2. Pipeline Tahap 2: Fetch Harga untuk Dynamic Tickers ──────────────
async function fetchStocks() {
    const dynamicWatchlist = await getDynamicForeignFlowTickers()
    const results = await Promise.allSettled(dynamicWatchlist.map((d) => fetchYahooChart(d.symbol)))
    
    return dynamicWatchlist.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') {
            return { 
                symbol: d.symbol, 
                change_value: d.change_value,
                close_price: d.close_price,
                foreign_buy: d.foreign_buy,
                foreign_sell: d.foreign_sell,
                net_foreign: d.net_foreign,
                error: r.reason?.message
            }
        }
        return { change_value: d.change_value, ...r.value }
    })
}

// ── 3. Makro Indikator (IHSG & Global) ──────────────────────────────────
async function fetchIndices() {
    const defs = [
        { symbol: '%5EJKSE', name: 'IHSG' },           
        { symbol: 'IDR%3DX', name: 'USD/IDR' },        
        { symbol: '%5EGSPC', name: 'S&P 500' },
        { symbol: '%5EDJI', name: 'Dow Jones' },
    ]
    const results = await Promise.allSettled(defs.map((d) => fetchYahooChart(d.symbol)))
    return defs.map((d, i) => {
        const r = results[i]
        if (r.status === 'rejected') return { symbol: d.symbol, name: d.name, price: 0, prevClose: 0, changePct: 0 }
        return { name: d.name, ...r.value }
    })
}

// ── 4. Komoditas (Penggerak Saham Energi & Tambang) ─────────────────────
async function fetchCommodities() {
    const defs = [
        // Sektor Migas & Gas Alam
        { symbol: 'BZ%3DF', name: 'Brent Oil', unit: '$/bbl' },     // Katalis: MEDC, ENRG
        { symbol: 'NG%3DF', name: 'Natural Gas', unit: '$/MMBtu' }, // Katalis: PGAS, RAJA
        
        // Sektor Batu Bara
        { symbol: 'MTF%3DF', name: 'Coal (API2)', unit: '$/ton' },  // Katalis: ITMG, ADRO, PTBA, BUMI
        
        // Sektor Metal & Mineral Emas
        { symbol: 'GC%3DF', name: 'Gold', unit: '$/oz' },           // Katalis: BRMS, MDKA, PSAB, ANTM
        
        // Sektor Base Metal (Tembaga & Aluminium)
        { symbol: 'HG%3DF', name: 'Copper', unit: '$/lb' },         // Katalis: AMMN
        { symbol: 'ALI%3DF', name: 'Aluminum', unit: '$/ton' },     // Katalis: ADMR, INALUM
        
        // Sektor Agrikultur (CPO)
        // Catatan: Data CPO Malaysia di Yahoo Finance bisa fluktuatif ketersediaannya
        { symbol: 'KPO%3DF', name: 'CPO', unit: 'MYR/ton' }         // Katalis: AALI, LSIP, TAPG
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

// ── Main route ─────────────────────────────────────────────────────────────
router.get('/', async (c) => {
    const cached = cacheGet<object>('markets')
    if (cached) return c.json(cached)

    const [stocks, indices, commodities] = await Promise.allSettled([
        fetchStocks(),
        fetchIndices(),
        fetchCommodities(),
    ])

    const data = {
        stocks: stocks.status === 'fulfilled' ? stocks.value : [],
        indices: indices.status === 'fulfilled' ? indices.value : [],
        commodities: commodities.status === 'fulfilled' ? commodities.value : [],
        fetchedAt: new Date().toISOString(),
    }

    cacheSet('markets', data, TTL.MARKETS)
    return c.json(data)
})

export default router