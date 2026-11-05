import { Hono } from 'hono'
import { z } from 'zod'
import { logActivity } from '../../lib/activity.js'
import { istDateTime, toCsv } from '../../lib/csv.js'
import { sql } from '../../lib/db.js'
import { normaliseAllowedEmail } from '../../lib/email.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'
import { ensureUsers } from '../../lib/users.js'

// Admin assign, tracking, per-person report, stats and CSV export
// (architecture.md 7.3, 9.3 and 9.6; execution step C5). Pass/fail is
// computed here from the course's current pass mark, never stored.

const assignSchema = z.object({ emails: z.array(z.string().max(320)).min(1).max(500) })

type CourseHead = { id: string; title: string; status: string; pass_percentage: number; video_count: number; question_count: number; past_due: boolean }

async function courseHead(id: string): Promise<CourseHead> {
  const [course] = await sql()<CourseHead[]>`
    select c.id, c.title, c.status, c.pass_percentage,
      (c.due_at is not null and now() > c.due_at) as past_due,
      (select count(*) from videos v where v.course_id = c.id)::int as video_count,
      (select count(*) from questions q where q.course_id = c.id)::int as question_count
    from courses c where c.id = ${id}`
  if (!course) throw new HttpError(404, 'not_found')
  return course
}

// Any attempt left open past the due date is submitted first (9.5).
async function closeOverdue(courseId: string) {
  await sql()`select auto_submit_overdue(${courseId})`
}

type TrackingRow = {
  id: string
  email: string
  full_name: string | null
  employee_code: string | null
  signed_in: boolean
  source: 'self' | 'admin'
  enrolled_at: Date
  status: string
  completed_at: Date | null
  videos_completed: number
  progress_pct: number
  score_pct: number | null
  passed: boolean | null
}

// One row per enrollment. "passed" uses the best submitted attempt and the
// course's current pass mark: score_points * 100 >= pass_percentage * max_points.
async function trackingRows(courseId: string): Promise<TrackingRow[]> {
  return sql()<TrackingRow[]>`
    select e.id, u.email, u.full_name, u.employee_code, u.first_signed_in_at is not null as signed_in,
      e.source, e.created_at as enrolled_at, e.status, e.completed_at,
      (select count(*) from video_progress p where p.enrollment_id = e.id and p.completed_at is not null)::int as videos_completed,
      (select coalesce(round(100.0 * sum(coalesce(p.watched_segments, 0)) / nullif(sum(ceil(v.duration_seconds / 5.0)), 0)), 0)::int
       from videos v left join video_progress p on p.video_id = v.id and p.enrollment_id = e.id
       where v.course_id = e.course_id) as progress_pct,
      e.best_score_pct::float8 as score_pct,
      case when b.max_points is null then null else b.score_points * 100 >= c.pass_percentage * b.max_points end as passed
    from enrollments e
    join users u on u.id = e.user_id
    join courses c on c.id = e.course_id
    left join lateral (
      select a.score_points, a.max_points from attempts a
      where a.enrollment_id = e.id and a.status = 'submitted'
      order by a.score_pct desc, a.submitted_at limit 1
    ) b on true
    where e.course_id = ${courseId}
    order by u.email`
}

export const tracking = new Hono<AppEnv>()

// Assign by email: creates missing users (allowed domains only) and enrollments.
tracking.post('/courses/:id/assign', async (c) => {
  const courseId = uuidParam(c, 'id')
  const body = await parseBody(c, assignSchema)
  const admin = c.get('user')
  const course = await courseHead(courseId)
  if (course.status !== 'published') throw new HttpError(409, 'not_published')
  if (course.past_due) throw new HttpError(409, 'past_due')

  const rejected: { input: string; reason: 'invalid' | 'domain' }[] = []
  const emails = new Set<string>()
  for (const raw of body.emails) {
    const input = raw.trim()
    if (!input) continue
    const email = normaliseAllowedEmail(input)
    if (email) emails.add(email)
    else rejected.push({ input, reason: z.string().email().safeParse(input.toLowerCase()).success ? 'domain' : 'invalid' })
  }

  const result = await sql().begin(async (tx) => {
    const ids = await ensureUsers(tx, [...emails])
    const created = await tx<{ id: string; user_id: string }[]>`
      insert into enrollments (course_id, user_id, source, assigned_by)
      select ${courseId}, unnest(${[...ids.values()]}::uuid[]), 'admin', ${admin.id}
      on conflict (course_id, user_id) do nothing
      returning id, user_id`
    for (const row of created) {
      await logActivity(tx, {
        actorUserId: admin.id, action: 'enrollment.created', courseId, enrollmentId: row.id,
        details: { source: 'admin', user_id: row.user_id },
      })
    }
    return { enrolled: created.length, already_enrolled: ids.size - created.length }
  })
  return c.json({ ...result, rejected })
})

tracking.get('/courses/:id/tracking', async (c) => {
  const courseId = uuidParam(c, 'id')
  await closeOverdue(courseId)
  const course = await courseHead(courseId)
  return c.json({ course, enrollments: await trackingRows(courseId) })
})

tracking.get('/courses/:id/stats', async (c) => {
  const courseId = uuidParam(c, 'id')
  await closeOverdue(courseId)
  const course = await courseHead(courseId)
  const rows = await trackingRows(courseId)
  const completed = rows.filter((r) => r.status === 'completed')
  const scored = completed.filter((r) => r.score_pct !== null)
  const passed = completed.filter((r) => r.passed).length
  const questions = await sql()`
    select q.id, q.position, q.text, q.type,
      count(a.id)::int as answered,
      count(a.id) filter (where a.is_correct)::int as correct,
      case when count(a.id) = 0 then null
           else round(100.0 * count(a.id) filter (where a.is_correct) / count(a.id))::int end as pct_correct
    from questions q
    left join answers a on a.question_id = q.id
      and exists (select 1 from attempts t where t.id = a.attempt_id and t.status = 'submitted')
    where q.course_id = ${courseId}
    group by q.id
    order by q.position`
  return c.json({
    course,
    enrolled: rows.length,
    videos_done: rows.filter((r) => r.status !== 'enrolled').length,
    completed: completed.length,
    passed,
    pass_rate: completed.length ? Math.round((passed * 100) / completed.length) : null,
    average_score: scored.length
      ? Math.round((scored.reduce((sum, r) => sum + (r.score_pct ?? 0), 0) / scored.length) * 100) / 100
      : null,
    questions,
  })
})

tracking.get('/enrollments/:id/report', async (c) => {
  const enrollmentId = uuidParam(c, 'id')
  const [head] = await sql()<{ course_id: string }[]>`select course_id from enrollments where id = ${enrollmentId}`
  if (!head) throw new HttpError(404, 'not_found')
  await closeOverdue(head.course_id)
  const course = await courseHead(head.course_id)
  const [row] = (await trackingRows(head.course_id)).filter((r) => r.id === enrollmentId)

  const videos = await sql()`
    select v.id, v.position, v.title, v.duration_seconds,
      coalesce(p.watched_segments, 0) as watched_segments,
      ceil(v.duration_seconds / 5.0)::int as total_segments,
      least(100, round(100.0 * coalesce(p.watched_segments, 0) / ceil(v.duration_seconds / 5.0)))::int as watched_pct,
      p.completed_at, p.last_reported_at
    from videos v left join video_progress p on p.video_id = v.id and p.enrollment_id = ${enrollmentId}
    where v.course_id = ${head.course_id}
    order by v.position`

  const attempts = await sql()`
    select a.id, a.attempt_no, a.status, a.submit_reason, a.started_at, a.submitted_at,
      a.score_points, a.max_points, a.score_pct::float8 as score_pct,
      case when a.max_points is null then null
           else a.score_points * 100 >= ${course.pass_percentage} * a.max_points end as passed,
      (select coalesce(json_agg(json_build_object(
          'question_id', q.id, 'position', q.position, 'text', q.text, 'type', q.type, 'points', q.points,
          'is_correct', ans.is_correct, 'points_awarded', ans.points_awarded,
          'options', (select json_agg(json_build_object(
              'id', o.id, 'text', o.text, 'is_correct', o.is_correct,
              'selected', coalesce(o.id = any(ans.selected_option_ids), false)) order by o.position)
            from options o where o.question_id = q.id)
        ) order by q.position), '[]'::json)
       from questions q left join answers ans on ans.question_id = q.id and ans.attempt_id = a.id
       where q.course_id = ${head.course_id}) as answers
    from attempts a where a.enrollment_id = ${enrollmentId}
    order by a.attempt_no`

  return c.json({ course, enrollment: row, videos, attempts })
})

tracking.get('/courses/:id/export', async (c) => {
  const courseId = uuidParam(c, 'id')
  await closeOverdue(courseId)
  const course = await courseHead(courseId)
  const rows = await trackingRows(courseId)
  const csv = toCsv(
    ['Name', 'Email', 'Employee code', 'Source', 'Enrolled at (IST)', 'Videos completed', 'Status', 'Score %', 'Passed', 'Completed at (IST)'],
    rows.map((r) => [
      r.full_name, r.email, r.employee_code, r.source, istDateTime(r.enrolled_at),
      `${r.videos_completed} of ${course.video_count}`, r.status, r.score_pct,
      r.passed === null ? '' : r.passed ? 'Yes' : 'No', istDateTime(r.completed_at),
    ]),
  )
  const slug = course.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'course'
  const date = new Date().toISOString().slice(0, 10)
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}-results-${date}.csv"`,
    'Cache-Control': 'no-store',
  })
})
