// Shared fetch helper for learnerApi.ts and adminApi.ts. Calls go to /api on
// the same domain; the session cookie is sent automatically.

const TEST_USER_KEY = 'testUser'

export function getTestUser(): string | null {
  try {
    return sessionStorage.getItem(TEST_USER_KEY)
  } catch {
    return null
  }
}

export function setTestUser(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(TEST_USER_KEY, email)
    else sessionStorage.removeItem(TEST_USER_KEY)
  } catch {
    // sessionStorage unavailable: test sign-in just won't persist
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const testUser = getTestUser()
  if (testUser) headers.set('x-test-user', testUser)

  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? res.statusText
    throw new ApiError(res.status, code)
  }
  return body as T
}
