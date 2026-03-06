import { Brain, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react'
import type { IntelBrief, NewsItem } from '../types.ts'

function riskColor(score: number): string {
    if (score >= 75) return 'var(--bb-down)'
    if (score >= 50) return 'var(--bb-yellow)'
    if (score >= 25) return 'var(--bb-cyan)'
    return 'var(--bb-up)'
}

interface Props {
    intel: IntelBrief | null
    loading: boolean
    error: string | null
    globalNews: NewsItem[]
    onFetchIntel: (headlines: NewsItem[]) => void
}

export function IntelPanel({ intel, loading, error, globalNews, onFetchIntel }: Props) {
    return (
        <div className="panel-body">
            {!intel && !loading && !error && (
                <div className="intel-nokey">
                    <div className="intel-nokey-title">
                        <Brain size={12} />
                        INTEL BRIEF — CONFIGURATION REQUIRED
                    </div>
                    <div className="intel-nokey-body">
                        Set <code>OPENAI_API_KEY</code> in <code>backend/.env</code> to enable:<br />
                        &nbsp;&nbsp;▸ Geopolitical situation summary<br />
                        &nbsp;&nbsp;▸ 5 key global threat signals<br />
                        &nbsp;&nbsp;▸ 10-country instability risk scores (0–100)<br /><br />
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: 9 }}
                            onClick={() => onFetchIntel(globalNews)}
                            disabled={!globalNews.length}
                        >
                            TRY ANYWAY
                        </button>
                    </div>
                </div>
            )}

            {loading && (
                <div className="loading-state">
                    <div className="spinner" />
                    GENERATING INTELLIGENCE BRIEF...
                </div>
            )}

            {error && !loading && (
                <div className="error-state">
                    <AlertTriangle size={11} />{error}
                </div>
            )}

            {intel && !loading && (
                <>
                    {/* Summary */}
                    <div className="intel-summary">{intel.summary}</div>

                    {/* Key Threats */}
                    {intel.threats.length > 0 && (
                        <>
                            <div className="intel-section-label">KEY THREAT SIGNALS ({intel.threats.length})</div>
                            <div className="intel-threats">
                                {intel.threats.map((t, i) => (
                                    <div key={i} className="intel-threat" style={{ animationDelay: `${i * 30}ms` }}>
                                        <ChevronRight size={12} className="threat-bullet" />
                                        <span>{t}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Country Risks */}
                    {intel.countryRisks.length > 0 && (
                        <>
                            <div className="intel-section-label">COUNTRY RISK SCORES — INSTABILITY INDEX (0–100)</div>
                            {/* Header */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '100px 1fr 44px 1fr',
                                gap: 8,
                                padding: '2px 12px',
                                background: 'var(--bb-bg3)',
                                borderBottom: '1px solid var(--bb-border2)',
                            }}>
                                {['COUNTRY', 'RISK BAR', 'SCORE', 'DRIVER'].map((h) => (
                                    <span key={h} style={{ fontSize: 9, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
                                ))}
                            </div>
                            <div className="intel-country-risks">
                                {intel.countryRisks.map((r, i) => (
                                    <div key={i} className="risk-row" style={{ animationDelay: `${i * 40}ms` }}>
                                        <span className="risk-country">{r.country.toUpperCase()}</span>
                                        <div className="risk-bar-bg">
                                            <div
                                                className="risk-bar-fill"
                                                style={{ width: `${r.score}%`, background: riskColor(r.score), transitionDelay: `${i * 40}ms` }}
                                            />
                                        </div>
                                        <span className="risk-score" style={{ color: riskColor(r.score) }}>{r.score}</span>
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
                                onClick={() => onFetchIntel(globalNews)}
                                disabled={!globalNews.length}
                            >
                                <RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />
                                REFRESH
                            </button>
                            <span>{new Date(intel.generatedAt).toLocaleTimeString('en', { hour12: false })}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
