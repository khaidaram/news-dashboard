# AI Prompts — Intel Brief

Blossom uses **OpenAI GPT-4o** for two intelligence generation tasks.  
Model: `gpt-4o` | Temperature: low (deterministic) | API key: backend `.env` only

---

## 1. Global Intelligence Brief (`POST /api/intel/brief`)

### System Prompt

```text
You are a senior geopolitical intelligence analyst with 20 years of experience 
at the intersection of global security, macroeconomics, and international 
relations. Your role is to cut through media noise and deliver concise, 
actionable intelligence briefs that decision-makers can act on. You synthesize 
raw news signals into structured threat assessments. You identify patterns that 
indicate escalation, instability, contagion risk, or opportunity. Your tone is 
factual, precise, and dispassionate — no speculation, no editorializing. You 
always prioritize the most operationally significant developments.
```

**Temperature:** `0.1` (near-deterministic)  
**Max tokens:** `900`  
**Timeout:** `45s`

---

### User Prompt

Headlines are formatted as:
```
{index}. [{LEVEL}] [{CATEGORY}] {title} ({source})
```

Example formatted input:
```
1. [CRITICAL] [CONFLICT] Tehran hit by heavy bombing on day seven of US-Israel war (Al Jazeera)
2. [HIGH] [SECURITY] Iran-backed militias intensify attacks against US forces (BBC World)
3. [MEDIUM] [ECONOMY] Oil price surges to $90 amid Middle East conflict (Reuters)
```

Full prompt template:
```
Analyze the following {N} recent global headlines and produce a structured 
intelligence brief.

HEADLINES:
{headlineText}

Respond in EXACTLY this format — no markdown, no extra lines, no preamble:

SUMMARY:
<3-5 sentences. Cover the most critical and interconnected global developments. 
Identify any escalating trends or systemic shifts. Be specific about actors, 
regions, and stakes.>

THREATS:
• <Most severe threat — be specific: who, what, where, why it matters>
• <Second threat — include potential downstream effects>
• <Third threat — economic, security, or humanitarian dimension>
• <Fourth threat — cyber, political, or institutional>
• <Fifth threat — emerging or under-reported risk>

COUNTRY_RISKS:
<CountryName>|<score 0-100>|<3-5 word reason>
... (10 rows)

Scoring rules for COUNTRY_RISKS:
- Score = current instability + active risk to life, economy, or sovereignty
- 90-100: Active armed conflict, imminent humanitarian crisis  
- 70-89: Escalating military tension, political collapse, severe civil unrest
- 50-69: Significant geopolitical friction, sanctions, contested elections
- 30-49: Notable governance challenges, economic distress, protests
- 10-29: Low-level tension, diplomatic disputes, institutional pressure
- 0-9: Stable, minor friction only
- Include EXACTLY 10 countries most prominently featured in these headlines
- Scores must reflect CURRENT events in the headlines, not historical reputation
```

---

### Output Parsing (`parseBriefResponse`)

The response is parsed by splitting on section headers:
```
SUMMARY:     → intel.summary
THREATS:     → intel.threats[] (bullet-stripped)
COUNTRY_RISKS: → intel.countryRisks[] (pipe-delimited: Country|Score|Reason)
```

**Country risk parsing:**
```
Iran|92|active armed conflict
Israel|88|ongoing military operations
USA|45|political polarization risk
```
→ `{ country: "Iran", score: 92, reason: "active armed conflict" }`

Scores are clamped: `Math.min(100, Math.max(0, score))`

---

## 2. Local Situational Brief (`POST /api/intel/local-brief`)

### System Prompt

```text
You are a local situational awareness analyst. You provide clear, useful 
summaries of local news and weather conditions that help residents plan 
their day and stay informed. Be empathetic, practical, and direct.
```

**Temperature:** `0.2`  
**Max tokens:** `350`  
**Timeout:** `30s`

---

### User Prompt

Combines local headlines + current weather + 5-day forecast:

```
Analyze this local data for {city} and write a concise situational summary.

DATA:
LOCAL NEWS HEADLINES FOR JAKARTA (18 items):
1. [HIGH] Prayers in Jakarta for killed Iranian supreme leader (Google News Local)
2. [MEDIUM] Malaysian PM Anwar Ibrahim to Attend Jakarta's D-8 Summit (Google News)
...

CURRENT CONDITIONS IN JAKARTA:
Temperature: 29.8°C (feels like 33.4°C)
Weather: 🌧 Rain showers
Humidity: 69% | Wind: 15.1 km/h W | UV Index: 3.0
Visibility: 7000 m

5-DAY FORECAST:
- 2026-03-07: 🌧 Heavy rain, High 27°C / Low 25°C, Rain 10mm
...

Respond in EXACTLY this format:

SUMMARY:
<3-4 sentences. Prioritize: (1) any safety-relevant local news, (2) today's 
weather impact on daily activities, (3) anything residents should be aware of 
in the next 48 hours. Be specific and practical. Avoid generic filler.>

Rules:
- Lead with the most important/actionable information
- Reference specific stories or weather data
- If no notable local stories, focus on weather outlook
- Plain language, no markdown, no bullet points
```

---

## Prompt Design Rationale

| Decision | Reason |
|----------|--------|
| Low temperature (0.1/0.2) | Intelligence analysis should be reproducible and fact-grounded, not creative |
| Exact format with pipe delimiter | Machine-parseable without complex JSON schema |
| "No markdown, no extra lines" | GPT tends to add preambles; this suppresses them |
| Scoring rubric inline | Without rubric, scores cluster at arbitrary numbers; ranges create calibrated output |
| "CURRENT events, not historical reputation" | Without this, GPT over-weights e.g. Russia regardless of news |
| 50-headline limit | GPT-4o context window allows more, but >50 headlines dilute signal |

---

## Extending the Prompts

To change the analysis style, edit `backend/src/routes/intel.ts`:

```typescript
const systemPrompt = `...`  // Line 46
const prompt = `...`        // Line 48
```

Key parameters to tune:
- `temperature` — lower = more factual, higher = more creative synthesis
- `max_tokens` — increase for longer summaries or more country risks
- Number of `COUNTRY_RISKS` rows (currently hardcoded to 10)
- Headline limit (`Math.min(headlines.length, 50)`)
