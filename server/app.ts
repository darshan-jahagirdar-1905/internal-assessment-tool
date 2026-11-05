import { Hono } from 'hono'
import { admin } from './admin/index.js'
import { auth } from './auth/routes.js'
import { learner } from './learner/index.js'
import { testSigninEnabled } from './lib/config.js'
import { databaseIsUp } from './lib/db.js'
import { HttpError } from './lib/http.js'
import { sameOriginOnly } from './lib/origin.js'

export const app = new Hono().basePath('/api')

app.use('*', sameOriginOnly)

app.get('/health', async (c) => {
  const db = await databaseIsUp()
  return c.json({ ok: db, db, testSignin: testSigninEnabled() }, db ? 200 : 503)
})

app.route('/', auth)

// Order matters: admin before learner, because the learner group is mounted
// at the root and its sign-in check would otherwise catch /admin paths.
app.route('/admin', admin)
app.route('/', learner)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status)
  console.error(err)
  return c.json({ error: 'server_error' }, 500)
})
