import type { Context, Hono } from 'hono'
import type { Database, Env, PushParams } from '../types'
import { push as apnsPush } from '../apns'
import { data, failed, success } from '../utils'

let maxBatchPushCount = -1

export function setMaxBatchPushCount(count: number): void {
  maxBatchPushCount = count
}

export function registerPushRoutes(app: Hono<{ Bindings: Env }>, db: Database, privateKey: string): void {
  app.post('/push', (c) => pushDispatch(c, db, privateKey))

  app.get('/:device_key', (c) => pushDispatch(c, db, privateKey))
  app.post('/:device_key', (c) => pushDispatch(c, db, privateKey))
  app.get('/:device_key/:body', (c) => pushDispatch(c, db, privateKey))
  app.post('/:device_key/:body', (c) => pushDispatch(c, db, privateKey))
  app.get('/:device_key/:title/:body', (c) => pushDispatch(c, db, privateKey))
  app.post('/:device_key/:title/:body', (c) => pushDispatch(c, db, privateKey))
  app.get('/:device_key/:title/:subtitle/:body', (c) => pushDispatch(c, db, privateKey))
  app.post('/:device_key/:title/:subtitle/:body', (c) => pushDispatch(c, db, privateKey))
}

async function pushDispatch(c: Context<{ Bindings: Env }>, db: Database, privateKey: string): Promise<Response> {
  const contentType = c.req.header('Content-Type') || ''
  if (contentType.includes('application/json')) {
    return pushV2(c, db, privateKey)
  }
  return pushV1(c, db, privateKey)
}

async function pushV1(c: Context<{ Bindings: Env }>, db: Database, privateKey: string): Promise<Response> {
  const params: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(c.req.query())) {
    params[key.toLowerCase()] = value
  }

  if (c.req.method === 'POST') {
    const contentType = c.req.header('Content-Type') || ''
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody()
      for (const [key, val] of Object.entries(body)) {
        if (typeof val === 'string') {
          params[key.toLowerCase()] = val
        }
      }
    }
  }

  const pathDeviceKey = c.req.param('device_key')
  const pathTitle = c.req.param('title')
  const pathSubtitle = c.req.param('subtitle')
  const pathBody = c.req.param('body')

  if (pathDeviceKey) params['device_key'] = decodeURIComponent(pathDeviceKey)
  if (pathSubtitle) params['subtitle'] = decodeURIComponent(pathSubtitle)
  if (pathTitle) params['title'] = decodeURIComponent(pathTitle)
  if (pathBody) params['body'] = decodeURIComponent(pathBody)

  return doPush(params as PushParams, db, privateKey, c)
}

async function pushV2(c: Context<{ Bindings: Env }>, db: Database, privateKey: string): Promise<Response> {
  let params: Record<string, unknown> = {}
  try {
    params = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json(failed(400, 'request bind failed'), 400)
  }

  for (const [key, value] of Object.entries(c.req.query())) {
    params[key.toLowerCase()] = value
  }

  const pathDeviceKey = c.req.param('device_key')
  const pathTitle = c.req.param('title')
  const pathSubtitle = c.req.param('subtitle')
  const pathBody = c.req.param('body')

  if (pathDeviceKey) params['device_key'] = decodeURIComponent(pathDeviceKey)
  if (pathSubtitle) params['subtitle'] = decodeURIComponent(pathSubtitle)
  if (pathTitle) params['title'] = decodeURIComponent(pathTitle)
  if (pathBody) params['body'] = decodeURIComponent(pathBody)

  let deviceKeys: string[] = []
  if (params['device_keys']) {
    const keys = params['device_keys']
    if (typeof keys === 'string') {
      deviceKeys = keys.split(',').map((k) => k.trim()).filter(Boolean)
    } else if (Array.isArray(keys)) {
      deviceKeys = keys.map((k) => String(k))
    }
    delete params['device_keys']
  }

  if (deviceKeys.length === 0) {
    return doPush(params as PushParams, db, privateKey, c)
  }

  if (maxBatchPushCount !== -1 && deviceKeys.length > maxBatchPushCount) {
    return c.json(failed(400, `batch push count exceeds the maximum limit: ${maxBatchPushCount}`), 400)
  }

  const results = await Promise.all(
    deviceKeys.map(async (deviceKey) => {
      const newParams = { ...params, device_key: deviceKey } as PushParams
      const code = await performPush(newParams, db, privateKey)
      return { code, device_key: deviceKey }
    })
  )

  return c.json(data(results))
}

async function doPush(
  params: PushParams,
  db: Database,
  privateKey: string,
  c: Context
): Promise<Response> {
  const code = await performPush(params, db, privateKey)
  if (code === 200) {
    return c.json(success())
  }
  return c.json(failed(code, 'push failed'), 500)
}

async function performPush(
  params: PushParams,
  db: Database,
  privateKey: string
): Promise<number> {
  const deviceKey = params.device_key
  if (!deviceKey) return 400

  let hasAlert = false
  if (params.title) hasAlert = true
  if (params.body) hasAlert = true
  if (params.markdown) {
    params.body = params.markdown
    hasAlert = true
  }
  if (params.subtitle) hasAlert = true

  if (!hasAlert) {
    params.body = 'Empty Message'
  }

  let deviceToken: string
  try {
    deviceToken = await db.deviceTokenByKey(deviceKey)
  } catch (err) {
    return 400
  }

  if (params.sound && !params.sound.endsWith('.caf')) {
    params.sound = params.sound + '.caf'
  }

  const { code, reason } = await apnsPush(deviceToken, params, privateKey)

  if (code === 410 || (code === 400 && reason?.includes('BadDeviceToken'))) {
    await db.saveDeviceTokenByKey(deviceKey, '')
  }

  if (code !== 200) {
    console.error(`APNs push failed: ${code} ${reason}`)
    return 500
  }

  return 200
}
