import { Hono } from 'hono'
import { requireAdmin, type AppEnv } from '../lib/identity.js'
import { courses } from './routes/courses.js'
import { videos } from './routes/videos.js'

// Admin routes (/api/admin/*): a signed-in admin is required before any handler.
export const admin = new Hono<AppEnv>()
admin.use('*', requireAdmin)
admin.route('/', courses)
admin.route('/', videos)
