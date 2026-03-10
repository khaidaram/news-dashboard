import { handle } from 'hono/vercel'
import app from '../src/app.ts'

// Tell Vercel to use Node.js runtime (not Edge) — required for rss-parser
export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
}

export default handle(app)
