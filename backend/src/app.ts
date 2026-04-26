import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import newsRouter from './routes/news.ts'
import marketsRouter from './routes/markets.ts'
import weatherRouter from './routes/weather.ts'
import intelRouter from './routes/intel.ts'
import screenerRouter from './routes/screener.ts'
import deepdiveRouter from './routes/deepdive.ts'

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

// Ensure all unhandled errors return JSON (prevents empty reply to Vite proxy)
app.onError((err, c) => {
    console.error('[app.onError]', err)
    return c.json({ error: err.message ?? String(err) }, 500)
})

app.get('/', (c) => c.json({ name: 'blossom-api', version: '1.0.0', status: 'ok' }))

app.route('/news', newsRouter)
app.route('/markets', marketsRouter)
app.route('/weather', weatherRouter)
app.route('/intel', intelRouter)
app.route('/screener', screenerRouter)
app.route('/deepdive', deepdiveRouter)

export default app
