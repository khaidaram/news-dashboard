/// <reference types="bun-types" />
import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'
import { persistGet, persistSet } from '../services/persist.ts'
import {
    runScreenerV2,
    type RawStock,
    type BrokerDataset,
    type ScreenerV2Output,
} from '../services/screenerStrategy.ts'

const router = new Hono()
const TRADERSAHAM_BASE = 'https://apiv2.tradersaham.com/api/market-insight/broker-intelligence/by-stock'
const BROKER_CODES = 'AK,BK,ZP,KZ,RX'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(period: string): { startDate: string; endDate: string } {
    const end = new Date()
    const start = new Date(end)
    if (period === '2W') start.setDate(start.getDate() - 14)
    else if (period === '3M') start.setMonth(start.getMonth() - 3)
    else start.setMonth(start.getMonth() - 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { startDate: fmt(start), endDate: fmt(end) }
}

async function fetchStockUniverse(
    startDate: string,
    endDate: string
): Promise<{ stocks: RawStock[]; totalDays: number }> {
    const base =
        `${TRADERSAHAM_BASE}?limit=50&sort_by=net_value&investor_type=all&board=R` +
        `&start_date=${startDate}&end_date=${endDate}&broker_codes=${BROKER_CODES}`

    const allStocks: RawStock[] = []
    let totalDays = 0

    for (let page = 1; page <= 4; page++) {
        const url = `${base}&page=${page}`
        console.log(`[screener v2] fetching page ${page}/4...`)

        let data: BrokerDataset | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                data = await res.json() as BrokerDataset
                break
            } catch (e) {
                console.warn(`[screener v2] page ${page} attempt ${attempt + 1} failed:`, e)
                if (attempt < 2) await new Promise(r => setTimeout(r, 500))
            }
        }

        if (!data?.stocks?.length) {
            console.warn(`[screener v2] page ${page} returned no stocks, stopping`)
            break
        }

        if (page === 1) totalDays = data.total_trading_days
        allStocks.push(...data.stocks)

        if (page < 4) await new Promise(r => setTimeout(r, 250))
    }

    return { stocks: allStocks, totalDays }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/last', async (c) => {
    const last = await persistGet<ScreenerV2Output>('screener_last_v2')
    if (!last) return c.json({ error: 'No previous scan found' }, 404)
    return c.json(last)
})

router.post('/analyze', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as {
            period?: string
            startDate?: string
            endDate?: string
        }
        const period = (['2W', '1M', '3M', 'CUSTOM'].includes(body.period ?? ''))
            ? body.period!
            : '1M'

        let startDate: string, endDate: string
        if (period === 'CUSTOM' && body.startDate && body.endDate) {
            startDate = body.startDate
            endDate = body.endDate
        } else {
            const range = getDateRange(period)
            startDate = range.startDate
            endDate = range.endDate
        }

        const cacheKey = `screener:v2:${startDate}:${endDate}`
        console.log('[screener v2] period:', period, '| range:', startDate, '→', endDate)

        const cached = cacheGet<ScreenerV2Output>(cacheKey)
        if (cached) {
            console.log('[screener v2] cache hit')
            return c.json(cached)
        }

        console.log('[screener v2] fetching stock universe (4 pages × 50)...')
        const { stocks, totalDays } = await fetchStockUniverse(startDate, endDate)

        if (!stocks.length) {
            return c.json({ error: 'No stocks returned from broker API' }, 502)
        }

        console.log(`[screener v2] universe: ${stocks.length} stocks, ${totalDays} trading days`)

        const result = await runScreenerV2(stocks, totalDays, startDate, endDate, period)

        cacheSet(cacheKey, result, TTL.INTEL)
        void persistSet('screener_last_v2', result)

        console.log(`[screener v2] done: ${result.watchlist.length} stocks in watchlist`)
        return c.json(result)
    } catch (e) {
        console.error('[screener v2] error:', e)
        return c.json({ error: `Internal error: ${String(e)}` }, 500)
    }
})

export default router
