export interface CommonResp {
  code: number
  message: string
  data?: unknown
  timestamp: number
}

export interface PushParams {
  id?: string
  device_key?: string
  device_keys?: string | string[]
  title?: string
  subtitle?: string
  body?: string
  sound?: string
  level?: string
  volume?: number
  badge?: number
  call?: string
  icon?: string
  image?: string
  group?: string
  isArchive?: string
  ttl?: number
  url?: string
  copy?: string
  markdown?: string
  [key: string]: unknown
}

export interface DeviceInfo {
  device_key?: string
  device_token?: string
  key?: string
  devicetoken?: string
}

export interface Database {
  countAll(): Promise<number>
  deviceTokenByKey(key: string): Promise<string>
  saveDeviceTokenByKey(key: string, token: string): Promise<string>
  deleteDeviceByKey(key: string): Promise<void>
}

export interface Env {
  BARK_KV: KVNamespace
  BARK_KEY?: string
  BARK_DEVICE_TOKEN?: string
  AUTH_USER?: string
  AUTH_PASS?: string
  MAX_BATCH_PUSH_COUNT?: string
}
