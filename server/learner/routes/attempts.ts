import { Hono } from 'hono'
import type postgres from 'postgres'
import { z } from 'zod'
import { sql } from '../../lib/db.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'

// The assessment (architecture.md 7.2 and 9.2, execution step C4).
// Learners get questions and options without the answer key, and after
// submitting only their score: never is_correct, points_awarded, pass/fail or
// the pass mark (AGENTS.md rule 6). Every attempt is checked to belong to an
// enrollment of the signed-in user (rule 7).

const START_REFUSALS = new Set(['course_not_open', 'past_due', 'videos_not_done', 'no_attempts_left'])
const SUBMIT_REFUSALS = new Set(['bad_answers', 'question_not_in_course', 'option_not_in_question'])

const answerSchema = z.object({
  question_id: z.string().uuid(),
  selected_option_ids: z.array(z.string().uuid()).max(20),
})
const submitSchema = z.object({ answers: z.array(answerSchema).max(500) })

type MyAttempt = { id: string; status: 'in_progress' | 'submitted'; course_id: string; score_pct: number | null }

async function myAttempt(attemptId: string, userId: string): Promise<MyAttempt> {
  const [row] = await sql()<MyAttempt[]>`
    select a.id, a.status, e.course_id, a.score_pct::float8 as score_pct
    from attempts a join enrollments e on e.id = a.enrollment_id
    where a.id = ${attemptId} and e.user_id = ${userId}`
  if (!row) throw new HttpError(404, 'not_found')
  return row
}

// An attempt left open past the due date is submitted with its saved answers
// before anything else happens (9.5).
async function closeOverdue(courseId: string) {
  await sql()`select auto_submit_overdue(${courseId})`
}

export const attempts = new Hono<AppEnv>()

// Start the assessment, or return the open attempt (resume).
attempts.post('/courses/:id/attempt', async (c) => {
  const courseId = uuidParam(c, 'id')
  const [enrollment] = await sql()<{ id: string }[]>`
    select id from enrollments where course_id = ${courseId} and user_id = ${c.get('user').id}`
  if (!enrollment) throw new HttpError(404, 'not_found')
  await closeOverdue(courseId)
  try {
    const [attempt] = await sql()<{ id: string }[]>`select id from start_attempt(${enrollment.id})`
    return c.json({ attempt_id: attempt.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (START_REFUSALS.has(message)) throw new HttpError(409, message)
    throw err
  }
})

attempts.get('/attempts/:id', async (c) => {
  const attemptId = uuidParam(c, 'id')
  const userId = c.get('user').id
  let attempt = await myAttempt(attemptId, userId)
  if (attempt.status === 'in_progress') {
    await closeOverdue(attempt.course_id)
    attempt = await myAttempt(attemptId, userId)
  }
  const [course] = await sql()<{ title: string; due_at: Date | null }[]>`
    select title, due_at from courses where id = ${attempt.course_id}`
  const base = { id: attempt.id, course_id: attempt.course_id, course_title: course.title, due_at: course.due_at }
  if (attempt.status === 'submitted') return c.json({ ...base, status: 'submitted', score_pct: attempt.score_pct })

  // Options are listed without is_correct: the answer key never leaves the database.
  const questions = await sql()`
    select q.id, q.position, q.text, q.type,
      (select json_agg(json_build_object('id', o.id, 'text', o.text) order by o.position)
       from options o where o.question_id = q.id) as options
    from questions q where q.course_id = ${attempt.course_id}
    order by q.position`
  const answers = await sql()`
    select question_id, selected_option_ids from answers where attempt_id = ${attemptId}`
  return c.json({ ...base, status: 'in_progress', questions, answers })
})

// Autosave one answer.
attempts.put('/attempts/:id/answers', async (c) => {
  const attemptId = uuidParam(c, 'id')
  const body = await parseBody(c, answerSchema)
  const selected = [...new Set(body.selected_option_ids)]
  const userId = c.get('user').id
  await sql().begin(async (tx) => {
    // "for share" waits for a submit in progress (it holds "for update"), so
    // nothing is saved into an attempt after it has been scored.
    const [attempt] = await tx<{ status: string; course_id: string; past_due: boolean }[]>`
      select a.status, e.course_id, (c.due_at is not null and now() > c.due_at) as past_due
      from attempts a join enrollments e on e.id = a.enrollment_id join courses c on c.id = e.course_id
      where a.id = ${attemptId} and e.user_id = ${userId}
      for share of a`
    if (!attempt) throw new HttpError(404, 'not_found')
    if (attempt.status !== 'in_progress') throw new HttpError(409, 'attempt_submitted')
    if (attempt.past_due) throw new HttpError(409, 'past_due')

    const [question] = await tx<{ type: string; matched: number }[]>`
      select q.type,
        (select count(*) from options o where o.question_id = q.id and o.id = any(${selected}::uuid[]))::int as matched
      from questions q where q.id = ${body.question_id} and q.course_id = ${attempt.course_id}`
    if (!question) throw new HttpError(422, 'question_not_in_course')
    if (question.matched !== selected.length) throw new HttpError(422, 'option_not_in_question')
    if (question.type === 'single' && selected.length > 1) throw new HttpError(422, 'single_choice')

    await tx`
      insert into answers (attempt_id, question_id, selected_option_ids, saved_at)
      values (${attemptId}, ${body.question_id}, ${selected}::uuid[], now())
      on conflict (attempt_id, question_id)
      do update set selected_option_ids = excluded.selected_option_ids, saved_at = excluded.saved_at`
  })
  return c.json({ ok: true })
})

// Submit with every answer as a final snapshot. A second submit returns the
// stored score.
attempts.post('/attempts/:id/submit', async (c) => {
  const attemptId = uuidParam(c, 'id')
  const body = await parseBody(c, submitSchema)
  const attempt = await myAttempt(attemptId, c.get('user').id)
  if (attempt.status === 'in_progress') await closeOverdue(attempt.course_id)

  const singles = await sql()<{ id: string }[]>`
    select id from questions where course_id = ${attempt.course_id} and type = 'single'`
  const singleIds = new Set(singles.map((q) => q.id))
  if (body.answers.some((a) => singleIds.has(a.question_id) && new Set(a.selected_option_ids).size > 1)) {
    throw new HttpError(422, 'single_choice')
  }

  try {
    const [row] = await sql()<{ score_pct: number }[]>`
      select submit_attempt(${attemptId}, ${sql().json(body.answers as postgres.JSONValue)}, 'learner')::float8 as score_pct`
    return c.json({ score_pct: row.score_pct })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (SUBMIT_REFUSALS.has(message)) throw new HttpError(422, message)
    throw err
  }
})
