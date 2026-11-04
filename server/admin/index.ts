import { Hono } from 'hono'
import { requireAdmin, type AppEnv } from '../lib/identity.js'

// Admin routes (/api/admin/*): a signed-in admin is required before any
// handler. Handlers are added under routes/ from execution step C1.
export const admin = new Hono<AppEnv>()
admin.use('*', requireAdmin)
