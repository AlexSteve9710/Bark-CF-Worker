import type { PushParams } from './types'
import { signJWT } from './utils'

const TOPIC = 'me.fin.bark'
const KEY_ID = 'LH4T9V5U4R'
const TEAM_ID = '5U8LBRXG3A'
const APNS_URL = 'https://api.push.apple.com/3/device'

let cachedJWT: string | null = null
let jwtExpiry = 0

async function getJWT(privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJWT && now < jwtExpiry) {
    return cachedJWT
  }
  cachedJWT = await signJWT(privateKey, KEY_ID, TEAM_ID)
  jwtExpiry = now + 3000
  return cachedJWT
}

interface APNsNotification {
  aps: {
    alert?: {
      title?: string
      subtitle?: string
      body?: string
    }
    sound?: string
    badge?: number
    category?: string
    'mutable-content'?: number
    'content-available'?: number
    'thread-id'?: string
  }
  [key: string]: unknown
}

export async function push(
  deviceToken: string,
  params: PushParams,
  privateKey: string
): Promise<{ code: number; reason?: string }> {
  const isDelete = params['delete'] === '1' || params['delete'] === 1

  const notification: APNsNotification = { aps: {} }

  if (isDelete) {
    notification.aps['content-available'] = 1
  } else {
    notification.aps.alert = {}
    if (params.title) notification.aps.alert.title = String(params.title)
    if (params.subtitle) notification.aps.alert.subtitle = String(params.subtitle)
    if (params.body) notification.aps.alert.body = String(params.body)

    notification.aps.sound = params.sound || '1107.caf'
    notification.aps.category = 'myNotificationCategory'
    notification.aps['mutable-content'] = 1

    if (params.group) {
      notification.aps['thread-id'] = String(params.group)
    }
  }

  const knownKeys = new Set([
    'id', 'device_key', 'device_keys', 'title', 'subtitle', 'body',
    'sound', 'level', 'volume', 'badge', 'call', 'icon', 'image',
    'group', 'isArchive', 'ttl', 'url', 'copy', 'markdown', 'delete',
  ])

  for (const [k, v] of Object.entries(params)) {
    const key = k.toLowerCase()
    if (!knownKeys.has(key) && v !== undefined && v !== null) {
      notification[key] = v
    }
  }

  const jwt = await getJWT(privateKey)
  const pushType = isDelete ? 'background' : 'alert'

  const headers: Record<string, string> = {
    'authorization': `bearer ${jwt}`,
    'apns-topic': TOPIC,
    'apns-push-type': pushType,
    'apns-expiration': '0',
    'content-type': 'application/json',
  }

  if (params.id) {
    headers['apns-collapse-id'] = params.id
  }

  try {
    const resp = await fetch(`${APNS_URL}/${deviceToken}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(notification),
    })

    if (resp.status === 200) {
      return { code: 200 }
    }

    const body = await resp.text()
    let reason = body
    try {
      const json = JSON.parse(body) as { reason?: string }
      reason = json.reason || body
    } catch { /* use raw body */ }

    return { code: resp.status, reason }
  } catch (err) {
    return { code: 500, reason: String(err) }
  }
}
