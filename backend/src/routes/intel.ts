import { Hono } from 'hono'

const router = new Hono()

// Gunakan gemini-2.0-flash (Model terbaru dan paling stabil untuk Free Tier)
// Jika masih error, opsi cadangan adalah: gemini-1.5-flash-002 atau gemini-pro
const MODEL_NAME = 'gemini-2.0-flash' 
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`

// Read API key from environment — set GEMINI_API_KEY in backend/.env
function getApiKey(): string {
    return process.env.GEMINI_API_KEY ?? ''
}

interface NewsItem {
    title: string
    level: string
    source: string
    category?: string
    publishedAt?: string
}

// ── IHSG Market Intelligence Brief ──────────────────────────────────────────────

router.post('/brief', async (c) => {
    const body = await c.req.json<{ headlines: NewsItem[] }>()
    const { headlines } = body
    const apiKey = getApiKey()

    if (!apiKey) {
        return c.json({
            summary: 'No GEMINI_API_KEY set. Add it to blossom/backend/.env to enable AI briefings.',
            momentumStocks: [],
            sectorRisks: [],
            generatedAt: new Date().toISOString(),
            model: 'none',
        })
    }

    if (!headlines?.length) return c.json({ error: 'No headlines provided' }, 400)

    const limit = Math.min(headlines.length, 50)
    const headlineText = headlines
        .slice(0, limit)
        .map((h, i) => `${i + 1}. [${h.level}] [${h.category ?? 'general'}] ${h.title} (${h.source})`)
        .join('\n')

    const systemPrompt = `You are a Senior Indonesian Equity Analyst and Momentum Trader. Your expertise is analyzing financial news, macroeconomic data, and corporate actions to identify immediate price movers in the Indonesian Stock Exchange (IHSG). You must extract specific stock tickers affected by the news and classify their sentiment (BULLISH/BEARISH). Be factual, concise, and focused on momentum and Smart Money flow.`

    const promptText = `Analyze the following ${limit} recent headlines concerning the Indonesian economy and IHSG.

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
- Do not make up tickers if none are implied; use proxy sectors leaders if necessary (e.g., if "coal price surges", use ADRO or ITMG).

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
        const url = `${GEMINI_ENDPOINT}?key=${apiKey}`
        
        // Payload disesuaikan penuh dengan standar Google API v1beta / v1
        const payload = {
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                role: "user",
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                temperature: 0.1, // Presisi tinggi
                maxOutputTokens: 800,
            }
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(45000), // Timeout aman untuk Free Tier
        })

        if (!res.ok) {
            const err = await res.text()
            console.error('Gemini API Error details:', err)
            // Mengembalikan pesan error yang rapi agar Anda bisa melihatnya di Terminal UI
            return c.json({ error: `Gemini ${res.status}: ${JSON.parse(err).error.message || 'Unknown API Error'}` }, 500)
        }

        const data: any = await res.json()
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        
        return c.json(parseMarketResponse(content, MODEL_NAME))
    } catch (e) {
        console.error('Fetch exception:', e)
        return c.json({ error: String(e) }, 500)
    }
})

// ── Parser Khusus IHSG ──────────────────────────────────────────────────────

function parseMarketResponse(content: string, model: string) {
    const sections: Record<string, string> = {}
    let current = ''
    const buf: string[] = []

    // Sanitasi output dari markdown dan whitespace berlebih
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
                reason: parts[2].trim()
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