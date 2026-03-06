import { Hono } from 'hono'
import Parser from 'rss-parser'
import { classifyThreat } from '../services/threatClassifier.ts'
import { cacheGet, cacheSet, TTL } from '../services/cache.ts'

const router = new Hono()

const globalFeeds = [
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-topnews' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
    { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/' },
    { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml' },
    { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/' },
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

async function fetchFeeds(
    sources: { name: string; url: string }[],
    isLocal: boolean
): Promise<NewsItem[]> {
    const parser = new Parser({ timeout: 10000 })
    const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24h

    const results = await Promise.allSettled(
        sources.map(async (src) => {
            const feed = await parser.parseURL(src.url)
            const items: NewsItem[] = []
            for (const entry of feed.items ?? []) {
                if (!entry.title) continue
                const pub = new Date(entry.pubDate ?? entry.isoDate ?? Date.now())
                if (pub.getTime() < cutoff) continue
                const { level, category } = classifyThreat(entry.title)
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
            return items
        })
    )

    let all: NewsItem[] = []
    for (const r of results) {
        if (r.status === 'fulfilled') all = all.concat(r.value)
    }

    // Sort: critical first, then by time
    const levelOrder: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }
    all.sort((a, b) => {
        if (levelOrder[b.level] !== levelOrder[a.level]) return levelOrder[b.level] - levelOrder[a.level]
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    })

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
        const items = await fetchFeeds(globalFeeds, false)
        cacheSet('news:global', items, TTL.NEWS)
        return c.json(items)
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

router.get('/local', async (c) => {
    const city = c.req.query('city') ?? ''
    const country = c.req.query('country') ?? 'US'
    const cacheKey = `news:local:${city}:${country}`
    const cached = cacheGet<NewsItem[]>(cacheKey)
    if (cached) return c.json(cached)

    const localFeeds = [
        {
            name: 'Google News Local',
            url: `https://news.google.com/rss/search?q=${encodeURIComponent(city)}+news&hl=en&gl=${country}&ceid=${country}:en`,
        },
        {
            name: 'Google News Country',
            url: `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(city)}`,
        },
    ]

    try {
        const items = await fetchFeeds(localFeeds, true)
        cacheSet(cacheKey, items, TTL.NEWS)
        return c.json(items)
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

export default router
