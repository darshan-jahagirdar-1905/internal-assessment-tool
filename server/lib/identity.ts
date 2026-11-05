import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { testSigninEnabled } from './config.js'
import { sql } from './db.js'
import { normaliseAllowedEmail } from './email.js'
import { cookiePassword, SESSION_COOKIE, setSessionCookie, workos, workosConfigured } from './workos.js'

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
  return sessionUser(c)
}

// The WorkOS session cookie (section 4.3 step 6). An expired access token is
// refreshed and the cookie re-set. A failed refresh doesn't clear the cookie:
// two requests can race to refresh, and the other one may have succeeded.
async function sessionUser(c: Context): Promise<User | null> {
  const sealed = getCookie(c, SESSION_COOKIE)
  if (!sealed || !workosConfigured()) return null
  const subject = await sessionSubject(c, sealed)
  if (!subject) return null
  const [user] = await sql()<User[]>`
    select id, email, full_name, role from users where auth_subject = ${subject}`
  return user ?? null
}

// The WorkOS user id in a valid session, or null. A tampered or unreadable
// cookie counts as signed out, not as a server error.
async function sessionSubject(c: Context, sealed: string): Promise<string | null> {
  try {
    const session = workos().userManagement.loadSealedSession({ sessionData: sealed, cookiePassword: cookiePassword() })
    const current = await session.authenticate()
    if (current.authenticated) return current.user.id
    if (current.reason !== 'invalid_jwt') return null
    const refreshed = await session.refresh()
    if (!refreshed.authenticated) return null
    if (refreshed.sealedSession) setSessionCookie(c, refreshed.sealedSession)
    return refreshed.user.id
  } catch (err) {
    console.error('Session check failed:', err instanceof Error ? err.message : err)
    return null
  }
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
