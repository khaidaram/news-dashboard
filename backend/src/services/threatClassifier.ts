// Global financial market threat classifier
// Dipakai untuk berita berbahasa Inggris: Reuters, Yahoo Finance, Nikkei Asia, CNBC
// Level = dampak pasar, bukan severity fisik

export type ThreatLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

interface KeywordTier {
  level: ThreatLevel
  category: string
  words: string[]
}

const threatKeywords: KeywordTier[] = [

  // ── CRITICAL — Systemic / market-halting events ─────────────────────────
  // Threshold: potensi circuit breaker, bank run, EM capital flight masif
  {
    level: 'CRITICAL',
    category: 'systemic_risk',
    words: [
      'bank run', 'bank collapse', 'bank failure', 'banking crisis',
      'emergency rate', 'emergency meeting', 'emergency cut',
      'circuit breaker', 'trading halted', 'trading suspended', 'market closed',
      'financial contagion', 'systemic risk', 'too big to fail',
      'sovereign default', 'debt default', 'currency collapse', 'currency crisis',
      'imf bailout', 'bank bailout', 'financial crisis',
    ],
  },
  {
    level: 'CRITICAL',
    category: 'geopolitical_shock',
    words: [
      'nuclear', 'missile strike', 'war declared', 'attack', 'invasion', 'airstrike', 'martial law', 'mass casualty', 'assassination', 'crisis'
    ],
  },

  // ── HIGH — Strong market catalyst (expect >1% IHSG move) ─────────────────
  // Fed, China, EM flows, commodity shock, recession signal

  {
    level: 'HIGH',
    category: 'fed_policy',
    words: [
      'rate hike', 'rate cut', 'fed hikes', 'fed cuts', 'fomc',
      'fed raises', 'fed lowers', 'basis points', 'quantitative tightening',
      'quantitative easing', 'tapering', 'balance sheet',
    ],
  },
  {
    level: 'HIGH',
    category: 'china_macro',
    words: [
      'china gdp', 'china pmi', 'china slowdown', 'china stimulus',
      'china property', 'evergrande', 'developer default', 'property crisis',
      'china exports', 'china trade', 'china economy contracts',
      'china growth misses', 'china deflation',
    ],
  },
  {
    level: 'HIGH',
    category: 'recession_signal',
    words: [
      'recession', 'economic contraction', 'gdp contracts', 'gdp shrinks',
      'negative growth', 'stagflation', 'hard landing',
    ],
  },
  {
    level: 'HIGH',
    category: 'em_capital_flow',
    words: [
      'capital flight', 'capital outflow', 'emerging market selloff',
      'em selloff', 'risk-off', 'risk off', 'dollar surges', 'dollar index',
      'emerging markets rout', 'foreign sell', 'hot money',
    ],
  },
  {
    level: 'HIGH',
    category: 'commodity_shock',
    words: [
      'oil shock', 'opec cut', 'opec+', 'oil embargo',
      'coal surges', 'coal price soars', 'nickel surges', 'nickel squeeze',
      'commodity shock', 'commodity surge', 'cpo surges', 'palm oil ban',
      'supply disruption', 'energy crisis',
    ],
  },
  {
    level: 'HIGH',
    category: 'trade_war',
    words: [
      'tariff', 'trade war', 'trade sanctions', 'export ban', 'import ban',
      'trade restrictions', 'decoupling', 'supply chain crisis',
    ],
  },
  {
    level: 'HIGH',
    category: 'inflation_macro',
    words: [
      'inflation surge', 'inflation soars', 'inflation hits', 'inflation jumps',
      'inflation record', 'cpi surges', 'cpi spikes', 'hyperinflation',
      'stagflation warning',
    ],
  },

  // ── MEDIUM — Noticeable market impact (0.5–1% range) ─────────────────────
  // Data ekonomi rutin, earnings, pergerakan komoditas moderat

  {
    level: 'MEDIUM',
    category: 'economic_data',
    words: [
      'cpi', 'ppi', 'pce', 'nfp', 'jobs report', 'unemployment',
      'payrolls', 'retail sales', 'pmi', 'gdp growth', 'trade deficit',
      'trade surplus', 'current account', 'fiscal deficit',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'fed_signal',
    words: [
      'fed minutes', 'hawkish', 'dovish', 'fed chair', 'powell says',
      'rate expectations', 'rate path', 'fed pivot', 'pause rate hike',
      'ecb', 'boj', 'boe policy',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'commodity_move',
    words: [
      'oil prices', 'crude oil', 'brent', 'wti', 'coal price',
      'nickel price', 'copper price', 'gold price', 'palm oil',
      'commodity prices', 'iron ore', 'aluminum price', 'tin price',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'earnings',
    words: [
      'earnings beat', 'earnings miss', 'profit warning', 'profit soars',
      'revenue misses', 'guidance cut', 'guidance raised', 'net income',
      'quarterly results', 'annual results',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'geopolitical_risk',
    words: [
      'sanctions', 'ceasefire', 'escalation', 'conflict', 'protest',
      'election', 'political crisis', 'impeachment', 'government collapse',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'market_event',
    words: [
      'ipo', 'acquisition', 'merger', 'buyback', 'downgrade', 'upgrade',
      'credit downgrade', 'credit rating', 'debt ceiling',
    ],
  },

  // ── LOW — Minor context, informational signal ─────────────────────────────
  {
    level: 'LOW',
    category: 'macro_outlook',
    words: [
      'forecast', 'outlook', 'imf warns', 'world bank', 'oecd',
      'economic growth', 'growth forecast', 'gdp forecast',
    ],
  },
  {
    level: 'LOW',
    category: 'corporate_routine',
    words: [
      'annual meeting', 'agm', 'dividend', 'share buyback', 'ipo priced',
      'bond issuance', 'debt offering', 'rights issue',
    ],
  },
  {
    level: 'LOW',
    category: 'general_policy',
    words: [
      'policy', 'reform', 'budget', 'statement', 'meeting', 'conference',
      'regulation', 'guideline', 'framework',
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
