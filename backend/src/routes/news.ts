import { Hono } from 'hono'
import Parser from 'rss-parser'
import { classifyThreat } from '../services/threatClassifier.ts'
import { classifyLocalThreat } from '../services/localThreatClassifier.ts'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'

const router = new Hono()

const globalFeeds = [
    // US market & Fed watch — sentimen risk-on/off yang menggerakkan IHSG
    { name: 'CNBC Markets', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    // Asia Pacific context — ASEAN, China, Japan, Korea sebagai mitra dagang & kapital asing
    { name: 'CNBC Asia', url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html' },
    // Asia & Indonesia coverage, komoditas (CPO, batu bara, nikel), BOJ/PBOC policy
    { name: 'Nikkei Asia', url: 'https://asia.nikkei.com/rss/feed/nar' },
    // Global macro, analyst ratings, EM & commodity flows
    { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
]

export interface NewsItem {
    title: string
    source: string
    publishedAt: string
    url: string
    level: string
    category: string
    isLocal: boolean
}

const levelOrder: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }

// Gunakan fetch manual + parseString agar redirect diikuti dan header bisa dikontrol
async function fetchFeed(url: string): Promise<Parser.Output<Record<string, unknown>>> {
    const parser = new Parser()
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(10000),
        // Bun's fetch follow redirect secara default
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const xml = await res.text()
    return parser.parseString(xml)
}

async function fetchFeeds(
    sources: { name: string; url: string }[],
    isLocal: boolean,
    perSourceLimit = 10,
    cutoffHours = 72,
    classifier: (title: string) => { level: string; category: string } = classifyThreat
): Promise<NewsItem[]> {
    const cutoff = Date.now() - cutoffHours * 60 * 60 * 1000

    const results = await Promise.allSettled(
        sources.map(async (src) => {
            const feed = await fetchFeed(src.url)
            const items: NewsItem[] = []
            for (const entry of feed.items ?? []) {
                if (!entry.title) continue
                const pub = new Date(entry.pubDate ?? entry.isoDate ?? Date.now())
                if (pub.getTime() < cutoff) continue
                const { level, category } = classifier(entry.title)
                items.push({
                    title: entry.title,
                    source: src.name,
                    publishedAt: pub.toISOString(),
                    url: entry.link ?? '',
                    level,
                    category,
                    isLocal,
                })
            }
            // Tiap bucket: level tertinggi dulu, lalu terbaru — lalu dipotong
            items.sort((a, b) => {
                const ld = (levelOrder[b.level] ?? 1) - (levelOrder[a.level] ?? 1)
                if (ld !== 0) return ld
                return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            })
            return items.slice(0, perSourceLimit)
        })
    )

    // Gabung semua bucket, sort by waktu terbaru (per-source limit tetap menjaga keseimbangan sumber)
    const all: NewsItem[] = []
    for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
    }
    all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

    // Deduplicate by first 40 chars of title
    const seen = new Set<string>()
    return all.filter((item) => {
        const key = item.title.toLowerCase().slice(0, 40)
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

router.get('/global', async (c) => {
    const cached = cacheGet<NewsItem[]>('news:global')
    if (cached) return c.json(cached)

    try {
        const items = await fetchFeeds(globalFeeds, false, 10, 72)
        cacheSet('news:global', items, TTL.NEWS)
        return c.json(items)
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

router.get('/local', async (c) => {
    const cacheKey = `news:ihsg`
    const cached = cacheGet<NewsItem[]>(cacheKey)
    if (cached) return c.json(cached)

    const ihsgFeeds = [
        { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss' },
        { name: 'Detik Finance', url: 'https://finance.detik.com/rss.xml' },
        { name: 'Kontan Investasi', url: 'https://investasi.kontan.co.id/rss' },
        { name: 'Antara Ekonomi', url: 'https://www.antaranews.com/rss/ekonomi-bisnis' },
    ]

    try {
        const items = await fetchFeeds(ihsgFeeds, true, 8, 48, classifyLocalThreat)
        cacheSet(cacheKey, items, TTL.NEWS)
        return c.json(items)
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

export default router
