/// <reference types="bun-types" />
import { Hono } from 'hono'

const router = new Hono()
const MODEL_NAME = 'claude-opus-4-7'

interface NewsItem {
    title: string
    level: string
    source: string
    category?: string
    publishedAt?: string
    isLocal?: boolean
}

// ── IHSG Market Intelligence Brief via Claude Code CLI ───────────────────────

router.post('/brief', async (c) => {
    const body = await c.req.json<{ headlines: NewsItem[] }>()
    const { headlines } = body

    if (!headlines?.length) return c.json({ error: 'No headlines provided' }, 400)

    const levelOrder: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }
    const sortByLevel = (a: NewsItem, b: NewsItem) => {
        const ld = (levelOrder[b.level] ?? 1) - (levelOrder[a.level] ?? 1)
        if (ld !== 0) return ld
        return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
    }

    const globalNews = [...headlines.filter(h => !h.isLocal)].sort(sortByLevel).slice(0, 20)
    const localNews = [...headlines.filter(h => h.isLocal)].sort(sortByLevel).slice(0, 25)
    const combined = [...globalNews, ...localNews]

    const headlineText = combined
        .map((h, i) => `${i + 1}. [${h.isLocal ? 'LOCAL' : 'GLOBAL'}] [${h.level}] [${h.category ?? 'general'}] ${h.title} (${h.source})`)
        .join('\n')

    const prompt = `You are a Senior Indonesian Equity Analyst and Momentum Trader. Your expertise is analyzing financial news, macroeconomic data, and corporate actions to identify immediate price movers in the Indonesian Stock Exchange (IHSG). You must extract specific stock tickers affected by the news and classify their sentiment (BULLISH/BEARISH). Be factual, concise, and focused on momentum and Smart Money flow.

Analyze the following ${combined.length} recent headlines (${globalNews.length} global macro + ${localNews.length} IHSG local). Use [GLOBAL] headlines for macro risk-on/off context (Fed, DXY, commodities, China) and [LOCAL] headlines for direct IHSG catalysts (BI Rate, IDR, earnings, corporate actions).

HEADLINES:
${headlineText}

Respond EXACTLY in this format — no markdown formatting blocks, no extra lines, no preamble:

SUMMARY:
<3-4 sentences. Summarize the overall market sentiment today. Mention key macro drivers like Rupiah exchange rate, BI Rate, or global commodity prices affecting IHSG. Highlight the most dominant sector in the news.>

MOMENTUM_STOCKS:
<TICKER>|<SENTIMENT>|<3-5 word reason>
<TICKER>|<SENTIMENT>|<3-5 word reason>
<TICKER>|<SENTIMENT>|<3-5 word reason>
<TICKER>|<SENTIMENT>|<3-5 word reason>
<TICKER>|<SENTIMENT>|<3-5 word reason>

Rules for MOMENTUM_STOCKS:
- Extract EXACTLY 5 stock tickers explicitly mentioned or directly impacted by the headlines.
- <TICKER> must be the 4-letter BEI code (e.g., BBCA, MEDC, ITMG).
- <SENTIMENT> must be either BULLISH or BEARISH.
- Do not make up tickers if none are implied; use proxy sector leaders if necessary (e.g., if "coal price surges", use ADRO or ITMG).

SECTOR_RISKS:
<SectorName>|<score 0-100>|<3-5 word reason>
<SectorName>|<score 0-100>|<3-5 word reason>
<SectorName>|<score 0-100>|<3-5 word reason>
<SectorName>|<score 0-100>|<3-5 word reason>
<SectorName>|<score 0-100>|<3-5 word reason>

Scoring rules for SECTOR_RISKS:
- <SectorName> must be a standard IDX sector (e.g., Banking, Energy, Consumer, Tech, Mining).
- Score 80-100: Extreme Bullish momentum, massive foreign inflow expected.
- Score 60-79: Moderate Bullish, positive catalysts.
- Score 40-59: Neutral, mixed signals.
- Score 20-39: Bearish pressure, outflow risk.
- Score 0-19: Extreme Bearish, regulatory risk or crashing commodity prices.
- Include EXACTLY 5 sectors based on current news.`

    try {
        const proc = Bun.spawn(['claude', '-p', prompt, '--model', MODEL_NAME], {
            stdout: 'pipe',
            stderr: 'pipe',
        })

        // Kill process if it takes more than 60s
        const timeout = setTimeout(() => proc.kill(), 60000)

        const [content, errText] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])
        const exitCode = await proc.exited
        clearTimeout(timeout)

        if (exitCode !== 0) {
            console.error('Claude CLI stderr:', errText)
            return c.json({ error: `Claude CLI exited ${exitCode}: ${errText.slice(0, 300)}` }, 500)
        }

        return c.json(parseMarketResponse(content.trim(), MODEL_NAME))
    } catch (e: any) {
        if (e?.code === 'ENOENT') {
            return c.json({
                error: 'Claude CLI not found. Ensure `claude` is installed and authenticated (run `claude` once to log in).',
            }, 500)
        }
        return c.json({ error: String(e) }, 500)
    }
})

// ── Parser ────────────────────────────────────────────────────────────────────

function parseMarketResponse(content: string, model: string) {
    const sections: Record<string, string> = {}
    let current = ''
    const buf: string[] = []

    const cleanContent = content.replace(/```[a-z]*\n/gi, '').replace(/```/gi, '')

    for (const line of cleanContent.split('\n')) {
        const t = line.trim()
        if (t === 'SUMMARY:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'SUMMARY'; buf.length = 0
        } else if (t === 'MOMENTUM_STOCKS:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'MOMENTUM_STOCKS'; buf.length = 0
        } else if (t === 'SECTOR_RISKS:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'SECTOR_RISKS'; buf.length = 0
        } else if (current) {
            buf.push(line)
        }
    }
    if (current) sections[current] = buf.join('\n').trim()

    const momentumStocks = (sections['MOMENTUM_STOCKS'] ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|')
            if (parts.length < 3) return null
            return {
                ticker: parts[0].trim().toUpperCase(),
                sentiment: parts[1].trim().toUpperCase(),
                reason: parts[2].trim(),
            }
        })
        .filter(Boolean)

    const sectorRisks = (sections['SECTOR_RISKS'] ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|')
            if (parts.length < 3) return null
            const score = parseInt(parts[1].trim(), 10)
            if (isNaN(score)) return null
            return {
                sector: parts[0].trim(),
                score: Math.min(100, Math.max(0, score)),
                reason: parts[2]?.trim() ?? '',
            }
        })
        .filter(Boolean)

    return {
        summary: sections['SUMMARY'] ?? cleanContent.trim(),
        momentumStocks,
        sectorRisks,
        generatedAt: new Date().toISOString(),
        model,
    }
}

export default router
