import { useState } from 'react'
import { Brain, RefreshCw, AlertTriangle, Scan, Crosshair, Loader } from 'lucide-react'
import type { ScreenerResult, WatchlistItem, DeepDiveResult, DeepDivePick, TrackedPosition } from '../types.ts'

const TRACKED = new Set(['AK', 'BK', 'ZP', 'KZ', 'RX'])

// ── Screener helpers ──────────────────────────────────────────────────────────

function signalColor(signal: string): string {
    if (signal === 'STRONG_BUY') return 'var(--bb-up)'
    if (signal === 'BUY') return 'var(--bb-cyan)'
    return 'var(--bb-yellow)'
}

function scoreColor(score: number): string {
    if (score >= 80) return 'var(--bb-up)'
    if (score >= 60) return 'var(--bb-cyan)'
    if (score >= 40) return 'var(--bb-yellow)'
    return 'var(--bb-down)'
}

function riskColor(level: string): string {
    if (level === 'GATE_1_FAIL' || level === 'GATE_3_FAIL') return 'var(--bb-down)'
    if (level === 'GATE_2_FAIL') return 'var(--bb-orange)'
    return 'var(--bb-yellow)' // GATE_0_FAIL
}

function setupBadge(type: string): string {
    if (type === 'DIP_BUY') return 'var(--bb-cyan)'
    if (type === 'PRE_BREAKOUT') return 'var(--bb-orange)'
    if (type === 'MOMENTUM_CONTINUATION') return 'var(--bb-up)'
    return 'var(--bb-gray)'
}

function KV({ label, value, valueStyle }: { label: string; value: string; valueStyle?: React.CSSProperties }) {
    return (
        <div style={{ display: 'flex', gap: 4, fontSize: 9, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--bb-gray)', flexShrink: 0, minWidth: 100 }}>{label}:</span>
            <span style={{ color: 'var(--bb-white)', ...valueStyle }}>{value || '—'}</span>
        </div>
    )
}

function StockCard({ item, index }: { item: WatchlistItem; index: number }) {
    const smp = item.smartMoneyProfile
    const pa = item.priceAnalysis
    const tp = item.tradePlan

    return (
        <div style={{
            border: '1px solid var(--bb-border2)',
            background: 'var(--bb-bg2)',
            animationDelay: `${index * 60}ms`,
        }}>
            {/* Card header */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr auto',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                background: 'var(--bb-bg3)',
                borderBottom: '1px solid var(--bb-border2)',
            }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--bb-orange)', letterSpacing: '0.05em' }}>
                    {item.ticker}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: 8, fontWeight: 700, padding: '1px 5px',
                        background: signalColor(item.signal) + '22',
                        color: signalColor(item.signal),
                        border: `1px solid ${signalColor(item.signal)}55`,
                        letterSpacing: '0.08em',
                    }}>
                        {item.signal.replace('_', ' ')}
                    </span>
                    <span style={{
                        fontSize: 8, padding: '1px 5px',
                        background: setupBadge(item.setupType) + '22',
                        color: setupBadge(item.setupType),
                        border: `1px solid ${setupBadge(item.setupType)}44`,
                        letterSpacing: '0.06em',
                    }}>
                        {item.setupType.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--bb-gray)', fontStyle: 'italic' }}>{item.name}</span>
                </div>
                {/* Conviction score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <div style={{ width: 44, height: 3, background: 'var(--bb-border2)', position: 'relative' }}>
                        <div style={{
                            position: 'absolute', left: 0, top: 0, height: '100%',
                            width: `${item.convictionScore}%`,
                            background: scoreColor(item.convictionScore),
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(item.convictionScore), minWidth: 22, textAlign: 'right' }}>
                        {item.convictionScore}
                    </span>
                </div>
            </div>

            {/* Card body — 3-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--bb-border)' }}>
                {/* Smart Money Profile */}
                <div style={{ padding: '6px 10px', borderRight: '1px solid var(--bb-border)' }}>
                    <div style={{ fontSize: 8, color: 'var(--bb-orange)', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>
                        SMART MONEY
                    </div>
                    <KV label="Dominant Flow" value={smp['Dominant Flow'] ?? ''} valueStyle={{ color: (smp['Dominant Flow'] ?? '') === 'NET_ACCUMULATION' ? 'var(--bb-up)' : (smp['Dominant Flow'] ?? '') === 'NET_DISTRIBUTION' ? 'var(--bb-down)' : 'var(--bb-yellow)', fontWeight: 700 }} />
                    <KV label="Acc. Net Value" value={smp['Acc. Net Value'] ?? ''} valueStyle={{ color: 'var(--bb-up)' }} />
                    <KV label="Dist. Net Value" value={smp['Dist. Net Value'] ?? ''} valueStyle={{ color: (smp['Dist. Net Value'] ?? '') === 'N/A' ? 'var(--bb-gray)' : 'var(--bb-orange)' }} />
                    <KV label="Net Imbalance" value={smp['Net Imbalance'] ?? ''} valueStyle={{ color: (smp['Net Imbalance'] ?? '').startsWith('-') ? 'var(--bb-down)' : 'var(--bb-up)' }} />
                    <KV label="Top Broker Type" value={smp['Top Broker Type'] ?? ''} />
                    <KV label="Broker Count" value={smp['Broker Count (Acc/Dist)'] ?? ''} valueStyle={{ color: 'var(--bb-cyan)' }} />
                    <KV label="Consistency" value={smp['Consistency'] ?? ''} />
                    <KV label="Key Brokers" value={smp['Key Brokers'] ?? ''} />
                </div>

                {/* Price Analysis */}
                <div style={{ padding: '6px 10px', borderRight: '1px solid var(--bb-border)' }}>
                    <div style={{ fontSize: 8, color: 'var(--bb-orange)', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>
                        PRICE ACTION
                    </div>
                    <KV label="Current Price" value={pa['Current Price'] ?? ''} valueStyle={{ fontWeight: 700 }} />
                    <KV label="SM Avg Price" value={pa['Smart Money Avg Price'] ?? ''} valueStyle={{ color: 'var(--bb-cyan)' }} />
                    <KV label="Distance to Avg" value={pa['Distance to Avg'] ?? ''} valueStyle={{ color: (pa['Distance to Avg'] ?? '').startsWith('-') ? 'var(--bb-down)' : 'var(--bb-up)' }} />
                    <KV label="11-Day Trend" value={pa['11-Day Trend'] ?? ''} valueStyle={{
                        color: pa['11-Day Trend'] === 'UPTREND' ? 'var(--bb-up)' :
                            pa['11-Day Trend'] === 'DOWNTREND' ? 'var(--bb-down)' :
                            pa['11-Day Trend'] === 'V-RECOVERY' ? 'var(--bb-cyan)' : 'var(--bb-yellow)'
                    }} />
                    <KV label="Price Range" value={pa['Price Range'] ?? ''} />
                    <KV label="Support Zone" value={pa['Support Zone'] ?? ''} valueStyle={{ color: 'var(--bb-cyan)' }} />
                    <KV label="Resistance Zone" value={pa['Resistance Zone'] ?? ''} />
                </div>

                {/* Trade Plan */}
                <div style={{ padding: '6px 10px' }}>
                    <div style={{ fontSize: 8, color: 'var(--bb-orange)', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>
                        TRADE PLAN
                    </div>
                    <KV label="Entry Zone" value={tp.entryZone} valueStyle={{ color: 'var(--bb-cyan)' }} />
                    <KV label="Stop Loss" value={tp.stopLoss} valueStyle={{ color: 'var(--bb-down)' }} />
                    <KV label="Target 1" value={tp.target1} valueStyle={{ color: 'var(--bb-up)' }} />
                    <KV label="Target 2" value={tp.target2} valueStyle={{ color: 'var(--bb-up)' }} />
                    <KV label="R/R Ratio" value={tp.riskReward} valueStyle={{ fontWeight: 700 }} />
                    <KV label="Est. Profit" value={tp.estimatedProfit} valueStyle={{ color: 'var(--bb-up)', fontWeight: 700 }} />
                    <KV label="Hold Period" value={tp.holdPeriod} />
                    <KV label="Exit Signal" value={tp.exitSignal} valueStyle={{ color: 'var(--bb-yellow)' }} />
                </div>
            </div>

            {/* Catalyst */}
            {item.catalyst && (
                <div style={{
                    padding: '4px 10px',
                    fontSize: 9,
                    color: 'var(--bb-gray)',
                    lineHeight: 1.55,
                    fontStyle: 'italic',
                    borderTop: '1px solid var(--bb-border)',
                }}>
                    <span style={{ color: 'var(--bb-orange)', fontStyle: 'normal', marginRight: 6, fontSize: 8, fontWeight: 700 }}>CATALYST</span>
                    {item.catalyst}
                </div>
            )}
        </div>
    )
}

// ── Deep Dive helpers ─────────────────────────────────────────────────────────

interface TradePlanData {
    entryZone: string
    stopLoss: string
    target1: string
    target2: string
    rr: string
    holdBias: string
    stopPct: string
    t1Pct: string
}

function computeTradePlan(dd: import('../types.ts').StockDeepDive): TradePlanData | null {
    const trackedBuyers = (dd.trackedPositions ?? []).filter(p => p.side === 'BUY')
    let entry = 0
    if (trackedBuyers.length > 0) {
        const totalNet = trackedBuyers.reduce((s, p) => s + Math.abs(p.netVal), 0)
        entry = totalNet > 0
            ? trackedBuyers.reduce((s, p) => s + p.buyAvg * Math.abs(p.netVal), 0) / totalNet
            : trackedBuyers[0].buyAvg
    } else if (dd.meanBuyAvg > 0) {
        entry = dd.meanBuyAvg
    }
    if (entry <= 0) return null

    const sl = entry * 0.95
    const t1Raw = dd.meanSellAvg > 0 && dd.meanSellAvg > entry ? dd.meanSellAvg : entry * 1.10
    const t2Raw = t1Raw * 1.05

    const risk = entry - sl
    const reward = t1Raw - entry
    const rr = risk > 0 ? `1:${(reward / risk).toFixed(1)}` : 'N/A'

    const stopPct = `${((sl - entry) / entry * 100).toFixed(1)}%`
    const t1Pct = `+${((t1Raw - entry) / entry * 100).toFixed(1)}%`

    const trend = dd.multiTimeframe.trend
    const holdBias = trend.includes('ACCELERATING_BUY') ? 'SWING 1–4W'
        : trend.includes('STEADY_BUY') ? 'SWING 2–6W'
        : trend.includes('DECELERATING_BUY') ? 'SHORT 1–2W'
        : trend.includes('BUY') ? 'SWING 2–4W'
        : 'CAUTIOUS'

    return {
        entryZone: Math.round(entry).toLocaleString('id-ID'),
        stopLoss: Math.round(sl).toLocaleString('id-ID'),
        target1: Math.round(t1Raw).toLocaleString('id-ID'),
        target2: Math.round(t2Raw).toLocaleString('id-ID'),
        rr,
        holdBias,
        stopPct,
        t1Pct,
    }
}

function AccumDistBar({ accum, dist, meanBuy, meanSell }: {
    accum: number; dist: number; meanBuy: number; meanSell: number
}) {
    const total = accum + dist
    if (total <= 0) return null
    const accumPct = Math.round(accum / total * 100)
    const distPct = 100 - accumPct
    const imbalance = accum - dist
    const imbalanceColor = imbalance > 0 ? 'var(--bb-up)' : imbalance < 0 ? 'var(--bb-down)' : 'var(--bb-gray)'

    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 7, letterSpacing: '0.08em' }}>
                <span style={{ color: 'var(--bb-up)', fontWeight: 700 }}>ACCUM</span>
                <span style={{ color: imbalanceColor, fontWeight: 700 }}>
                    NET {imbalance >= 0 ? '+' : ''}{Math.round(imbalance / 1e9) !== 0 ? `${(imbalance / 1e9).toFixed(1)}B` : `${(imbalance / 1e6).toFixed(0)}M`}
                </span>
                <span style={{ color: 'var(--bb-down)', fontWeight: 700 }}>DIST</span>
            </div>

            {/* Split bar */}
            <div style={{ display: 'flex', height: 8, width: '100%', overflow: 'hidden', border: '1px solid var(--bb-border2)' }}>
                <div style={{
                    width: `${accumPct}%`,
                    background: 'var(--bb-up)',
                    opacity: 0.75,
                    transition: 'width 0.6s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                    {accumPct > 20 && (
                        <span style={{ fontSize: 6, color: '#000', fontWeight: 700 }}>{accumPct}%</span>
                    )}
                </div>
                <div style={{
                    width: `${distPct}%`,
                    background: 'var(--bb-down)',
                    opacity: 0.75,
                    transition: 'width 0.6s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                    {distPct > 20 && (
                        <span style={{ fontSize: 6, color: '#000', fontWeight: 700 }}>{distPct}%</span>
                    )}
                </div>
            </div>

            {/* Value labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 8 }}>
                <span style={{ color: 'var(--bb-up)' }}>{fmtIDR(accum)}</span>
                <span style={{ color: 'var(--bb-down)' }}>{fmtIDR(-dist)}</span>
            </div>

            {/* Mean price markers */}
            {(meanBuy > 0 || meanSell > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 8 }}>
                    {meanBuy > 0 && (
                        <span style={{ color: 'var(--bb-gray)' }}>
                            buy avg <span style={{ color: 'var(--bb-cyan)', fontWeight: 700 }}>{Math.round(meanBuy).toLocaleString('id-ID')}</span>
                        </span>
                    )}
                    {meanSell > 0 && (
                        <span style={{ color: 'var(--bb-gray)' }}>
                            sell avg <span style={{ color: 'var(--bb-orange)', fontWeight: 700 }}>{Math.round(meanSell).toLocaleString('id-ID')}</span>
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

function fmtIDR(val: number): string {
    const abs = Math.abs(val)
    const sign = val < 0 ? '-' : '+'
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`
    if (abs >= 1e9) return `${sign}${Math.round(abs / 1e9)}B`
    if (abs >= 1e6) return `${sign}${Math.round(abs / 1e6)}M`
    return `${sign}${Math.round(abs)}`
}

// function accelColor(accel: AccelerationLabel, netValFull: number): string {
//     const isBuyer = netValFull >= 0
//     if (accel === 'FRESH_ENTRY' || accel === 'ACCELERATING') return isBuyer ? 'var(--bb-up)' : 'var(--bb-down)'
//     if (accel === 'STEADY') return 'var(--bb-yellow)'
//     if (accel === 'DECELERATING') return isBuyer ? 'var(--bb-yellow)' : 'var(--bb-cyan)'
//     if (accel === 'REVERSING') return isBuyer ? 'var(--bb-down)' : 'var(--bb-up)'
//     return 'var(--bb-gray)'
// }

function signalBadgeColor(signal: string): string {
    if (signal === 'BULLISH') return 'var(--bb-up)'
    if (signal === 'BEARISH') return 'var(--bb-down)'
    return 'var(--bb-yellow)'
}

function trendColor(trend: string): string {
    if (trend.includes('ACCELERATING_BUY')) return 'var(--bb-up)'
    if (trend.includes('BUY')) return 'var(--bb-cyan)'
    if (trend.includes('ACCELERATING_SELL')) return 'var(--bb-down)'
    if (trend.includes('SELL')) return 'var(--bb-orange)'
    return 'var(--bb-yellow)'
}

function ScoreBar({ label, value, width = 80 }: { label: string; value: number; width?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
            <span style={{ color: 'var(--bb-gray)', minWidth: 130 }}>{label}</span>
            <div style={{ width, height: 3, background: 'var(--bb-border2)', position: 'relative', flexShrink: 0 }}>
                <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${value}%`,
                    background: scoreColor(value),
                    transition: 'width 0.6s ease',
                }} />
            </div>
            <span style={{ color: scoreColor(value), fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{value}</span>
        </div>
    )
}

function rankBorderColor(rank: number): string {
    if (rank === 1) return 'var(--bb-orange)'
    if (rank === 2) return 'var(--bb-cyan)'
    if (rank === 3) return 'var(--bb-yellow)'
    return 'var(--bb-border2)'
}

function rankHeaderBg(rank: number): string {
    if (rank === 1) return 'var(--bb-orange)18'
    if (rank === 2) return 'var(--bb-cyan)12'
    if (rank === 3) return 'var(--bb-yellow)10'
    return 'var(--bb-bg3)'
}

const BROKER_COL = '28px 32px 54px 52px 52px'

function BrokerRow({ b }: { b: import('../types.ts').TopBrokerInfo }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: BROKER_COL, gap: 4, padding: '1px 0', borderTop: '1px solid var(--bb-border)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: TRACKED.has(b.code) ? 'var(--bb-yellow)' : 'var(--bb-orange)' }}>{b.code}</span>
            <span style={{ fontSize: 8, color: b.type === 'Foreign' ? 'var(--bb-cyan)' : 'var(--bb-gray2)' }}>
                {b.type === 'Foreign' ? 'FOR' : 'DOM'}
            </span>
            <span style={{ fontSize: 9, color: b.netValFull >= 0 ? 'var(--bb-up)' : 'var(--bb-down)', fontWeight: 700 }}>
                {fmtIDR(b.netValFull)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--bb-up)' }}>
                {b.buyAvg > 0 ? b.buyAvg.toLocaleString('id-ID') : '—'}
            </span>
            <span style={{ fontSize: 9, color: 'var(--bb-down)' }}>
                {b.sellAvg > 0 ? b.sellAvg.toLocaleString('id-ID') : '—'}
            </span>
        </div>
    )
}

function BrokerColHeader() {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: BROKER_COL, gap: 4, marginBottom: 2 }}>
            {['CODE', 'TYPE', 'NET', 'BUY AVG', 'SELL AVG'].map(h => (
                <span key={h} style={{ fontSize: 7, color: 'var(--bb-gray)', letterSpacing: '0.08em' }}>{h}</span>
            ))}
        </div>
    )
}

function DeepDivePickCard({ pick, index, currentPrice }: { pick: DeepDivePick; index: number; currentPrice?: string }) {
    const dd = pick.deepDive
    const sb = pick.scoreBreakdown
    const tradePlan = computeTradePlan(dd)

    const buyers = (dd.topBuyers ?? []).slice(0, 5)
    const sellers = (dd.topSellers ?? []).slice(0, 5)

    return (
        <div style={{
            border: `1px solid ${rankBorderColor(pick.rank)}`,
            background: 'var(--bb-bg2)',
            animationDelay: `${index * 60}ms`,
        }}>
            {/* Pick header */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '24px auto 1fr auto',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: rankHeaderBg(pick.rank),
                borderBottom: '1px solid var(--bb-border2)',
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: rankBorderColor(pick.rank) }}>
                    #{pick.rank}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--bb-orange)', letterSpacing: '0.05em' }}>
                        {pick.stockCode}
                    </span>
                    {currentPrice && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bb-white)', letterSpacing: '0.02em' }}>
                            {currentPrice}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9 }}>
                    <span style={{ color: 'var(--bb-gray)' }}>SmartScan: <span style={{ color: scoreColor(pick.smartScanScore), fontWeight: 700 }}>{pick.smartScanScore}</span></span>
                    <span style={{ color: 'var(--bb-border2)' }}>|</span>
                    <span style={{ color: 'var(--bb-gray)' }}>DeepDive: <span style={{ color: scoreColor(pick.deepDiveScore), fontWeight: 700 }}>{pick.deepDiveScore}</span></span>
                    <span style={{ color: 'var(--bb-border2)' }}>|</span>
                    <span style={{ color: signalBadgeColor(dd.apiSignal), fontSize: 8, fontWeight: 700 }}>
                        {dd.apiSignal} (conf:{dd.apiConfidence})
                    </span>
                    <span style={{ color: trendColor(dd.multiTimeframe.trend), fontSize: 8 }}>
                        {dd.multiTimeframe.trend.replace(/_/g, ' ')}
                    </span>
                </div>
                {/* Combined score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <div style={{ width: 50, height: 4, background: 'var(--bb-border2)', position: 'relative' }}>
                        <div style={{
                            position: 'absolute', left: 0, top: 0, height: '100%',
                            width: `${pick.combinedScore}%`,
                            background: scoreColor(pick.combinedScore),
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(pick.combinedScore), minWidth: 24, textAlign: 'right' }}>
                        {pick.combinedScore}
                    </span>
                </div>
            </div>

            {/* Body: score breakdown | buyers/sellers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {/* Left: Score breakdown + multi-TF + tracked positions */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid var(--bb-border)' }}>
                    <div style={{ fontSize: 8, color: 'var(--bb-orange)', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>
                        SCORE BREAKDOWN
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <ScoreBar label="Smart Money Conviction (35%)" value={sb.foreignConviction} />
                        <ScoreBar label="Accumulation Quality (25%)" value={sb.classificationHealth} />
                        <ScoreBar label="Multi-Timeframe (25%)" value={sb.multiTimeframe} />
                        <ScoreBar label="Claude Signal (15%)" value={sb.claudeSignal} />
                    </div>

                    {/* Multi-TF values */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, fontSize: 9, color: 'var(--bb-gray)' }}>
                        <span>Full: <span style={{ color: dd.multiTimeframe.full >= 0 ? 'var(--bb-up)' : 'var(--bb-down)' }}>{fmtIDR(dd.multiTimeframe.full)}</span></span>
                        <span>10d: <span style={{ color: dd.multiTimeframe.recent10d >= 0 ? 'var(--bb-up)' : 'var(--bb-down)' }}>{fmtIDR(dd.multiTimeframe.recent10d)}</span></span>
                        <span>5d: <span style={{ color: dd.multiTimeframe.recent5d >= 0 ? 'var(--bb-up)' : 'var(--bb-down)' }}>{fmtIDR(dd.multiTimeframe.recent5d)}</span></span>
                    </div>

                    {/* Tracked whale positions */}
                    {dd.trackedPositions && dd.trackedPositions.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 9, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {dd.trackedPositions.filter((p: TrackedPosition) => p.side === 'BUY').length > 0 && (
                                <div>
                                    <span style={{ color: 'var(--bb-up)', fontWeight: 700 }}>BUY: </span>
                                    {dd.trackedPositions.filter((p: TrackedPosition) => p.side === 'BUY').map((p: TrackedPosition) => (
                                        <span key={p.code} style={{ marginRight: 6 }}>
                                            <span style={{ color: 'var(--bb-yellow)', fontWeight: 700 }}>{p.code}</span>
                                            <span style={{ color: 'var(--bb-gray2)' }}> @{p.buyAvg}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {dd.trackedPositions.filter((p: TrackedPosition) => p.side === 'SELL').length > 0 && (
                                <div>
                                    <span style={{ color: 'var(--bb-down)', fontWeight: 700 }}>SELL: </span>
                                    {dd.trackedPositions.filter((p: TrackedPosition) => p.side === 'SELL').map((p: TrackedPosition) => (
                                        <span key={p.code} style={{ marginRight: 6 }}>
                                            <span style={{ color: 'var(--bb-yellow)', fontWeight: 700 }}>{p.code}</span>
                                            <span style={{ color: 'var(--bb-gray2)' }}> @{p.sellAvg}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Market-wide accum/dist bar */}
                    {dd.totalAccumNetValue != null && (
                        <AccumDistBar
                            accum={dd.totalAccumNetValue}
                            dist={dd.totalDistNetValue}
                            meanBuy={dd.meanBuyAvg}
                            meanSell={dd.meanSellAvg}
                        />
                    )}
                </div>

                {/* Right: Buyers + Sellers separated */}
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* TOP BUYERS */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 7, color: 'var(--bb-up)', letterSpacing: '0.1em', fontWeight: 700 }}>
                                TOP BUYERS
                            </span>
                            <span style={{ fontSize: 7, color: 'var(--bb-gray)' }}>
                                {buyers.length}/5
                            </span>
                        </div>
                        <BrokerColHeader />
                        {buyers.length > 0
                            ? buyers.map(b => <BrokerRow key={`buy-${b.code}`} b={b} />)
                            : <span style={{ fontSize: 8, color: 'var(--bb-gray)' }}>— no data</span>
                        }
                    </div>

                    {/* TOP SELLERS */}
                    <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 7, color: 'var(--bb-down)', letterSpacing: '0.1em', fontWeight: 700 }}>
                                TOP SELLERS
                            </span>
                            <span style={{ fontSize: 7, color: 'var(--bb-gray)' }}>
                                {sellers.length}/5
                            </span>
                        </div>
                        <BrokerColHeader />
                        {sellers.length > 0
                            ? sellers.map(b => <BrokerRow key={`sell-${b.code}`} b={b} />)
                            : <span style={{ fontSize: 8, color: 'var(--bb-gray)' }}>— no data</span>
                        }
                    </div>
                </div>
            </div>

            {/* Trade Plan strip */}
            {tradePlan && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: 0,
                    borderTop: '1px solid var(--bb-border)',
                    background: 'var(--bb-bg3)',
                }}>
                    {[
                        { label: 'ENTRY ZONE', value: tradePlan.entryZone, color: 'var(--bb-cyan)' },
                        { label: 'STOP LOSS', value: `${tradePlan.stopLoss} (${tradePlan.stopPct})`, color: 'var(--bb-down)' },
                        { label: 'TARGET 1', value: `${tradePlan.target1} (${tradePlan.t1Pct})`, color: 'var(--bb-up)' },
                        { label: 'TARGET 2', value: tradePlan.target2, color: 'var(--bb-up)' },
                        { label: 'R/R', value: tradePlan.rr, color: 'var(--bb-white)', bold: true },
                        { label: 'HOLD BIAS', value: tradePlan.holdBias, color: 'var(--bb-yellow)' },
                    ].map(({ label, value, color, bold }) => (
                        <div key={label} style={{
                            padding: '4px 8px',
                            borderRight: '1px solid var(--bb-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                        }}>
                            <span style={{ fontSize: 7, color: 'var(--bb-gray)', letterSpacing: '0.08em' }}>{label}</span>
                            <span style={{ fontSize: 9, color, fontWeight: bold ? 700 : undefined }}>{value}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Catalyst */}
            {pick.claudeCatalyst && (
                <div style={{
                    padding: '4px 10px',
                    fontSize: 9,
                    color: 'var(--bb-white)',
                    borderTop: '1px solid var(--bb-border)',
                    background: 'var(--bb-orange)0d',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                }}>
                    <span style={{ color: 'var(--bb-orange)', fontStyle: 'normal', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>CATALYST</span>
                    <span>{pick.claudeCatalyst}</span>
                </div>
            )}

            {/* Claude narrative */}
            {pick.claudeNarrative && (
                <div style={{
                    padding: '4px 10px',
                    fontSize: 9,
                    color: 'var(--bb-gray)',
                    fontStyle: 'italic',
                    borderTop: '1px solid var(--bb-border)',
                }}>
                    <span style={{ color: 'var(--bb-cyan)', fontStyle: 'normal', marginRight: 6, fontSize: 8, fontWeight: 700 }}>CLAUDE</span>
                    {pick.claudeNarrative}
                </div>
            )}
        </div>
    )
}

function DeepDiveSection({ deepdive, loading, error, screener, onFetchDeepDive }: {
    deepdive: DeepDiveResult | null
    loading: boolean
    error: string | null
    screener: ScreenerResult
    onFetchDeepDive: (watchlist: WatchlistItem[]) => void
}) {
    return (
        <div style={{ borderTop: '2px solid var(--bb-orange)33', marginTop: 1 }}>
            {/* Section header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'var(--bb-bg3)',
                borderBottom: '1px solid var(--bb-border2)',
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--bb-orange)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    <Crosshair size={10} />
                    DEEP DIVE RANKING — ALL {screener.watchlist.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    {deepdive?.markdownBrief && !loading && (
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: 9, padding: '2px 10px', color: 'var(--bb-cyan)', borderColor: 'var(--bb-cyan)33' }}
                            onClick={() => navigator.clipboard.writeText(deepdive.markdownBrief!)}
                        >
                            COPY BRIEF
                        </button>
                    )}
                    <button
                        className="btn btn-outline"
                        style={{ fontSize: 9, padding: '2px 10px' }}
                        onClick={() => onFetchDeepDive(screener.watchlist)}
                        disabled={loading}
                    >
                        {loading
                            ? <><Loader size={8} style={{ display: 'inline', marginRight: 4 }} />ANALYZING...</>
                            : deepdive
                                ? <><RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />RE-ANALYZE</>
                                : <><Crosshair size={8} style={{ display: 'inline', marginRight: 4 }} />RUN DEEP DIVE</>
                        }
                    </button>
                </div>
            </div>

            {loading && (
                <div className="loading-state">
                    <div className="spinner" />
                    FETCHING BROKER PROFILES... ({screener.watchlist.length} stocks × 30d)
                </div>
            )}

            {error && !loading && (
                <div style={{ padding: '8px 12px' }}>
                    <div className="error-state" style={{ marginBottom: 8 }}>
                        <AlertTriangle size={10} /> {error}
                    </div>
                    <button className="btn btn-outline" style={{ fontSize: 9 }} onClick={() => onFetchDeepDive(screener.watchlist)}>
                        <RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />
                        RETRY
                    </button>
                </div>
            )}

            {deepdive && !loading && (
                <>
                    {deepdive.allRanked.length > 0 && (() => {
                        const priceMap = new Map(screener.watchlist.map(w => [w.ticker, w.priceAnalysis?.['Current Price']]))
                        return (
                            <>
                                <div className="intel-section-label">
                                    ALL RANKED — {deepdive.period.start} → {deepdive.period.end} | {deepdive.analyzed} ANALYZED
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {deepdive.allRanked.map((pick, i) => (
                                        <DeepDivePickCard
                                            key={pick.stockCode}
                                            pick={pick}
                                            index={i}
                                            currentPrice={priceMap.get(pick.stockCode)}
                                        />
                                    ))}
                                </div>
                            </>
                        )
                    })()}

                    <div className="intel-footer">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--bb-gray)' }}>
                            Score = SmartScan×40% + DeepDive×60% (4-dim: smart money conviction, accum quality, multi-TF, claude signal)
                        </span>
                        <span style={{ fontSize: 9 }}>
                            {new Date(deepdive.generatedAt).toLocaleTimeString('en', { hour12: false })}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}

// ── Main panel ────────────────────────────────────────────────────────────────

type ScanPeriod = '2W' | '1M' | '3M' | 'CUSTOM'

const DATE_INPUT_STYLE: React.CSSProperties = {
    background: 'var(--bb-bg3)',
    border: '1px solid var(--bb-border2)',
    color: 'var(--bb-white)',
    fontFamily: 'inherit',
    fontSize: 9,
    padding: '2px 6px',
    outline: 'none',
    colorScheme: 'dark',
    width: 100,
}

function PeriodSelector({ period, onChange }: { period: ScanPeriod; onChange: (p: ScanPeriod) => void }) {
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            {(['2W', '1M', '3M', 'CUSTOM'] as ScanPeriod[]).map(p => (
                <button
                    key={p}
                    className="btn btn-outline"
                    style={{
                        fontSize: 9,
                        padding: '2px 8px',
                        background: period === p ? 'var(--bb-orange)22' : undefined,
                        color: period === p ? 'var(--bb-orange)' : undefined,
                        borderColor: period === p ? 'var(--bb-orange)' : undefined,
                    }}
                    onClick={() => onChange(p)}
                >
                    {p}
                </button>
            ))}
        </div>
    )
}

interface Props {
    screener: ScreenerResult | null
    loading: boolean
    error: string | null
    onFetchScreener: (period: string, startDate?: string, endDate?: string) => void
    deepdive: DeepDiveResult | null
    loadingDeepDive: boolean
    errorDeepDive: string | null
    onFetchDeepDive: (watchlist: WatchlistItem[]) => void
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthAgoStr() {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
}

export function ScreenerPanel({ screener, loading, error, onFetchScreener, deepdive, loadingDeepDive, errorDeepDive, onFetchDeepDive }: Props) {
    const [period, setPeriod] = useState<ScanPeriod>('1M')
    const [customStart, setCustomStart] = useState(monthAgoStr)
    const [customEnd, setCustomEnd] = useState(todayStr)

    const canScan = period !== 'CUSTOM' || (customStart !== '' && customEnd !== '' && customEnd >= customStart)

    function handleScan() {
        if (period === 'CUSTOM') {
            onFetchScreener('CUSTOM', customStart, customEnd)
        } else {
            onFetchScreener(period)
        }
    }

    return (
        <div className="panel-body">
            {/* Idle state */}
            {!screener && !loading && !error && (
                <div className="intel-nokey">
                    <div className="intel-nokey-title">
                        <Scan size={12} />
                        SMART MONEY FLOW SCREENER
                    </div>
                    <div className="intel-nokey-body">
                        Identifikasi saham dengan akumulasi smart money (Whale/Bandar) terkuat di IDX,
                        filter 4-gate, dan rank berdasarkan conviction score v3.2.<br /><br />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <PeriodSelector period={period} onChange={setPeriod} />
                                <button className="btn btn-outline" style={{ fontSize: 9, opacity: canScan ? 1 : 0.4 }} disabled={!canScan} onClick={handleScan}>
                                    <Scan size={8} style={{ display: 'inline', marginRight: 4 }} />
                                    RUN SCAN
                                </button>
                            </div>
                            {period === 'CUSTOM' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>FROM</span>
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={DATE_INPUT_STYLE} />
                                    <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>TO</span>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={DATE_INPUT_STYLE} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="loading-state">
                    <div className="spinner" />
                    SCANNING SMART MONEY FLOWS...
                </div>
            )}

            {error && !loading && (
                <div style={{ padding: '12px 16px' }}>
                    <div className="error-state" style={{ marginBottom: 12 }}>
                        <AlertTriangle size={11} /> {error}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PeriodSelector period={period} onChange={setPeriod} />
                            <button className="btn btn-outline" style={{ fontSize: 9, opacity: canScan ? 1 : 0.4 }} disabled={!canScan} onClick={handleScan}>
                                <RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />
                                RETRY
                            </button>
                        </div>
                        {period === 'CUSTOM' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>FROM</span>
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={DATE_INPUT_STYLE} />
                                <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>TO</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={DATE_INPUT_STYLE} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {screener && !loading && (
                <>
                    {/* Market Pulse */}
                    <div className="intel-summary">{screener.marketPulse}</div>

                    {/* Watchlist */}
                    {screener.watchlist.length > 0 && (
                        <>
                            <div className="intel-section-label">
                                WATCHLIST — TOP {screener.watchlist.length} CONVICTION SETUPS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {screener.watchlist.map((item, i) => (
                                    <StockCard key={item.ticker || i} item={item} index={i} />
                                ))}
                            </div>
                        </>
                    )}

                    {/* Deep Dive section */}
                    {screener.watchlist.length > 0 && (
                        <DeepDiveSection
                            deepdive={deepdive}
                            loading={loadingDeepDive}
                            error={errorDeepDive}
                            screener={screener}
                            onFetchDeepDive={onFetchDeepDive}
                        />
                    )}

                    {/* Traps */}
                    {screener.riskRadar.length > 0 && (
                        <>
                            <div className="intel-section-label">TRAPS — HIGH VALUE GATE FAILURES</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '60px 140px 100px 1fr', gap: 8, padding: '2px 12px', background: 'var(--bb-bg3)', borderBottom: '1px solid var(--bb-border2)' }}>
                                {['TICKER', 'NET VALUE', 'GATE', 'REASON'].map((h) => (
                                    <span key={h} style={{ fontSize: 9, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
                                ))}
                            </div>
                            <div className="intel-threats">
                                {screener.riskRadar.map((r, i) => (
                                    <div key={i} className="intel-threat" style={{ display: 'grid', gridTemplateColumns: '60px 140px 100px 1fr', gap: 8 }}>
                                        <span style={{ fontWeight: 700, color: 'var(--bb-orange)' }}>{r.ticker}</span>
                                        <span style={{ color: 'var(--bb-gray2)' }}>{r.netValue}</span>
                                        <span style={{ color: riskColor(r.riskLevel), fontWeight: 700, fontSize: 9 }}>
                                            {(r.riskLevel === 'GATE_1_FAIL' || r.riskLevel === 'GATE_3_FAIL')
                                                ? <><AlertTriangle size={8} style={{ display: 'inline', marginRight: 3 }} />{r.riskLevel}</>
                                                : r.riskLevel
                                            }
                                        </span>
                                        <span style={{ color: 'var(--bb-gray2)', fontSize: 9 }}>{r.reason}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Methodology note */}
                    {screener.methodologyNote && (
                        <div style={{
                            padding: '6px 12px',
                            fontSize: 9,
                            color: 'var(--bb-gray)',
                            lineHeight: 1.55,
                            borderTop: '1px solid var(--bb-border2)',
                            background: 'var(--bb-bg2)',
                            fontStyle: 'italic',
                        }}>
                            {screener.methodologyNote}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="intel-footer">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Brain size={9} />
                            MODEL: {screener.model.toUpperCase()}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PeriodSelector period={period} onChange={setPeriod} />
                                <button
                                    className="btn btn-outline"
                                    style={{ fontSize: 9, padding: '2px 10px', opacity: canScan ? 1 : 0.4 }}
                                    disabled={!canScan}
                                    onClick={handleScan}
                                >
                                    <RefreshCw size={8} style={{ display: 'inline', marginRight: 4 }} />
                                    RESCAN
                                </button>
                                <span>
                                    {new Date(screener.generatedAt).toLocaleTimeString('en', { hour12: false })}
                                </span>
                            </div>
                            {period === 'CUSTOM' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>FROM</span>
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={DATE_INPUT_STYLE} />
                                    <span style={{ fontSize: 9, color: 'var(--bb-gray)' }}>TO</span>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={DATE_INPUT_STYLE} />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
