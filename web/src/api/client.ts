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
  readonly details: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
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
    const err = body as { error?: string; details?: unknown } | null
    throw new ApiError(res.status, err?.error ?? res.statusText, err?.details)
  }
  return body as T
}

// For file downloads (CSV export): same headers as apiRequest, returns the file.
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers()
  const testUser = getTestUser()
  if (testUser) headers.set('x-test-user', testUser)
  const res = await fetch(`/api${path}`, { headers, credentials: 'same-origin' })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')
  return { blob: await res.blob(), filename: match?.[1] ?? 'export.csv' }
}
