import { Hono } from 'hono'

const router = new Hono()

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o'

// Read API key from environment — set OPENAI_API_KEY in backend/.env
function getApiKey(): string {
    return process.env.OPENAI_API_KEY ?? ''
}

interface NewsItem {
    title: string
    level: string
    source: string
    category?: string
    publishedAt?: string
}

// ── Global Intelligence Brief ──────────────────────────────────────────────

router.post('/brief', async (c) => {
    const body = await c.req.json<{ headlines: NewsItem[] }>()
    const { headlines } = body
    const apiKey = getApiKey()

    if (!apiKey) {
        return c.json({
            summary: 'No OPENAI_API_KEY set. Add it to blossom/backend/.env to enable AI briefings.',
            threats: [],
            countryRisks: [],
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

    const systemPrompt = `You are a senior geopolitical intelligence analyst with 20 years of experience at the intersection of global security, macroeconomics, and international relations. Your role is to cut through media noise and deliver concise, actionable intelligence briefs that decision-makers can act on. You synthesize raw news signals into structured threat assessments. You identify patterns that indicate escalation, instability, contagion risk, or opportunity. Your tone is factual, precise, and dispassionate — no speculation, no editorializing. You always prioritize the most operationally significant developments.`

    const prompt = `Analyze the following ${limit} recent global headlines and produce a structured intelligence brief.

HEADLINES:
${headlineText}

Respond in EXACTLY this format — no markdown, no extra lines, no preamble:

SUMMARY:
<3-5 sentences. Cover the most critical and interconnected global developments. Identify any escalating trends or systemic shifts. Be specific about actors, regions, and stakes.>

THREATS:
• <Most severe threat — be specific: who, what, where, why it matters>
• <Second threat — include potential downstream effects>
• <Third threat — economic, security, or humanitarian dimension>
• <Fourth threat — cyber, political, or institutional>
• <Fifth threat — emerging or under-reported risk>

COUNTRY_RISKS:
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>
<CountryName>|<score 0-100>|<3-5 word reason>

Scoring rules for COUNTRY_RISKS:
- Score = current instability + active risk to life, economy, or sovereignty
- 90-100: Active armed conflict, imminent humanitarian crisis  
- 70-89: Escalating military tension, political collapse, severe civil unrest
- 50-69: Significant geopolitical friction, sanctions, contested elections
- 30-49: Notable governance challenges, economic distress, protests
- 10-29: Low-level tension, diplomatic disputes, institutional pressure
- 0-9: Stable, minor friction only
- Include EXACTLY 10 countries most prominently featured in these headlines
- Scores must reflect CURRENT events in the headlines, not historical reputation`

    try {
        const res = await fetch(OPENAI_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.1,
                max_tokens: 900,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
            }),
            signal: AbortSignal.timeout(45000),
        })

        if (!res.ok) {
            const err = await res.text()
            return c.json({ error: `OpenAI ${res.status}: ${err.slice(0, 200)}` }, 500)
        }

        const data: { choices: Array<{ message: { content: string } }>; model: string } = await res.json()
        const content = data.choices[0]?.message?.content ?? ''
        return c.json(parseBriefResponse(content, data.model))
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

// ── Local Brief ─────────────────────────────────────────────────────────────

router.post('/local-brief', async (c) => {
    const body = await c.req.json<{
        headlines: NewsItem[]
        weather: { conditions: Record<string, unknown>; forecast: Record<string, unknown>[] } | null
        city: string
    }>()
    const { headlines, weather, city } = body
    const apiKey = getApiKey()

    if (!apiKey) {
        return c.json({
            summary: `No OPENAI_API_KEY set. Add it to blossom/backend/.env to enable local briefings.`,
            generatedAt: new Date().toISOString(),
            model: 'none',
        })
    }

    const lines: string[] = []

    if (headlines.length) {
        lines.push(`LOCAL NEWS HEADLINES FOR ${city.toUpperCase()} (${headlines.length} items):`)
        headlines.slice(0, 20).forEach((h, i) => {
            lines.push(`${i + 1}. [${h.level}] ${h.title} (${h.source})`)
        })
    }

    if (weather?.conditions) {
        const w = weather.conditions
        lines.push(`\nCURRENT CONDITIONS IN ${city.toUpperCase()}:`)
        lines.push(`Temperature: ${w.tempC}°C (feels like ${w.feelsLikeC}°C)`)
        lines.push(`Weather: ${w.icon} ${w.description}`)
        lines.push(`Humidity: ${w.humidity}% | Wind: ${w.windSpeedKmh} km/h ${w.windDirection} | UV Index: ${w.uvIndex}`)
        lines.push(`Visibility: ${w.visibility} m`)
    }

    if (weather?.forecast?.length) {
        lines.push(`\n5-DAY FORECAST:`)
        weather.forecast.slice(0, 5).forEach((f) => {
            lines.push(`- ${f.date}: ${f.icon} ${f.desc}, High ${f.maxTempC}°C / Low ${f.minTempC}°C, Rain ${f.rainMM}mm`)
        })
    }

    const systemPrompt = `You are a local situational awareness analyst. You provide clear, useful summaries of local news and weather conditions that help residents plan their day and stay informed. Be empathetic, practical, and direct.`

    const prompt = `Analyze this local data for ${city} and write a concise situational summary.

DATA:
${lines.join('\n')}

Respond in EXACTLY this format:

SUMMARY:
<3-4 sentences. Prioritize: (1) any safety-relevant local news, (2) today's weather impact on daily activities, (3) anything residents should be aware of in the next 48 hours. Be specific and practical — e.g., "Carry an umbrella today, heavy rain expected by afternoon." Avoid generic filler.>

Rules:
- Lead with the most important/actionable information
- Reference specific stories or weather data, don't speak in vague generalities
- If there are no notable local stories, focus on weather outlook and general conditions
- Plain language, no markdown, no bullet points in the summary`

    try {
        const res = await fetch(OPENAI_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.2,
                max_tokens: 350,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
            }),
            signal: AbortSignal.timeout(30000),
        })

        if (!res.ok) return c.json({ error: `OpenAI ${res.status}` }, 500)
        const data: { choices: Array<{ message: { content: string } }>; model: string } = await res.json()
        const content = data.choices[0]?.message?.content ?? ''
        const match = content.match(/SUMMARY:\s*([\s\S]+)/i)
        const summary = match ? match[1].trim() : content.trim()
        return c.json({ summary, generatedAt: new Date().toISOString(), model: data.model })
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

// ── Parser ──────────────────────────────────────────────────────────────────

function parseBriefResponse(content: string, model: string) {
    const sections: Record<string, string> = {}
    let current = ''
    const buf: string[] = []

    for (const line of content.split('\n')) {
        const t = line.trim()
        if (t === 'SUMMARY:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'SUMMARY'; buf.length = 0
        } else if (t === 'THREATS:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'THREATS'; buf.length = 0
        } else if (t === 'COUNTRY_RISKS:') {
            if (current) sections[current] = buf.join('\n').trim()
            current = 'COUNTRY_RISKS'; buf.length = 0
        } else if (current) buf.push(line)
    }
    if (current) sections[current] = buf.join('\n').trim()

    const threats = (sections['THREATS'] ?? '')
        .split('\n')
        .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)

    const countryRisks = (sections['COUNTRY_RISKS'] ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|')
            if (parts.length < 2) return null
            const score = parseInt(parts[1].trim(), 10)
            if (isNaN(score)) return null
            return {
                country: parts[0].trim(),
                score: Math.min(100, Math.max(0, score)),
                reason: parts[2]?.trim() ?? '',
            }
        })
        .filter(Boolean)

    return {
        summary: sections['SUMMARY'] ?? content.trim(),
        threats,
        countryRisks,
        generatedAt: new Date().toISOString(),
        model,
    }
}

export default router
