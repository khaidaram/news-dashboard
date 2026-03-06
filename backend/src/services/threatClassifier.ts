// Threat Level Classification (ported from watchtower)

export type ThreatLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

interface KeywordTier {
  level: ThreatLevel
  category: string
  words: string[]
}

const threatKeywords: KeywordTier[] = [
  {
    level: 'CRITICAL',
    category: 'conflict',
    words: [
      'nuclear', 'missile strike', 'war declared', 'invasion', 'airstrike kills',
      'coup', 'assassination', 'mass casualty', 'chemical weapon', 'dirty bomb',
      'martial law', 'genocide',
    ],
  },
  {
    level: 'HIGH',
    category: 'security',
    words: [
      'attack', 'bombing', 'explosion', 'shooting', 'killed', 'hostage',
      'terrorist', 'conflict', 'offensive', 'troops deployed', 'sanctions',
      'ceasefire', 'escalation', 'warship', 'military exercises',
    ],
  },
  {
    level: 'HIGH',
    category: 'disaster',
    words: [
      'earthquake', 'tsunami', 'hurricane', 'typhoon', 'flood kills',
      'wildfire', 'eruption', 'catastrophic',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'politics',
    words: [
      'election', 'protest', 'crisis', 'emergency', 'shutdown',
      'impeachment', 'indicted', 'arrested', 'detained', 'expelled',
      'diplomatic', 'summit', 'agreement',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'economy',
    words: [
      'recession', 'crash', 'collapse', 'default', 'bankrupt',
      'inflation', 'unemployment spike', 'rate hike', 'supply chain',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'cyber',
    words: [
      'hack', 'breach', 'ransomware', 'cyberattack', 'data leak',
      'malware', 'phishing campaign', 'zero-day',
    ],
  },
  {
    level: 'LOW',
    category: 'general',
    words: [
      'trade deal', 'policy', 'reform', 'budget', 'statement',
      'meeting', 'conference', 'report',
    ],
  },
]

export function classifyThreat(title: string): { level: ThreatLevel; category: string } {
  const lower = title.toLowerCase()
  for (const tier of threatKeywords) {
    for (const kw of tier.words) {
      if (lower.includes(kw)) {
        return { level: tier.level, category: tier.category }
      }
    }
  }
  return { level: 'INFO', category: 'general' }
}
