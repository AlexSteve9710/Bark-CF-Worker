import type { CommonResp } from './types'

export function success(): CommonResp {
  return { code: 200, message: 'success', timestamp: now() }
}

export function failed(code: number, message: string): CommonResp {
  return { code, message, timestamp: now() }
}

export function data<T>(payload: T): CommonResp {
  return { code: 200, message: 'success', data: payload, timestamp: now() }
}

export function now(): number {
  return Math.floor(Date.now() / 1000)
}

export function generateUUID(): string {
  return crypto.randomUUID()
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function signJWT(
  privateKeyPem: string,
  keyID: string,
  teamID: string
): Promise<string> {
  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const keyBytes = base64urlToBytes(pemBody)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const header = { alg: 'ES256', kid: keyID }
  const claims = { iss: teamID, iat: now() }

  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)))
  const claimsB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)))
  const signingInput = `${headerB64}.${claimsB64}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = base64url(signature)
  return `${signingInput}.${sigB64}`
}
