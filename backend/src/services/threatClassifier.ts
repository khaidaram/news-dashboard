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
      'coup', 'assassination', 'mass casualty', 'martial law', 'genocide',
    ],
  },
  {
    level: 'CRITICAL',
    category: 'corporate_distress', // Tambahan khusus emiten lokal
    words: [
      'gagal bayar', 'pkpu', 'pailit', 'bangkrut', 'suspend', 'delisting',
      'skandal korupsi', 'force majeure', 'fraud', 'market crash', 'bursa anjlok'
    ],
  },

  {
    level: 'HIGH',
    category: 'market_catalyst', // Katalis kuat saham lokal
    words: [
      'dividen jumbo', 'laba bersih meroket', 'rekor laba', 'akuisisi', 
      'tender offer', 'akumulasi asing', 'net buy asing', 'rugi bersih', 
      'suku bunga dipangkas', 'bi rate turun', 'capital outflow', 'resesi'
    ],
  },
  {
    level: 'HIGH',
    category: 'security_disaster',
    words: [
      'attack', 'bombing', 'explosion', 'shooting', 'terrorist', 'sanctions',
      'ceasefire', 'escalation', 'earthquake', 'tsunami', 'catastrophic',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'economy_momentum',
    words: [
      'recession', 'collapse', 'default', 'inflation', 'rate hike',
      'rupiah melemah', 'rupiah menguat', 'koreksi', 'profit taking', 
      'rekomendasi beli', 'overweight', 'harga batubara', 'harga minyak', 
      'cpo', 'laba menyusut', 'kinerja positif'
    ],
  },
  {
    level: 'MEDIUM',
    category: 'politics_cyber',
    words: [
      'election', 'protest', 'crisis', 'emergency', 'impeachment', 
      'hack', 'breach', 'ransomware', 'cyberattack', 'data leak',
    ],
  },
  {
    level: 'LOW',
    category: 'corporate_action',
    words: [
      'rups', 'rupslb', 'laporan keuangan', 'kinerja kuartal', 'right issue', 
      'private placement', 'ekspansi', 'pabrik baru', 'pergantian direksi',
      'jadwal dividen', 'target harga'
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
