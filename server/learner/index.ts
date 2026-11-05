import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../lib/identity.js'
import { courses } from './routes/courses.js'
import { me } from './routes/me.js'
import { videos } from './routes/videos.js'

// Learner routes (/api/*): a signed-in user is required before any handler.
export const learner = new Hono<AppEnv>()
learner.use('*', requireUser)
learner.route('/', me)
learner.route('/', courses)
learner.route('/', videos)
