import type { Context, Hono } from 'hono'
import type { Database, Env, PushParams } from '../types'
import { push as apnsPush } from '../apns'

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
      default?: unknown
      minimum?: number
      maximum?: number
    }>
    required: string[]
  }
}

function getCommonToolSchema(): ToolDef['inputSchema'] {
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Notification title' },
      subtitle: { type: 'string', description: 'Notification subtitle' },
      body: { type: 'string', description: 'Notification content' },
      markdown: { type: 'string', description: 'Basic Markdown notification content. Overrides body.' },
      level: {
        type: 'string',
        description: 'Notification level',
        enum: ['critical', 'active', 'timeSensitive', 'passive'],
      },
      volume: {
        type: 'number',
        description: 'Alert volume for important notification',
        default: 5,
        minimum: 0,
        maximum: 10,
      },
      badge: { type: 'number', description: 'Badge number' },
      call: { type: 'string', description: "Set to '1' to repeat the notification ringtone" },
      sound: { type: 'string', description: 'Notification sound' },
      icon: { type: 'string', description: 'Notification icon URL' },
      image: { type: 'string', description: 'Notification image URL' },
      group: { type: 'string', description: 'Notification group' },
      isArchive: { type: 'string', description: "Set to '1' to save the notification or any other value to skip saving" },
      ttl: { type: 'number', description: 'Time to live in seconds for archived messages; expired items are automatically deleted' },
      url: { type: 'string', description: 'Click action URL' },
      copy: { type: 'string', description: 'Text to copy on copy action' },
    },
    required: [],
  }
}

export function registerMCPRoutes(app: Hono<{ Bindings: Env }>, db: Database, privateKey: string): void {
  const genericTools: ToolDef[] = [{
    name: 'notify',
    description: 'Send a notification to a device via Bark',
    inputSchema: {
      ...getCommonToolSchema(),
      properties: {
        ...getCommonToolSchema().properties,
        device_key: { type: 'string', description: 'Device Key' },
      },
      required: ['device_key'],
    },
  }]

  const specificTools: ToolDef[] = [{
    name: 'notify',
    description: 'Send a notification to a device via Bark',
    inputSchema: getCommonToolSchema(),
  }]

  app.all('/mcp', async (c) => handleMCP(c, db, privateKey, genericTools))
  app.all('/mcp/:device_key', async (c) => handleMCP(c, db, privateKey, specificTools, c.req.param('device_key')))
}

async function handleMCP(
  c: Context,
  db: Database,
  privateKey: string,
  tools: ToolDef[],
  ctxDeviceKey?: string
): Promise<Response> {
  if (c.req.method !== 'POST') {
    return c.text('MCP endpoint requires POST', 405)
  }

  let req: JSONRPCRequest
  try {
    req = await c.req.json<JSONRPCRequest>()
  } catch {
    return makeRPCError(null, -32700, 'Parse error')
  }

  if (req.jsonrpc !== '2.0') {
    return makeRPCError(req.id, -32600, 'Invalid Request')
  }

  switch (req.method) {
    case 'tools/list':
      return makeRPCResult(req.id, { tools })

    case 'tools/call': {
      const params = (req.params as { name?: string; arguments?: Record<string, unknown> }) || {}
      if (params.name !== 'notify') {
        return makeRPCError(req.id, -32601, 'Method not found')
      }

      const args = params.arguments || {}

      let deviceKey = (args['device_key'] as string) || ctxDeviceKey || ''
      if (!deviceKey) {
        return makeRPCResult(req.id, {
          content: [{ type: 'text', text: 'device_key is required' }],
          isError: true,
        })
      }

      const pushArgs: PushParams = { ...args, device_key: deviceKey }

      try {
        const deviceToken = await db.deviceTokenByKey(deviceKey)
        const { code } = await apnsPush(deviceToken, pushArgs, privateKey)

        if (code === 200) {
          return makeRPCResult(req.id, {
            content: [{ type: 'text', text: 'Notification sent successfully' }],
          })
        }
        return makeRPCResult(req.id, {
          content: [{ type: 'text', text: `Failed to send notification (code ${code})` }],
          isError: true,
        })
      } catch (err) {
        return makeRPCResult(req.id, {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        })
      }
    }

    default:
      return makeRPCError(req.id, -32601, 'Method not found')
  }
}

function makeRPCResult(id: string | number | null | undefined, result: unknown): Response {
  const resp = { jsonrpc: '2.0' as const, id: id ?? null, result }
  return new Response(JSON.stringify(resp), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeRPCError(id: string | number | null | undefined, code: number, message: string): Response {
  const resp = { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } }
  return new Response(JSON.stringify(resp), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
