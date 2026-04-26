// IHSG & Makro Indonesia threat classifier
// Dipakai untuk berita berbahasa Indonesia: Kontan, Bisnis.com, CNBC Indonesia, Antara, CNN Indonesia
// Level = dampak market IHSG, menggunakan ThreatLevel standar agar kompatibel dengan frontend

import type { ThreatLevel } from './threatClassifier.ts'

interface KeywordTier {
  level: ThreatLevel
  category: string
  words: string[]
}

const localKeywords: KeywordTier[] = [

  // ── CRITICAL — Panic / circuit-breaker level ──────────────────────────────
  // Threshold: emiten besar kolaps, krisis sistemik, fraud skala besar
  {
    level: 'CRITICAL',
    category: 'corporate_crisis',
    words: [
      'gagal bayar', 'pkpu', 'pailit', 'bangkrut', 'likuidasi',
      'suspend perdagangan', 'suspensi bei', 'delisting paksa',
      'force majeure', 'batal melantai',
      'fraud', 'manipulasi laporan keuangan', 'audit disclaimer',
      'digeledah kpk', 'tersangka korupsi', 'ditangkap kpk',
    ],
  },
  {
    level: 'CRITICAL',
    category: 'macro_crisis',
    words: [
      'krisis perbankan', 'bank rush', 'bank indonesia intervensi darurat',
      'rupiah jebol', 'rupiah ambruk', 'krisis 1998', 'krisis moneter',
      'pasar saham ditutup', 'ihsg dihentikan', 'trading halt bei',
    ],
  },

  // ── HIGH — Katalis kuat, ekspektasi >1% move IHSG ─────────────────────────
  {
    level: 'HIGH',
    category: 'bi_policy',
    words: [
      'bi rate', 'bi7drr', 'suku bunga acuan', 'rdk bi', 'rapat bi',
      'bank indonesia naikkan', 'bank indonesia turunkan', 'bank indonesia pertahankan',
      'bi pangkas', 'bi naikan', 'dovish bi', 'hawkish bi',
    ],
  },
  {
    level: 'HIGH',
    category: 'foreign_flow',
    words: [
      'net buy asing', 'net sell asing', 'akumulasi asing', 'distribusi asing',
      'asing borong', 'asing kabur', 'asing keluar', 'capital outflow',
      'capital inflow', 'foreign inflow', 'foreign outflow',
      'jual bersih asing', 'beli bersih asing',
    ],
  },
  {
    level: 'HIGH',
    category: 'commodity_shock',
    words: [
      'batubara meroket', 'batubara melonjak', 'batubara anjlok', 'batubara ambruk',
      'harga nikel melonjak', 'harga nikel anjlok', 'nikel merosot',
      'cpo meroket', 'cpo melonjak', 'cpo anjlok', 'harga sawit melonjak',
      'harga emas melonjak', 'emas meroket', 'emas rekor',
      'minyak mentah melonjak', 'minyak mentah anjlok', 'harga minyak melonjak',
      'tembaga melonjak', 'timah melonjak',
    ],
  },
  {
    level: 'HIGH',
    category: 'rupiah_shock',
    words: [
      'rupiah tembus', 'rupiah melemah tajam', 'rupiah menguat tajam',
      'rupiah terpuruk', 'rupiah menguat signifikan',
      'kurs dolar melonjak', 'dolar menembus',
    ],
  },
  {
    level: 'HIGH',
    category: 'corporate_catalyst',
    words: [
      'dividen jumbo', 'yield dividen tinggi', 'laba bersih meroket',
      'laba bersih melonjak', 'rekor laba', 'laba tertinggi',
      'tender offer', 'buyback saham', 'akuisisi', 'merger',
      'kontrak triliunan', 'menang tender', 'proyek strategis nasional',
      'rugi bersih membengkak', 'rugi besar', 'merugi masif',
    ],
  },
  {
    level: 'HIGH',
    category: 'policy_catalyst',
    words: [
      'ojk cabut izin', 'ojk bekukan', 'ojk sanksi',
      'subsidi dicabut', 'ekspor dilarang', 'larangan ekspor',
      'kebijakan fiskal', 'paket stimulus', 'insentif pajak',
      'hilirisasi', 'relaksasi aturan', 'deregulasi',
    ],
  },

  // ── MEDIUM — Dampak moderat, pergerakan 0.5–1% ───────────────────────────
  {
    level: 'MEDIUM',
    category: 'earnings',
    words: [
      'laba bersih', 'rugi bersih', 'pendapatan bersih', 'kinerja keuangan',
      'laba naik', 'laba turun', 'laba tumbuh', 'laba menyusut',
      'margin naik', 'margin turun', 'kinerja semester', 'kinerja tahunan',
      'kinerja kuartal', 'kuartal i', 'kuartal ii', 'kuartal iii', 'kuartal iv',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'commodity_move',
    words: [
      'harga batubara', 'harga nikel', 'harga cpo', 'harga emas',
      'harga minyak', 'harga tembaga', 'harga timah', 'harga aluminium',
      'harga komoditas', 'benchmark batubara', 'hba batubara',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'rupiah_move',
    words: [
      'rupiah melemah', 'rupiah menguat', 'nilai tukar', 'kurs rupiah',
      'rupiah terdepresiasi', 'rupiah terapresiasi',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'macro_data',
    words: [
      'inflasi', 'deflasi', 'pmi manufaktur', 'neraca dagang',
      'ekspor naik', 'ekspor turun', 'impor naik', 'impor turun',
      'cadangan devisa', 'pertumbuhan ekonomi', 'pdb indonesia',
      'kemiskinan turun', 'pengangguran',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'analyst_call',
    words: [
      'rekomendasi beli', 'rekomendasi jual', 'overweight', 'underweight',
      'target harga', 'upgrade saham', 'downgrade saham', 'initiating coverage',
      'analyst recommend', 'analis merekomendasikan',
    ],
  },
  {
    level: 'MEDIUM',
    category: 'corporate_event',
    words: [
      'right issue', 'private placement', 'stock split', 'reverse split',
      'penerbitan obligasi', 'obligasi korporasi', 'penawaran umum',
      'ipo', 'melantai di bei', 'listing bei',
    ],
  },

  // ── LOW — Aksi korporasi rutin, tidak signifikan secara pasar ─────────────
  {
    level: 'LOW',
    category: 'corporate_action',
    words: [
      'rups', 'rupslb', 'laporan keuangan', 'jadwal dividen', 'cum dividen',
      'ex dividen', 'pembayaran dividen', 'pergantian direksi', 'direksi baru',
      'komisaris baru', 'susunan direksi', 'pabrik baru', 'ekspansi kapasitas',
      'groundbreaking', 'peresmian', 'kontrak baru', 'mou', 'perjanjian kerjasama',
    ],
  },
  {
    level: 'LOW',
    category: 'general_outlook',
    words: [
      'prospek', 'outlook', 'proyeksi', 'prediksi', 'target', 'rencana bisnis',
      'strategi', 'roadmap', 'guidance',
    ],
  },
]

export function classifyLocalThreat(title: string): { level: ThreatLevel; category: string } {
  const lower = title.toLowerCase()
  for (const tier of localKeywords) {
    for (const kw of tier.words) {
      if (lower.includes(kw)) {
        return { level: tier.level, category: tier.category }
      }
    }
  }
  return { level: 'INFO', category: 'general' }
}
