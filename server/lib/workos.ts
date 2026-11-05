import { WorkOS } from '@workos-inc/node'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

// WorkOS AuthKit settings and the session cookie (architecture.md 4.3).
// Only server/lib/identity.ts and server/auth/ use this module.

export const SESSION_COOKIE = 'wos-session'
export const STATE_COOKIE = 'wos-state'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // the WorkOS session length (dashboard) still applies

let client: WorkOS | undefined

export function workosConfigured(): boolean {
  return Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID && (process.env.WORKOS_COOKIE_PASSWORD ?? '').length >= 32)
}

export function workos(): WorkOS {
  if (!workosConfigured()) throw new Error('WorkOS is not configured')
  client ??= new WorkOS(process.env.WORKOS_API_KEY, { clientId: process.env.WORKOS_CLIENT_ID })
  return client
}

export function cookiePassword(): string {
  return process.env.WORKOS_COOKIE_PASSWORD ?? ''
}

// The site's own address, e.g. https://internal-assessment-tool.vercel.app
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '')
}

// Secure cookies everywhere except plain-http local runs.
function secure(): boolean {
  return !appBaseUrl().startsWith('http://')
}

export function setSessionCookie(c: Context, sealedSession: string) {
  setCookie(c, SESSION_COOKIE, sealedSession, { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/', maxAge: SESSION_MAX_AGE })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: secure() })
}

export function setStateCookie(c: Context, state: string) {
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/api/auth', maxAge: 10 * 60 })
}

export function clearStateCookie(c: Context) {
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth', secure: secure() })
}

// Tells the sign-in page why sign-in was refused when the reason can't travel
// in the URL (after a trip through WorkOS's sign-out page). Not secret.
export function setSigninNotice(c: Context, reason: 'domain') {
  setCookie(c, 'signin_notice', reason, { secure: secure(), sameSite: 'Lax', path: '/', maxAge: 5 * 60 })
}
