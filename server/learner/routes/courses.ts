import { Hono } from 'hono'
import { logActivity } from '../../lib/activity.js'
import { sql } from '../../lib/db.js'
import { HttpError, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'

// Learner course list, enroll and course page (architecture.md 7.2, step C2).
// Never returns correct answers, pass marks or pass/fail (AGENTS.md rule 6).
// Every query is scoped to the signed-in user (rule 7).

type AssessmentState = 'not_enrolled' | 'locked' | 'available' | 'in_progress' | 'completed' | 'closed'

export const courses = new Hono<AppEnv>()

// Published courses, plus any course I'm enrolled in that has since been
// archived (I keep my results), each with my enrollment state.
courses.get('/courses', async (c) => {
  const user = c.get('user')
  // Close any of my open attempts that are past their course's due date (9.5).
  await sql()`
    select auto_submit_overdue(c.id) from courses c
    where c.due_at is not null and now() > c.due_at
      and exists (select 1 from enrollments e join attempts a on a.enrollment_id = e.id
                  where e.course_id = c.id and e.user_id = ${user.id} and a.status = 'in_progress')`
  const rows = await sql()`
    select c.id, c.title, c.description, c.status, c.due_at,
      (select count(*) from videos v where v.course_id = c.id)::int as video_count,
      (select coalesce(sum(v.duration_seconds), 0) from videos v where v.course_id = c.id)::int as total_seconds,
      (select count(*) from questions q where q.course_id = c.id)::int as question_count,
      case when e.id is null then null else json_build_object(
        'status', e.status,
        'source', e.source,
        'enrolled_at', e.created_at,
        'completed_at', e.completed_at,
        'score_pct', e.best_score_pct::float8,
        'videos_completed', (select count(*) from video_progress p where p.enrollment_id = e.id and p.completed_at is not null),
        'started', exists (select 1 from video_progress p where p.enrollment_id = e.id and p.watched_segments > 0),
        -- Share of all 5-second segments watched across the course's videos.
        'progress_pct', (select coalesce(round(100.0 * sum(coalesce(p.watched_segments, 0)) / nullif(sum(ceil(v.duration_seconds / 5.0)), 0)), 0)::int
                         from videos v left join video_progress p on p.video_id = v.id and p.enrollment_id = e.id
                         where v.course_id = c.id)
      ) end as enrollment
    from courses c
    left join enrollments e on e.course_id = c.id and e.user_id = ${user.id}
    where c.status = 'published' or e.id is not null
    order by e.created_at desc nulls last, c.published_at desc nulls last`
  return c.json({ courses: rows })
})

courses.post('/courses/:id/enroll', async (c) => {
  const id = uuidParam(c, 'id')
  const user = c.get('user')
  await sql().begin(async (tx) => {
    const [course] = await tx<{ status: string; past_due: boolean }[]>`
      select status, (due_at is not null and now() > due_at) as past_due from courses where id = ${id}`
    if (!course) throw new HttpError(404, 'not_found')
    const [existing] = await tx`select 1 from enrollments where course_id = ${id} and user_id = ${user.id}`
    if (existing) return // idempotent
    // Unpublished and not mine: behave as if it doesn't exist (like the course page).
    if (course.status !== 'published') throw new HttpError(404, 'not_found')
    if (course.past_due) throw new HttpError(409, 'past_due')
    const [row] = await tx<{ id: string }[]>`
      insert into enrollments (course_id, user_id, source) values (${id}, ${user.id}, 'self')
      on conflict (course_id, user_id) do nothing returning id`
    if (row) await logActivity(tx, { actorUserId: user.id, action: 'enrollment.created', courseId: id, enrollmentId: row.id, details: { source: 'self' } })
  })
  return c.json(await coursePage(id, user.id))
})

courses.get('/courses/:id', async (c) => {
  const id = uuidParam(c, 'id')
  const user = c.get('user')
  await sql()`select auto_submit_overdue(${id})`
  return c.json(await coursePage(id, user.id))
})

async function coursePage(courseId: string, userId: string) {
  const [course] = await sql()<{
    id: string; title: string; description: string | null; status: string; due_at: Date | null; past_due: boolean; max_attempts: number
  }[]>`
    select id, title, description, status, due_at, max_attempts, (due_at is not null and now() > due_at) as past_due
    from courses where id = ${courseId}`
  const [enrollment] = await sql()<{ id: string; status: string; best_score_pct: number | null; attempts_used: number; completed_at: Date | null }[]>`
    select id, status, best_score_pct::float8 as best_score_pct, attempts_used, completed_at
    from enrollments where course_id = ${courseId} and user_id = ${userId}`
  // Not published and not mine: behave as if it doesn't exist.
  if (!course || (course.status !== 'published' && !enrollment)) throw new HttpError(404, 'not_found')

  const videoRows = await sql()<{
    id: string; position: number; title: string; youtube_video_id: string; duration_seconds: number
    watched_segments: number | null; completed: boolean; last_position_seconds: number | null
  }[]>`
    select v.id, v.position, v.title, v.youtube_video_id, v.duration_seconds,
           p.watched_segments, p.completed_at is not null as completed, p.last_position_seconds
    from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = ${enrollment?.id ?? null}
    where v.course_id = ${courseId} order by v.position`

  let previousDone = true
  const videos = videoRows.map((v) => {
    const totalSegments = Math.ceil(v.duration_seconds / 5)
    const locked = !enrollment || !previousDone
    previousDone = previousDone && v.completed
    return {
      id: v.id,
      position: v.position,
      title: v.title,
      youtube_video_id: v.youtube_video_id,
      duration_seconds: v.duration_seconds,
      watched_pct: Math.min(100, Math.round(((v.watched_segments ?? 0) * 100) / totalSegments)),
      completed: v.completed,
      locked,
      resume_position_seconds: v.last_position_seconds ?? 0,
    }
  })
  const allVideosDone = videos.every((v) => v.completed)

  const [{ question_count }] = await sql()<{ question_count: number }[]>`
    select count(*)::int as question_count from questions where course_id = ${courseId}`
  const [openAttempt] = enrollment
    ? await sql()<{ id: string }[]>`select id from attempts where enrollment_id = ${enrollment.id} and status = 'in_progress'`
    : []

  let state: AssessmentState
  if (!enrollment) state = 'not_enrolled'
  else if (openAttempt) state = 'in_progress'
  else if (enrollment.status === 'completed') state = 'completed'
  else if (course.past_due || course.status !== 'published' || enrollment.attempts_used >= course.max_attempts) state = 'closed'
  else if (!allVideosDone) state = 'locked'
  else state = 'available'

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status,
    due_at: course.due_at,
    past_due: course.past_due,
    enrollment: enrollment
      ? { status: enrollment.status, score_pct: enrollment.best_score_pct, completed_at: enrollment.completed_at }
      : null,
    videos,
    assessment: {
      state,
      question_count,
      attempt_id: openAttempt?.id ?? null,
      score_pct: enrollment?.best_score_pct ?? null,
    },
  }
}
