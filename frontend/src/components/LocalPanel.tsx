import { Droplets, Wind, Eye, Thermometer, Sun, Cloud } from 'lucide-react'
import type { WeatherData, NewsItem } from '../types.ts'
import { NewsPanel } from './NewsPanel.tsx'

function fmt1(n: unknown): string {
    return typeof n === 'number' ? n.toFixed(1) : '—'
}

interface Props {
    weather: WeatherData | null
    localNews: NewsItem[]
    loadingWeather: boolean
    loadingNews: boolean
    errorWeather: string | null
    errorNews: string | null
    city: string
}

export function LocalPanel({ weather, localNews, loadingWeather, loadingNews, errorWeather, errorNews, city }: Props) {
    return (
        <div className="panel-body">
            {/* Weather block */}
            {loadingWeather && !weather ? (
                <div className="loading-state"><div className="spinner" />FETCHING WEATHER...</div>
            ) : weather?.conditions ? (
                <>
                    <div className="weather-current">
                        <div className="weather-icon-main">{weather.conditions.icon}</div>
                        <div className="weather-main-data">
                            <div className="weather-temp">{fmt1(weather.conditions.tempC)}°C</div>
                            <div className="weather-feels">
                                <Thermometer size={9} />FEELS {fmt1(weather.conditions.feelsLikeC)}°C
                            </div>
                            <div className="weather-desc">{String(weather.conditions.description).toUpperCase()}</div>
                        </div>
                        <div className="weather-stats-grid">
                            <div className="weather-stat-cell">
                                <div className="ws-label">HUMIDITY</div>
                                <div className="ws-value"><Droplets size={10} />{weather.conditions.humidity}%</div>
                            </div>
                            <div className="weather-stat-cell">
                                <div className="ws-label">WIND</div>
                                <div className="ws-value"><Wind size={10} />{fmt1(weather.conditions.windSpeedKmh)} km/h {weather.conditions.windDirection}</div>
                            </div>
                            <div className="weather-stat-cell">
                                <div className="ws-label">UV INDEX</div>
                                <div className="ws-value"><Sun size={10} />{fmt1(weather.conditions.uvIndex)}</div>
                            </div>
                            <div className="weather-stat-cell">
                                <div className="ws-label">VISIBILITY</div>
                                <div className="ws-value">
                                    <Eye size={10} />
                                    {weather.conditions.visibility >= 1000
                                        ? `${(weather.conditions.visibility / 1000).toFixed(0)} km`
                                        : `${weather.conditions.visibility} m`}
                                </div>
                            </div>
                        </div>
                    </div>

                    {weather.forecast.length > 0 && (
                        <div className="weather-forecast">
                            {weather.forecast.slice(0, 7).map((day, i) => {
                                const d = new Date(day.date)
                                const label = i === 0
                                    ? 'TODAY'
                                    : d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()
                                return (
                                    <div key={i} className="forecast-day">
                                        <div className="forecast-date">{label}</div>
                                        <div className="forecast-icon">{day.icon}</div>
                                        <div className="forecast-temps">
                                            <div className="forecast-high">{Math.round(day.maxTempC)}°</div>
                                            <div className="forecast-low">{Math.round(day.minTempC)}°</div>
                                            {day.rainMM > 0 && (
                                                <div style={{ color: 'var(--bb-cyan)', fontSize: 8 }}>{day.rainMM.toFixed(0)}mm</div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            ) : errorWeather ? (
                <div className="error-state"><Cloud size={11} /> WEATHER UNAVAILABLE</div>
            ) : null}

            {/* Local news */}
            <div className="local-news-header">LOCAL NEWS — {city.toUpperCase()}</div>
            <NewsPanel items={localNews} loading={loadingNews} error={errorNews} count={30} />
        </div>
    )
}
