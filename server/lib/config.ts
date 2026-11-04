// Server settings read from environment variables (architecture.md section 2).
// Values are read on each call so tests and local runs can change them.

export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

// Test sign-in (section 4.2): needs TEST_SIGNIN=on and a deployment that is
// not production. VERCEL_ENV is unset when running locally.
export function testSigninEnabled(): boolean {
  return process.env.TEST_SIGNIN === 'on' && process.env.VERCEL_ENV !== 'production'
}
