import type { Context } from 'hono'
import type { z, ZodError, ZodTypeAny } from 'zod'

// Small helpers so every route answers errors the same way.

export class HttpError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 422
  readonly details?: unknown
  constructor(status: 400 | 403 | 404 | 409 | 422, code: string, details?: unknown) {
    super(code)
    this.status = status
    this.details = details
  }
}

export async function parseBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  const raw: unknown = await c.req.json().catch(() => {
    throw new HttpError(400, 'invalid_json')
  })
  const result = schema.safeParse(raw)
  if (!result.success) throw new HttpError(400, 'validation', flatten(result.error))
  return result.data as z.output<S>
}

function flatten(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuidParam(c: Context, name: string): string {
  const value = c.req.param(name) ?? ''
  if (!UUID.test(value)) throw new HttpError(404, 'not_found')
  return value
}
