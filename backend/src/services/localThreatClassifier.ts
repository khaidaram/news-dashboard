// Sentiment & Threat Level Classification for IHSG and Global Macro

export type LocalThreatLevel = 'STRONG_BULL' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEAR' | 'CRITICAL_RISK'

interface KeywordTier {
  level: LocalThreatLevel
  category: string
  words: string[]
}

const threatlocalKeywords: KeywordTier[] = [
  // ── 1. GLOBAL & MACRO BLACK SWANS (Risk-Off Triggers) ──────────────────
  {
    level: 'CRITICAL_RISK',
    category: 'macro_disaster',
    words: [
      'nuclear', 'missile strike', 'war declared', 'invasion', 'airstrike',
      'coup', 'assassination', 'mass casualty', 'martial law',
      'pandemic', 'global crash', 'market crash', 'depression', 'default',
    ],
  },

  // ── 2. EXTREME BEARISH (Panic Selling Catalysts) ─────────────────────────
  {
    level: 'STRONG_BEAR',
    category: 'corporate_distress',
    words: [
      'gagal bayar', 'pkpu', 'pailit', 'bangkrut', 'suspend', 'delisting',
      'rugi bersih', 'anjlok', 'terperosok', 'fraud', 'korupsi', 'ditangkap',
      'digeledah', 'skandal', 'force majeure', 'batal akuisisi', 'denda triliunan',
    ],
  },
  {
    level: 'STRONG_BEAR',
    category: 'macro_headwinds',
    words: [
      'resesi', 'inflasi melonjak', 'rupiah ambruk', 'rupiah tembus',
      'suku bunga naik tajam', 'capital outflow', 'asing kabur',
      'harga batubara anjlok', 'harga minyak jatuh', 'cpo merosot',
    ],
  },

  // ── 3. EXTREME BULLISH (FOMO & Smart Money Catalysts) ────────────────────
  {
    level: 'STRONG_BULL',
    category: 'corporate_action',
    words: [
      'dividen jumbo', 'yield dividen', 'laba bersih meroket', 'laba bersih melonjak',
      'rekor laba', 'akuisisi', 'merger', 'tender offer', 'buyback',
      'kontrak baru triliunan', 'menang tender', 'akumulasi asing', 'net buy asing',
    ],
  },
  {
    level: 'STRONG_BULL',
    category: 'macro_tailwinds',
    words: [
      'bi rate turun', 'suku bunga dipangkas', 'rupiah menguat tajam',
      'harga batubara meroket', 'harga batubara rekor', 'harga minyak melonjak',
      'capital inflow', 'asing borong', 'stimulus',
    ],
  },

  // ── 4. BEARISH (Negative Sentiment) ──────────────────────────────────────
  {
    level: 'BEARISH',
    category: 'market_correction',
    words: [
      'koreksi', 'melemah', 'turun', 'tertekan', 'profit taking',
      'laba menyusut', 'laba turun', 'kinerja mengecewakan', 'revisi target',
      'pajak naik', 'subsidi dicabut', 'ekspor dilarang', 'demo buruh',
    ],
  },
  {
    level: 'BEARISH',
    category: 'global_tension',
    words: [
      'sanctions', 'sanksi', 'ketegangan', 'konflik', 'tariffs', 'perang dagang',
      'geopolitik', 'protes', 'pemogokan',
    ],
  },

  // ── 5. BULLISH (Positive Sentiment) ──────────────────────────────────────
  {
    level: 'BULLISH',
    category: 'market_growth',
    words: [
      'menguat', 'rebound', 'naik', 'tumbuh', 'ekspansi', 'pabrik baru',
      'target harga', 'overweight', 'rekomendasi beli', 'prospek cerah',
      'kinerja positif', 'penjualan naik', 'cadangan devisa naik',
    ],
  },

  // ── 6. NEUTRAL / INFO (Noise) ────────────────────────────────────────────
  {
    level: 'NEUTRAL',
    category: 'general_business',
    words: [
      'rups', 'rupslb', 'laporan keuangan', 'kinerja kuartal', 'pergantian direksi',
      'rencana bisnis', 'outlook', 'prediksi', 'analisis', 'jadwal dividen',
      'right issue', 'private placement',
    ],
  },
]

export function classifyLocalThreat(title: string): { level: LocalThreatLevel; category: string } {
  const lower = title.toLowerCase()
  for (const tier of threatlocalKeywords) {
    for (const kw of tier.words) {
      if (lower.includes(kw)) {
        return { level: tier.level, category: tier.category }
      }
    }
  }
  // Default fallback if no keywords match
  return { level: 'NEUTRAL', category: 'general' }
}