import { ExternalLink, AlertTriangle, AlertCircle, Shield, ChevronRight, Info } from 'lucide-react'
import type { NewsItem } from '../types.ts'

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'now'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

const levelIcon: Record<string, React.ReactNode> = {
    CRITICAL: <AlertTriangle size={9} strokeWidth={2.5} />,
    HIGH: <AlertCircle size={9} strokeWidth={2.5} />,
    MEDIUM: <Shield size={9} strokeWidth={2} />,
    LOW: <ChevronRight size={9} strokeWidth={2} />,
    INFO: <Info size={9} strokeWidth={1.5} />,
}

interface Props {
    items: NewsItem[]
    loading: boolean
    error: string | null
    count?: number
}

export function NewsPanel({ items, loading, error, count }: Props) {
    if (loading && !items.length) {
        return (
            <div className="panel-body">
                <div className="loading-state">
                    <div className="spinner" />
                    FETCHING FEEDS...
                </div>
            </div>
        )
    }
    if (error && !items.length) {
        return <div className="panel-body"><div className="error-state"><AlertTriangle size={11} /> {error}</div></div>
    }
    if (!items.length) {
        return <div className="panel-body"><div className="empty-state">NO DATA</div></div>
    }

    const shown = count ? items.slice(0, count) : items

    return (
        <div className="panel-body">
            {/* Column header row */}
            <div className="col-header" style={{ display: 'grid', gridTemplateColumns: '68px 1fr 100px 52px 54px 16px', gap: 8, padding: '3px 12px', alignItems: 'center' }}>
                <span>LEVEL</span>
                <span>HEADLINE</span>
                <span style={{ textAlign: 'right' }}>SOURCE</span>
                <span style={{ textAlign: 'right' }}>TIME</span>
                <span style={{ textAlign: 'right' }}>CATEGORY</span>
                <span />
            </div>

            {shown.map((item, i) => (
                <a
                    key={i}
                    className="news-item"
                    href={item.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ gridTemplateColumns: '68px 1fr 100px 52px 54px 16px', gap: 8, animationDelay: `${Math.min(i * 8, 200)}ms` }}
                >
                    <span className={`badge badge-${item.level}`}>
                        {levelIcon[item.level]}
                        {item.level}
                    </span>
                    <span className="news-title">{item.title}</span>
                    <span className="news-source" style={{ textAlign: 'right' }}>{item.source}</span>
                    <span className="news-time">{timeAgo(item.publishedAt)}</span>
                    <span className="news-category">{item.category}</span>
                    {item.url
                        ? <ExternalLink size={9} className="news-ext" />
                        : <span />
                    }
                </a>
            ))}
        </div>
    )
}
