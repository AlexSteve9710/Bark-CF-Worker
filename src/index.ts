import { Hono } from 'hono'
import type { Env } from './types'
import { createKVStore, createEnvStore } from './db'
import { basicAuth } from './middleware/auth'
import { registerMiscRoutes } from './routes/misc'
import { registerDeviceRoutes } from './routes/register'
import { registerPushRoutes, setMaxBatchPushCount } from './routes/push'
import { registerMCPRoutes } from './routes/mcp'

function getPrivateKey(): string {
  return '-----BEGIN PRIVATE KEY-----\n' +
    'MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg4vtC3g5L5HgKGJ2+\n' +
    'T1eA0tOivREvEAY2g+juRXJkYL2gCgYIKoZIzj0DAQehRANCAASmOs3JkSyoGEWZ\n' +
    'sUGxFs/4pw1rIlSV2IC19M8u3G5kq36upOwyFWj9Gi3Ejc9d3sC7+SHRqXrEAJow\n' +
    '8/7tRpV+\n' +
    '-----END PRIVATE KEY-----'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>()

    const db = env.BARK_KEY && env.BARK_DEVICE_TOKEN
      ? createEnvStore(env)
      : createKVStore(env.BARK_KV)

    const authUser = env.AUTH_USER || ''
    const authPass = env.AUTH_PASS || ''
    const privateKey = getPrivateKey()

    const maxBatch = parseInt(env.MAX_BATCH_PUSH_COUNT || '-1', 10)
    if (maxBatch > 0) {
      setMaxBatchPushCount(maxBatch)
    }

    app.use('*', basicAuth(authUser, authPass))

    registerMiscRoutes(app, db)
    registerDeviceRoutes(app, db)
    registerPushRoutes(app, db, privateKey)
    registerMCPRoutes(app, db, privateKey)

    return app.fetch(request, env)
  },
}
