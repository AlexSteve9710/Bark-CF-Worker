import type { Hono } from 'hono'
import type { Database, Env } from '../types'
import { success, now } from '../utils'

const VERSION = '3.0.0'
const BUILD_DATE = '2025-06-11'
const COMMIT_ID = 'cf-worker'

export function registerMiscRoutes(app: Hono<{ Bindings: Env }>, db: Database): void {
  app.get('/', (c) => c.text('ok'))

  app.get('/ping', (c) => {
    return c.json({ code: 200, message: 'pong', timestamp: now() })
  })

  app.get('/healthz', (c) => c.text('ok'))

  app.get('/info', async (c) => {
    const devices = await db.countAll()
    return c.json({
      version: VERSION,
      build: BUILD_DATE,
      arch: 'cloudflare-workers',
      commit: COMMIT_ID,
      devices,
    })
  })
}
