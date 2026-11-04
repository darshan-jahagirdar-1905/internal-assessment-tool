import { Hono } from 'hono'
import type { AppEnv } from '../../lib/identity.js'

export const me = new Hono<AppEnv>().get('/me', (c) => {
  const { id, email, full_name, role } = c.get('user')
  return c.json({ id, email, full_name, role })
})
