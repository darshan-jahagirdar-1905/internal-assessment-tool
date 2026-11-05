import { Hono } from 'hono'
import { z } from 'zod'
import { logActivity } from '../../lib/activity.js'
import { sql } from '../../lib/db.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'

// Admin users and roles (architecture.md 7.3, execution step C5).

const roleSchema = z.object({ role: z.enum(['learner', 'admin']) })

export const users = new Hono<AppEnv>()

// Search by email or name; the first 200 matches.
users.get('/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const rows = await sql()`
    select u.id, u.email, u.full_name, u.role, u.employee_code, u.first_signed_in_at, u.created_at,
      (select count(*) from enrollments e where e.user_id = u.id)::int as enrollments
    from users u
    where ${q} = '' or u.email ilike ${pattern} or u.full_name ilike ${pattern}
    order by u.role, u.email
    limit 200`
  return c.json({ users: rows })
})

users.put('/users/:id/role', async (c) => {
  const id = uuidParam(c, 'id')
  const { role } = await parseBody(c, roleSchema)
  const admin = c.get('user')
  // An admin can't remove their own access (keeps at least one admin).
  if (id === admin.id) throw new HttpError(409, 'own_role')
  const user = await sql().begin(async (tx) => {
    const [before] = await tx<{ role: string }[]>`select role from users where id = ${id} for update`
    if (!before) throw new HttpError(404, 'not_found')
    const [row] = await tx`
      update users set role = ${role} where id = ${id}
      returning id, email, full_name, role, employee_code, first_signed_in_at, created_at`
    if (before.role !== role) {
      await logActivity(tx, { actorUserId: admin.id, action: 'user.role_changed', details: { user_id: id, from: before.role, to: role } })
    }
    return row
  })
  return c.json(user)
})
