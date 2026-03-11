import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import newsRouter from './routes/news.js'
import marketsRouter from './routes/markets.js'
import weatherRouter from './routes/weather.js'
import intelRouter from './routes/intel.js'

const app = new Hono().basePath('/api')

// CORS — allow Vite dev server + any Vercel deploy
const allowedOrigins = (process.env.FRONTEND_URL ?? '').split(',').filter(Boolean)
app.use(
    '*',
    cors({
        origin: (origin) => {
            if (!origin) return '*'
            if (allowedOrigins.length === 0) return origin // dev: allow all
            if (allowedOrigins.some((o) => origin.startsWith(o.trim()))) return origin
            if (origin.includes('localhost') || origin.includes('vercel.app')) return origin
            return origin // allow by default — tighten in production if needed
        },
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
    })
)

app.use('*', logger())

app.get('/', (c) => c.json({ name: 'blossom-api', version: '1.0.0', status: 'ok' }))

app.route('/news', newsRouter)
app.route('/markets', marketsRouter)
app.route('/weather', weatherRouter)
app.route('/intel', intelRouter)

export default app
