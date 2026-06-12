# Bark CF Worker

[Bark](https://github.com/Finb/Bark) 服务端的 Cloudflare Workers 复刻，将 Bark 推送通知服务跑在 CF 无服务器边缘网络上。

## 与官方 bark-server 的区别

| 特性 | 官方 bark-server | Bark CF Worker |
|------|:---:|:---:|
| 运行平台 | Docker / 裸机 / K8s | Cloudflare Workers |
| 数据库 | bbolt / MySQL | CF KV / 环境变量 |
| APNs 推送 | Go `apns2` 库 (HTTP/2) | `fetch()` + Web Crypto JWT |
| 框架 | Fiber (fasthttp) | Hono |
| 语言 | Go | TypeScript |
| 部署成本 | 需要服务器 | 免费额度内零成本 |
| API 兼容 | - | 完全兼容 |

## 快速部署

### 前置条件

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI: `npm install -g wrangler`

### 1. 创建 KV 命名空间

```sh
wrangler kv:namespace create BARK_KV
wrangler kv:namespace create BARK_KV --preview
```

将输出的 `id` 填入 `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "BARK_KV",
    "id": "your-production-kv-id",
    "preview_id": "your-preview-kv-id"
  }
]
```

### 2. 配置 APNs 私钥 (可选)

私钥已硬编码在源码中（Bark 公共私钥）。如需使用自己的私钥，通过 Secret 覆盖：

```sh
wrangler secret put APNS_PRIVATE_KEY
```

> **安全提醒:** 源码中的私钥属于 Bark 项目公开私钥，用于 Bark 公共 App (`me.fin.bark`)。如果你有自己的 APNs Key，请通过 Secret 注入。

### 3. 可选：Basic Auth

```sh
wrangler secret put AUTH_USER
wrangler secret put AUTH_PASS
```

### 4. 部署

```sh
npm install
wrangler deploy
```

## 本地开发

```sh
npm install
npm run dev
```

## 环境变量 / Secrets

| 变量 | 说明 | 必填 |
|------|------|:---:|
| `BARK_KEY` | Serverless 模式：设备 key | 否 |
| `BARK_DEVICE_TOKEN` | Serverless 模式：设备 APNs token | 否 |
| `AUTH_USER` | Basic Auth 用户名 | 否 |
| `AUTH_PASS` | Basic Auth 密码 | 否 |
| `MAX_BATCH_PUSH_COUNT` | 批量推送上限（-1 不限制） | 否 |

> 若 `BARK_KEY` + `BARK_DEVICE_TOKEN` 均设置，则使用环境变量模式（单设备，无需 KV）；否则使用 KV 存储。

## API

完全兼容 [官方 API V2](https://github.com/Finb/bark-server/blob/master/docs/API_V2.md)。

### 设备注册

```sh
# 注册新设备
curl -X POST https://your-worker.workers.dev/register \
  -H "Content-Type: application/json" \
  -d '{"device_token": "your-apns-device-token"}'

# 返回: { "code": 200, "data": { "key": "xxx-xxx", "device_key": "xxx-xxx", "device_token": "..." } }

# 查询设备
curl https://your-worker.workers.dev/register/<device_key>
```

### 发送推送

```sh
# V2 JSON
curl -X POST https://your-worker.workers.dev/push \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Hello from CF Worker",
    "device_key": "xxx-xxx",
    "title": "Bark",
    "sound": "minuet",
    "icon": "https://day.app/assets/images/avatar.jpg",
    "group": "test",
    "url": "https://github.com"
  }'

# V1 兼容 (URL 路径)
curl "https://your-worker.workers.dev/<device_key>/Title/Body"
```

### 批量推送

```json
{
  "body": "Batch notification",
  "device_keys": ["key1", "key2", "key3"],
  "title": "Announcement"
}
```

### 健康检查

```sh
curl https://your-worker.workers.dev/ping
# → { "code": 200, "message": "pong", "timestamp": 1718234567 }

curl https://your-worker.workers.dev/healthz
# → ok

curl https://your-worker.workers.dev/info
# → { "version": "3.0.0", "devices": 3, "arch": "cloudflare-workers", ... }
```

### MCP 集成

两个 MCP 端点，兼容 HTTP Streamable Transport：

```sh
# 通用端点 (device_key 在工具参数中提供)
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"notify","arguments":{"device_key":"xxx","title":"Hello","body":"World"}}}'

# 设备专用端点 (device_key 从 URL 提取)
curl -X POST https://your-worker.workers.dev/mcp/<device_key> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"notify","arguments":{"title":"Hello","body":"World"}}}'
```

## 项目结构

```
src/
├── index.ts           # 入口：组装 Hono app、DB、中间件、路由
├── types.ts           # 共享类型定义
├── utils.ts           # 响应 helpers、UUID、JWT 签名 (ES256)
├── apns.ts            # APNs 推送 (JWT 缓存 + fetch → api.push.apple.com)
├── db.ts              # 数据库层 (KV 存储 / 环境变量 serverless 模式)
├── middleware/
│   └── auth.ts        # HTTP Basic Auth /ping /register /healthz 免认证
└── routes/
    ├── misc.ts        # GET / /ping /healthz /info
    ├── register.ts    # POST /register GET /register GET /register/:key
    ├── push.ts        # POST /push (V2 JSON + batch) + V1 兼容路由
    └── mcp.ts         # ALL /mcp /mcp/:key (JSON-RPC)
```

## License

[GNU General Public License v3.0](LICENSE)
