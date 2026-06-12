import type { Context, Hono } from 'hono'
import type { Database, Env, DeviceInfo } from '../types'
import { data, failed, success } from '../utils'

async function handleRegister(
  c: Context,
  db: Database,
  deviceKey: string,
  deviceToken: string
): Promise<Response> {
  if (!deviceToken) {
    return c.json(failed(400, 'device token is empty'), 400)
  }

  if (deviceToken.length > 160) {
    return c.json(failed(400, 'device token is invalid'), 400)
  }

  try {
    const newKey = await db.saveDeviceTokenByKey(deviceKey, deviceToken)
    return c.json(
      data({
        key: newKey,
        device_key: newKey,
        device_token: deviceToken,
      })
    )
  } catch (err) {
    return c.json(failed(500, `device registration failed: ${err}`), 500)
  }
}

export function registerDeviceRoutes(app: Hono<{ Bindings: Env }>, db: Database): void {
  app.post('/register', async (c) => {
    let body: DeviceInfo
    try {
      body = await c.req.json<DeviceInfo>()
    } catch {
      return c.json(failed(400, 'request bind failed'), 400)
    }
    const deviceKey = body.device_key || body.key || ''
    const deviceToken = body.device_token || body.devicetoken || ''
    return handleRegister(c, db, deviceKey, deviceToken)
  })

  app.get('/register', async (c) => {
    const deviceKey = c.req.query('device_key') || c.req.query('key') || ''
    const deviceToken = c.req.query('device_token') || c.req.query('devicetoken') || ''
    return handleRegister(c, db, deviceKey, deviceToken)
  })

  app.get('/register/:device_key', async (c) => {
    const deviceKey = c.req.param('device_key')
    if (!deviceKey) {
      return c.json(failed(400, 'device key is empty'), 400)
    }
    try {
      await db.deviceTokenByKey(deviceKey)
      return c.json(success())
    } catch (err) {
      return c.json(failed(400, String(err)), 400)
    }
  })
}
