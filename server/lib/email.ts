import { z } from 'zod'
import { allowedEmailDomains } from './config.js'

const emailSchema = z.string().trim().toLowerCase().email().max(254)

// Returns the trimmed, lower-case email if it is valid and in an allowed
// company domain (ALLOWED_EMAIL_DOMAINS), otherwise null.
export function normaliseAllowedEmail(input: unknown): string | null {
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return null
  const domain = parsed.data.split('@').at(-1) ?? ''
  return allowedEmailDomains().includes(domain) ? parsed.data : null
}
