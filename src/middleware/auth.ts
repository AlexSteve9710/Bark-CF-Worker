import type { MiddlewareHandler } from 'hono'

const AUTH_FREE_PATHS = ['/ping', '/register', '/healthz']

export function basicAuth(user: string, pass: string): MiddlewareHandler {
  if (!user && !pass) {
    return async (c, next) => await next()
  }

  return async (c, next) => {
    const path = c.req.path

    if (AUTH_FREE_PATHS.some((p) => path.startsWith(p))) {
      return await next()
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return c.text("I'm a teapot", 418)
    }

    const [providedUser, providedPass] = atob(authHeader.slice(6)).split(':')
    if (providedUser !== user || providedPass !== pass) {
      return c.text("I'm a teapot", 418)
    }

    return await next()
  }
}
