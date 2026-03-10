import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import type { MarketsData } from '../types.ts'

function fmt(price: number): string {
    if (!price) return '—'
    const abs = Math.abs(price)
    if (abs >= 100000) return `$${(price / 1000).toFixed(0)}K`
    if (abs >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    if (abs >= 1) return `$${price.toFixed(2)}`
    if (abs >= 0.01) return `$${price.toFixed(4)}`
    return `$${price.toFixed(6)}`
}

function fmtPct(v: number): string {
    const sign = v > 0 ? '+' : ''
    return `${sign}${v.toFixed(2)}%`
}

// function fmtMcap(v: number): string {
//     if (!v) return '—'
//     if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
//     if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
//     if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
//     return `$${v.toFixed(0)}`
// }

// function fmtVol(v: number): string {
//     if (!v) return '—'
//     if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
//     if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
//     return `$${v.toFixed(0)}`
// }

// function riskColor(prob: number): string {
//     if (prob >= 0.7) return 'var(--bb-down)'
//     if (prob >= 0.5) return 'var(--bb-yellow)'
//     if (prob >= 0.3) return 'var(--bb-cyan)'
//     return 'var(--bb-up)'
// }

function ChangeIcon({ v }: { v: number }) {
    if (v > 0) return <TrendingUp size={10} />
    if (v < 0) return <TrendingDown size={10} />
    return <Minus size={10} />
}

function changeClass(v: number) {
    if (v > 0) return 'up'
    if (v < 0) return 'down'
    return 'flat'
}

// const MarketColHeader = ({ cols }: { cols: string[] }) => (
//     <div className="market-col-header">
//         {cols.map((c, i) => (
//             <span key={i} className={i >= 2 ? 'market-col-right' : ''}>{c}</span>
//         ))}
//     </div>
// )

interface Props {
    data: MarketsData | null
    loading: boolean
    error: string | null
}

export function MarketsPanel({ data, loading, error }: Props) {
    if (loading && !data) {
        return <div className="panel-body"><div className="loading-state"><div className="spinner" />LOADING MARKETS...</div></div>
    }
    if (error && !data) {
        return <div className="panel-body"><div className="error-state"><AlertTriangle size={11} /> {error}</div></div>
    }
    if (!data) return <div className="panel-body"><div className="empty-state">NO DATA</div></div>

    return (
        <div className="panel-body">
            {/* Indices */}
            <div className="markets-section">
                <div className="markets-section-header">EQUITY INDICES</div>
                <div className="market-col-header">
                    <span>SYMBOL</span><span>NAME</span>
                    <span className="market-col-right">LAST</span>
                    <span className="market-col-right">CHG%</span>
                </div>
                {data.indices.map((idx, i) => (
                    <div key={i} className="market-row" style={{ animationDelay: `${i * 20}ms` }}>
                        <span className="market-symbol">{idx.symbol}</span>
                        <span className="market-name">{idx.name}</span>
                        <span className="market-price">{fmt(idx.price)}</span>
                        <span className={`market-change ${changeClass(idx.changePct)}`}>
                            <ChangeIcon v={idx.changePct} />{fmtPct(idx.changePct)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Commodities */}
            <div className="markets-section">
                <div className="markets-section-header">COMMODITIES</div>
                <div className="market-col-header">
                    <span>SYMBOL</span><span>NAME</span>
                    <span className="market-col-right">LAST</span>
                    <span className="market-col-right">CHG%</span>
                </div>
                {data.commodities.map((c, i) => (
                    <div key={i} className="market-row" style={{ animationDelay: `${(i + 9) * 20}ms` }}>
                        <span className="market-symbol">
                            {c.symbol.replace('%3D', '=').replace('CL=F', 'WTI').replace('GC=F', 'XAU').replace('HG=F', 'COPR')}
                        </span>
                        <span className="market-name">
                            {c.name}
                            <span style={{ color: 'var(--bb-gray2)', marginLeft: 4, fontSize: 9 }}>{c.unit}</span>
                        </span>
                        <span className="market-price">{fmt(c.price)}</span>
                        <span className={`market-change ${changeClass(c.changePct)}`}>
                            <ChangeIcon v={c.changePct} />{fmtPct(c.changePct)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
