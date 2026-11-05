import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { logActivity } from '../lib/activity.js'
import { sql } from '../lib/db.js'
import { normaliseAllowedEmail } from '../lib/email.js'
import { upsertSignedInUser } from '../lib/users.js'
import {
  appBaseUrl, clearSessionCookie, clearStateCookie, cookiePassword, SESSION_COOKIE, setSessionCookie,
  setSigninNotice, setStateCookie, STATE_COOKIE, workos, workosConfigured,
} from '../lib/workos.js'

// Sign-in with WorkOS AuthKit (architecture.md 4.3 and 7.1a, execution step
// C6). The browser only ever holds the encrypted, HttpOnly session cookie.

export const auth = new Hono()

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// The session id inside an access token WorkOS has just handed us over TLS
// (no signature check needed for this one use: building its sign-out link).
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sid?: unknown }
    return typeof payload.sid === 'string' ? payload.sid : null
  } catch {
    return null
  }
}

auth.get('/auth/signin', (c) => {
  if (!workosConfigured()) return c.redirect('/signin?error=unavailable')
  const state = randomBytes(24).toString('base64url')
  setStateCookie(c, state)
  const url = workos().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    redirectUri: `${appBaseUrl()}/api/auth/callback`,
    state,
  })
  return c.redirect(url)
})

auth.get('/auth/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const expected = getCookie(c, STATE_COOKIE)
  clearStateCookie(c)
  if (!workosConfigured()) return c.redirect('/signin?error=unavailable')
  if (!code || !state || !expected || !sameText(state, expected)) return c.redirect('/signin?error=failed')

  let result
  try {
    result = await workos().userManagement.authenticateWithCode({
      code,
      session: { sealSession: true, cookiePassword: cookiePassword() },
    })
  } catch (err) {
    console.error('WorkOS code exchange failed:', err instanceof Error ? err.message : err)
    return c.redirect('/signin?error=failed')
  }

  // Company domains only, and only with an email WorkOS has verified.
  const email = result.user.emailVerified ? normaliseAllowedEmail(result.user.email) : null
  if (!email || !result.sealedSession) {
    await logActivity(sql(), {
      actorUserId: null,
      action: 'user.signin_refused',
      details: { domain: result.user.email.split('@').at(-1) ?? '', email_verified: result.user.emailVerified },
    })
    // End their WorkOS session too, so they can try a different email.
    const sessionId = sessionIdOf(result.accessToken)
    if (sessionId) {
      setSigninNotice(c, 'domain')
      return c.redirect(workos().userManagement.getLogoutUrl({ sessionId, returnTo: `${appBaseUrl()}/signin` }))
    }
    return c.redirect('/signin?error=domain')
  }

  const name = result.user.name ?? ([result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || null)
  const user = await upsertSignedInUser(sql(), { subject: result.user.id, email, name })
  await logActivity(sql(), { actorUserId: user.id, action: 'user.signed_in' })
  setSessionCookie(c, result.sealedSession)
  return c.redirect('/')
})

// A plain form POST from the site (the Origin check in app.ts applies).
auth.post('/auth/signout', async (c) => {
  const sealed = getCookie(c, SESSION_COOKIE)
  clearSessionCookie(c)
  let target = '/signin'
  if (sealed && workosConfigured()) {
    const returnTo = `${appBaseUrl()}/signin`
    const session = workos().userManagement.loadSealedSession({ sessionData: sealed, cookiePassword: cookiePassword() })
    try {
      target = await session.getLogoutUrl({ returnTo })
    } catch {
      // The access token had expired: refresh once to learn the session id.
      const refreshed = await session.refresh().catch(() => null)
      if (refreshed?.authenticated) target = workos().userManagement.getLogoutUrl({ sessionId: refreshed.sessionId, returnTo })
    }
  }
  return c.redirect(target, 303)
})
