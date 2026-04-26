import { Brain, TrendingUp, TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react'
import type { IntelBrief, NewsItem } from '../types.ts'

function scoreColor(score: number): string {
    if (score >= 75) return 'var(--bb-up)'
    if (score >= 60) return 'var(--bb-cyan)'
    if (score >= 40) return 'var(--bb-yellow)'
    if (score >= 20) return 'var(--bb-orange)'
    return 'var(--bb-down)'
}

function IntelResult({ intel, globalNews, localNews, onFetchIntel }: {
    intel: IntelBrief
    globalNews: NewsItem[]
    localNews: NewsItem[]
    onFetchIntel: (g: NewsItem[], l: NewsItem[]) => void
}) {
    return (
        <>
            <div className="intel-summary">{intel.summary}</div>

            {intel.momentumStocks.length > 0 && (
                <>
                    <div className="intel-section-label">MOMENTUM STOCKS — BEI TICKERS ({intel.momentumStocks.length})</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 1fr', gap: 8, padding: '2px 12px', background: 'var(--bb-bg3)', borderBottom: '1px solid var(--bb-border2)' }}>
                        {['TICKER', 'SENTIMENT', 'REASON'].map((h) => (
                            <span key={h} style={{ fontSize: 9, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
                        ))}
                    </div>
                    <div className="intel-threats">
                        {intel.momentumStocks.map((s, i) => (
                            <div key={i} className="intel-threat" style={{ animationDelay: `${i * 30}ms`, display: 'grid', gridTemplateColumns: '60px 80px 1fr', gap: 8, padding: '4px 12px' }}>
                                <span style={{ fontWeight: 700, color: 'var(--bb-orange)', letterSpacing: '0.05em' }}>{s.ticker}</span>
                                <span style={{ color: s.sentiment === 'BULLISH' ? 'var(--bb-up)' : 'var(--bb-down)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                                    {s.sentiment === 'BULLISH' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                    {s.sentiment}
                                </span>
                                <span style={{ color: 'var(--bb-gray2)', fontSize: 10 }}>{s.reason}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {intel.sectorRisks.length > 0 && (
                <>
                    <div className="intel-section-label">SECTOR MOMENTUM SCORES — IDX (0–100)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 44px 1fr', gap: 8, padding: '2px 12px', background: 'var(--bb-bg3)', borderBottom: '1px solid var(--bb-border2)' }}>
                        {['SECTOR', 'SCORE BAR', 'SCORE', 'DRIVER'].map((h) => (
                            <span key={h} style={{ fontSize: 9, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
                        ))}
                    </div>
                    <div className="intel-country-risks">
                        {intel.sectorRisks.map((r, i) => (
                            <div key={i} className="risk-row" style={{ animationDelay: `${i * 40}ms` }}>
                                <span className="risk-country">{r.sector.toUpperCase()}</span>
                                <div className="risk-bar-bg">
                                    <div className="risk-bar-fill" style={{ width: `${r.score}%`, background: scoreColor(r.score), transitionDelay: `${i * 40}ms` }} />
                                </div>
                                <span className="risk-score" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                                <span className="risk-reason">{r.reason}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="intel-footer">
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Brain size={9} />
                    MODEL: {intel.model.toUpperCase()}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        className="btn btn-outline"
                        style={{ fontSize: 9, padding: '2px 10px' }}
                        onClick={() => onFetchIntel(globalNews, localNews)}
                        disabled={!globalNews.length}
                    >
                        <RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />
                        REFRESH
                    </button>
                    <span>{new Date(intel.generatedAt).toLocaleTimeString('en', { hour12: false })}</span>
                </div>
            </div>
        </>
    )
}

interface Props {
    intel: IntelBrief | null
    loading: boolean
    error: string | null
    globalNews: NewsItem[]
    localNews: NewsItem[]
    onFetchIntel: (globalHeadlines: NewsItem[], localHeadlines: NewsItem[]) => void
    enabled: boolean
}

export function IntelPanel({ intel, loading, error, globalNews, localNews, onFetchIntel, enabled }: Props) {
    return (
        <div className="panel-body">
            {/* Disabled state: tampilkan banner + tombol generate sekali */}
            {!enabled && !intel && !loading && (
                <div className="intel-nokey">
                    <div className="intel-nokey-title">
                        <Brain size={12} />
                        INTEL BRIEF — DISABLED
                    </div>
                    <div className="intel-nokey-body">
                        Dinonaktifkan untuk menghemat token Claude.<br />
                        Aktifkan via <strong>CFG → Enable Intel Brief</strong> untuk auto-generate saat load.<br /><br />
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: 9 }}
                            onClick={() => onFetchIntel(globalNews, localNews)}
                            disabled={!globalNews.length}
                        >
                            GENERATE ONCE
                        </button>
                    </div>
                </div>
            )}

            {/* Enabled, belum ada data */}
            {enabled && !intel && !loading && !error && (
                <div className="loading-state" style={{ color: 'var(--bb-gray)' }}>
                    <Brain size={11} style={{ marginRight: 6 }} />
                    AWAITING NEWS DATA...
                </div>
            )}

            {loading && (
                <div className="loading-state">
                    <div className="spinner" />
                    GENERATING IHSG INTELLIGENCE BRIEF...
                </div>
            )}

            {error && !loading && (
                <div className="error-state">
                    <AlertTriangle size={11} />{error}
                </div>
            )}

            {intel && !loading && (
                <IntelResult intel={intel} globalNews={globalNews} localNews={localNews} onFetchIntel={onFetchIntel} />
            )}
        </div>
    )
}
