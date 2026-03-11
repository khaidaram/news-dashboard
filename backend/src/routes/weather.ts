import { Hono } from 'hono'
import { cacheGet, cacheSet, TTL } from '../services/cache.js'

const router = new Hono()

// WMO weather code to emoji + description
function wmoToEmoji(code: number, isDay: boolean): [string, string] {
    if (code === 0) return isDay ? ['☀️', 'Clear sky'] : ['🌙', 'Clear night']
    if (code === 1) return ['🌤️', 'Mainly clear']
    if (code === 2) return ['⛅', 'Partly cloudy']
    if (code === 3) return ['☁️', 'Overcast']
    if (code >= 45 && code <= 48) return ['🌫️', 'Fog']
    if (code >= 51 && code <= 57) return ['🌦️', 'Drizzle']
    if (code >= 61 && code <= 67) return ['🌧️', 'Rain']
    if (code >= 71 && code <= 77) return ['❄️', 'Snow']
    if (code >= 80 && code <= 82) return ['🌧️', 'Rain showers']
    if (code === 95) return ['⛈️', 'Thunderstorm']
    if (code >= 96 && code <= 99) return ['⛈️', 'Thunderstorm with hail']
    return ['🌡️', 'Unknown']
}

function windDir(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(deg / 45) % 8]
}

router.get('/', async (c) => {
    const lat = parseFloat(c.req.query('lat') ?? '0')
    const lon = parseFloat(c.req.query('lon') ?? '0')
    const city = c.req.query('city') ?? 'Unknown'

    if (!lat && !lon) return c.json({ error: 'lat and lon required' }, 400)

    const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`
    const cached = cacheGet<object>(cacheKey)
    if (cached) return c.json(cached)

    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,uv_index,visibility` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto&forecast_days=7`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
        const raw: {
            current: {
                temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number;
                is_day: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number;
                uv_index: number; visibility: number;
            }
            daily: {
                time: string[]; weather_code: number[]; temperature_2m_max: number[];
                temperature_2m_min: number[]; precipitation_sum: number[];
            }
        } = await res.json()

        const c_ = raw.current
        const [icon, description] = wmoToEmoji(c_.weather_code, c_.is_day === 1)
        const conditions = {
            city,
            tempC: c_.temperature_2m,
            feelsLikeC: c_.apparent_temperature,
            humidity: c_.relative_humidity_2m,
            windSpeedKmh: c_.wind_speed_10m,
            windDirection: windDir(c_.wind_direction_10m),
            description,
            icon,
            visibility: c_.visibility,
            uvIndex: c_.uv_index,
            isDay: c_.is_day === 1,
        }

        const forecast = raw.daily.time.slice(0, 7).map((dateStr, i) => {
            const [ico, desc] = wmoToEmoji(raw.daily.weather_code[i], true)
            return {
                date: dateStr,
                maxTempC: raw.daily.temperature_2m_max[i],
                minTempC: raw.daily.temperature_2m_min[i],
                rainMM: raw.daily.precipitation_sum[i] ?? 0,
                icon: ico,
                desc,
            }
        })

        const data = { conditions, forecast, fetchedAt: new Date().toISOString() }
        cacheSet(cacheKey, data, TTL.WEATHER)
        return c.json(data)
    } catch (e) {
        return c.json({ error: String(e) }, 500)
    }
})

export default router
