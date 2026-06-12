import type { Database } from './types'
import { generateUUID } from './utils'

const KEY_PREFIX = 'device:'
const COUNT_KEY = '_count'

export function createKVStore(kv: KVNamespace): Database {
  async function getCount(): Promise<number> {
    const val = await kv.get(COUNT_KEY)
    return val ? parseInt(val, 10) : 0
  }

  async function setCount(n: number): Promise<void> {
    await kv.put(COUNT_KEY, String(n))
  }

  return {
    async countAll(): Promise<number> {
      return getCount()
    },

    async deviceTokenByKey(key: string): Promise<string> {
      const token = await kv.get(KEY_PREFIX + key)
      if (!token) throw new Error('device key not found')
      return token
    },

    async saveDeviceTokenByKey(key: string, token: string): Promise<string> {
      if (!key) {
        key = generateUUID()
      }

      if (token === '') {
        await kv.delete(KEY_PREFIX + key)
        const c = await getCount()
        if (c > 0) await setCount(c - 1)
        return key
      }

      const existing = await kv.get(KEY_PREFIX + key)
      await kv.put(KEY_PREFIX + key, token)

      if (!existing) {
        const c = await getCount()
        await setCount(c + 1)
      }

      return key
    },

    async deleteDeviceByKey(key: string): Promise<void> {
      const existing = await kv.get(KEY_PREFIX + key)
      if (existing) {
        await kv.delete(KEY_PREFIX + key)
        const c = await getCount()
        if (c > 0) await setCount(c - 1)
      }
    },
  }
}

export function createEnvStore(env: { BARK_KEY?: string; BARK_DEVICE_TOKEN?: string }): Database {
  const barkKey = env.BARK_KEY || ''
  const barkToken = env.BARK_DEVICE_TOKEN || ''

  return {
    async countAll(): Promise<number> {
      return barkKey && barkToken ? 1 : 0
    },

    async deviceTokenByKey(key: string): Promise<string> {
      if (key === barkKey) return barkToken
      throw new Error('key not found')
    },

    async saveDeviceTokenByKey(key: string, token: string): Promise<string> {
      if (token === barkToken) return barkKey
      throw new Error('device token is invalid')
    },

    async deleteDeviceByKey(_key: string): Promise<void> {
      throw new Error('not supported')
    },
  }
}
