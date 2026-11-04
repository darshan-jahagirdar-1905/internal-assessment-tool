import type { MiddlewareHandler } from 'hono'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Refuses state-changing requests from other sites (architecture.md section
// 4.3): the Origin header must match the origin the request was sent to.
export const sameOriginOnly: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next()
  const origin = c.req.header('origin')
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  if (!origin || !host || new URL(origin).host !== host) {
    return c.json({ error: 'bad_origin' }, 403)
  }
  await next()
}
