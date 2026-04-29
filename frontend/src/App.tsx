import { useState, useEffect } from 'react'
import {
  Globe, TrendingUp, MapPin, Brain, Scan,
  AlertTriangle, RefreshCw, Settings as SettingsIcon,
  Wifi, WifiOff,
} from 'lucide-react'
import { useSettings } from './hooks/useSettings.ts'
import { useDashboard } from './hooks/useDashboard.ts'
import { NewsPanel } from './components/NewsPanel.tsx'
import { MarketsPanel } from './components/MarketsPanel.tsx'
import { LocalPanel } from './components/LocalPanel.tsx'
import { IntelPanel } from './components/IntelPanel.tsx'
import { ScreenerPanel } from './components/ScreenerPanel.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import './index.css'

type TabId = 'news' | 'markets' | 'local' | 'intel' | 'screener'

const TABS: Array<{ id: TabId; label: string; fkey: string; icon: React.ReactNode }> = [
  { id: 'news', label: 'GLOBAL NEWS', fkey: 'F1', icon: <Globe size={11} /> },
  { id: 'markets', label: 'MARKETS', fkey: 'F2', icon: <TrendingUp size={11} /> },
  { id: 'local', label: 'LOCAL', fkey: 'F3', icon: <MapPin size={11} /> },
  { id: 'intel', label: 'INTEL BRIEF', fkey: 'F4', icon: <Brain size={11} /> },
  { id: 'screener', label: 'SMART MONEY', fkey: 'F6', icon: <Scan size={11} /> },
]

export default function App() {
  const { settings, save } = useSettings()
  const { state, fetchData, fetchIntel, fetchScreener, fetchDeepDive } = useDashboard(settings)
  const [activeTab, setActiveTab] = useState<TabId>('news')
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (
      settings.enableIntelBrief &&
      state.globalNews.length > 0 &&
      state.localNews.length > 0 &&
      !state.intel &&
      !state.loading.intel &&
      !state.errors.intel
    ) {
      fetchIntel(state.globalNews, state.localNews)
    }
  }, [state.globalNews.length, state.localNews.length, settings.enableIntelBrief]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'F1') { e.preventDefault(); setActiveTab('news') }
      if (e.key === 'F2') { e.preventDefault(); setActiveTab('markets') }
      if (e.key === 'F3') { e.preventDefault(); setActiveTab('local') }
      if (e.key === 'F4') { e.preventDefault(); setActiveTab('intel') }
      if (e.key === 'F5') { e.preventDefault(); fetchData() }
      if (e.key === 'F6') { e.preventDefault(); setActiveTab('screener') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fetchData])

  const criticalCount = state.globalNews.filter((n) => n.level === 'CRITICAL').length
  const isRefreshing = state.loading.globalNews || state.loading.markets

  const tabCount: Record<TabId, number | null> = {
    news: state.globalNews.length || null,
    markets: state.markets ? (state.markets.indices.length + state.markets.commodities.length) : null,
    local: state.localNews.length || null,
    intel: state.intel ? state.intel.sectorRisks?.length : null,
    screener: state.screener ? state.screener.watchlist.length : null,
  }

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <>
      {/* ── Bloomberg orange header bar ───────────────────────────────── */}
      <div className="titlebar">
        <div className="titlebar-logo">
          <span className="logo-dot" />
          BLOSSOM
        </div>

        <div className="titlebar-sep" />
        <span className="titlebar-path">INTELLIGENCE TERMINAL</span>

        {criticalCount > 0 && (
          <>
            <div className="titlebar-sep" />
            <span className="titlebar-alert">
              <AlertTriangle size={9} />
              {criticalCount} CRITICAL
            </span>
          </>
        )}

        <div className="titlebar-spacer" />

        <div className="titlebar-right">
          <span className="titlebar-loc">
            <MapPin size={9} />
            {settings.city.toUpperCase()}
          </span>
          <div className="titlebar-sep" />
          <span className="titlebar-clock">
            {isRefreshing
              ? <WifiOff size={9} style={{ display: 'inline', marginRight: 3 }} />
              : <Wifi size={9} style={{ display: 'inline', marginRight: 3 }} />
            }
            {fmtTime(now)}
          </span>
          <div className="titlebar-sep" />
          <button className="titlebar-btn" onClick={fetchData} title="F5 REFRESH" disabled={isRefreshing}>
            <RefreshCw size={9} className={isRefreshing ? 'spin-icon' : ''} />
            F5
          </button>
          <button className="titlebar-btn" onClick={() => setShowSettings(true)} title="SETTINGS">
            <SettingsIcon size={9} />
            CFG
          </button>
        </div>
      </div>

      {/* ── Function key tab bar ─────────────────────────────────────── */}
      <div className="tabbar">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          const loading =
            (tab.id === 'news' && state.loading.globalNews) ||
            (tab.id === 'markets' && state.loading.markets) ||
            (tab.id === 'local' && (state.loading.localNews || state.loading.weather)) ||
            (tab.id === 'intel' && state.loading.intel) ||
            (tab.id === 'screener' && state.loading.screener)

          return (
            <button
              key={tab.id}
              className={`tab ${isActive ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {isActive && <span className="tab-indicator" />}
              <span className="tab-inner">
                <span className="tab-fkey">{tab.fkey}</span>
                {tab.icon}
                <span className="tab-label">{tab.label}</span>
                {loading
                  ? <span className="tab-spinner" />
                  : tabCount[tab.id] !== null
                    ? <span className="tab-count">{tabCount[tab.id]}</span>
                    : null
                }
              </span>
            </button>
          )
        })}

        <div className="tabbar-spacer" />

        {/* Live IHSG + IDR in tab bar */}
        {state.markets && (() => {
          const ihsg = state.markets.indices.find(i => i.name === 'IHSG')
          const idr  = state.markets.indices.find(i => i.name === 'USD/IDR')
          return (
            <div className="tabbar-status">
              {ihsg && (
                <span className="tabbar-stat-item">
                  <span style={{ color: 'var(--bb-orange)', fontWeight: 700 }}>IHSG</span>
                  <span style={{ color: 'var(--bb-white)', fontWeight: 600 }}>
                    {Math.round(ihsg.price).toLocaleString('id-ID')}
                  </span>
                  <span style={{ color: ihsg.changePct >= 0 ? 'var(--bb-up)' : 'var(--bb-down)' }}>
                    {ihsg.changePct >= 0 ? '▲' : '▼'}{Math.abs(ihsg.changePct).toFixed(2)}%
                  </span>
                </span>
              )}
              {idr && (
                <span className="tabbar-stat-item">
                  <span style={{ color: 'var(--bb-orange)', fontWeight: 700 }}>IDR</span>
                  <span style={{ color: 'var(--bb-white)', fontWeight: 600 }}>
                    {Math.round(idr.price).toLocaleString('id-ID')}
                  </span>
                  <span style={{ color: idr.changePct >= 0 ? 'var(--bb-down)' : 'var(--bb-up)' }}>
                    {idr.changePct >= 0 ? '▲' : '▼'}{Math.abs(idr.changePct).toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
          )
        })()}

        {state.lastUpdated && (
          <span className="tabbar-updated">
            {fmtTime(state.lastUpdated)}
          </span>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <main className="tab-content">
        {activeTab === 'news' && (
          <div className="tab-pane tab-pane-news">
            <NewsPanel items={state.globalNews} loading={state.loading.globalNews} error={state.errors.globalNews} />
          </div>
        )}
        {activeTab === 'markets' && (
          <div className="tab-pane">
            <MarketsPanel data={state.markets} loading={state.loading.markets} error={state.errors.markets} />
          </div>
        )}
        {activeTab === 'local' && (
          <div className="tab-pane">
            <LocalPanel
              weather={state.weather}
              localNews={state.localNews}
              loadingWeather={state.loading.weather}
              loadingNews={state.loading.localNews}
              errorWeather={state.errors.weather}
              errorNews={state.errors.localNews}
              city={settings.city}
            />
          </div>
        )}
        {activeTab === 'intel' && (
          <div className="tab-pane">
            <IntelPanel
              intel={state.intel}
              loading={state.loading.intel}
              error={state.errors.intel}
              globalNews={state.globalNews}
              localNews={state.localNews}
              onFetchIntel={fetchIntel}
              enabled={settings.enableIntelBrief}
            />
          </div>
        )}
        {activeTab === 'screener' && (
          <div className="tab-pane">
            <ScreenerPanel
              screener={state.screener}
              loading={state.loading.screener}
              error={state.errors.screener}
              onFetchScreener={fetchScreener}
              deepdive={state.deepdive}
              loadingDeepDive={state.loading.deepdive}
              errorDeepDive={state.errors.deepdive}
              onFetchDeepDive={fetchDeepDive}
            />
          </div>
        )}
      </main>

      {showSettings && (
        <SettingsModal settings={settings} onSave={save} onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
