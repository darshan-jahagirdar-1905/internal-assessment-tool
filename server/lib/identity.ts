import type { Context, MiddlewareHandler } from 'hono'
import { testSigninEnabled } from './config.js'
import { sql } from './db.js'
import { normaliseAllowedEmail } from './email.js'

// The one "who is this?" step (architecture.md section 4.1). No other code
// knows how sign-in works.

export type User = {
  id: string
  email: string
  full_name: string | null
  role: 'learner' | 'admin'
}

export type AppEnv = { Variables: { user: User } }

export async function getCurrentUser(c: Context): Promise<User | null> {
  if (testSigninEnabled()) {
    const header = c.req.header('x-test-user')
    if (header !== undefined) {
      const email = normaliseAllowedEmail(header)
      return email ? upsertTestUser(email) : null
    }
  }
  // WorkOS sign-in (section 4.3) is added in execution step C6.
  return null
}

async function upsertTestUser(email: string): Promise<User> {
  const [user] = await sql()<User[]>`
    insert into users (email, first_signed_in_at)
    values (${email}, now())
    on conflict (email) do update
      set first_signed_in_at = coalesce(users.first_signed_in_at, now())
    returning id, email, full_name, role`
  return user
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'not_signed_in' }, 401)
  c.set('user', user)
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'not_signed_in' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('user', user)
  await next()
}
