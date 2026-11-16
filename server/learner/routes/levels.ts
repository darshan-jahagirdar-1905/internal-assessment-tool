import { Hono } from 'hono'
import type postgres from 'postgres'
import { z } from 'zod'
import { sql } from '../../lib/db.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'

// Level quizzes (architecture.md 9.8, step L2). Learners get the questions
// without the answer key. After a try they learn how many were right and which
// questions were wrong, never which option is correct (AGENTS.md rule 6).
// Every level is checked to belong to a course the signed-in user is enrolled
// in (rule 7).

const REFUSALS_409 = new Set(['level_locked', 'videos_not_done', 'past_due', 'course_not_open', 'no_questions'])
const REFUSALS_422 = new Set(['bad_answers', 'question_not_in_level', 'option_not_in_question'])

const submitSchema = z.object({
  answers: z
    .array(z.object({ question_id: z.string().uuid(), selected_option_ids: z.array(z.string().uuid()).max(20) }))
    .max(100),
})

type MyLevel = {
  level_id: string
  position: number
  title: string
  course_id: string
  course_title: string
  enrollment_id: string
  unlocked: boolean
  videos_done: boolean
}

async function myLevel(levelId: string, userId: string): Promise<MyLevel> {
  const [row] = await sql()<MyLevel[]>`
    select l.id as level_id, l.position, l.title, c.id as course_id, c.title as course_title, e.id as enrollment_id,
      not exists (select 1 from levels p where p.course_id = l.course_id and p.position < l.position
                  and not level_passed(e.id, p.id)) as unlocked,
      not exists (select 1 from videos v
                  left join video_progress vp on vp.video_id = v.id and vp.enrollment_id = e.id
                  where v.level_id = l.id and vp.completed_at is null) as videos_done
    from levels l
    join courses c on c.id = l.course_id
    join enrollments e on e.course_id = c.id and e.user_id = ${userId}
    where l.id = ${levelId}`
  if (!row) throw new HttpError(404, 'not_found')
  return row
}

export const levels = new Hono<AppEnv>()

// The quiz's questions and options, without is_correct.
levels.get('/levels/:id/quiz', async (c) => {
  const level = await myLevel(uuidParam(c, 'id'), c.get('user').id)
  if (!level.unlocked) throw new HttpError(409, 'level_locked')
  if (!level.videos_done) throw new HttpError(409, 'videos_not_done')

  const questions = await sql()`
    select q.id, q.position, q.text, q.type,
      (select json_agg(json_build_object('id', o.id, 'text', o.text) order by o.position)
       from options o where o.question_id = q.id) as options
    from questions q where q.level_id = ${level.level_id}
    order by q.position`
  const [record] = await sql()<{ tries: number; passed: boolean }[]>`
    select count(*)::int as tries, coalesce(bool_or(passed), false) as passed
    from level_quiz_attempts where enrollment_id = ${level.enrollment_id} and level_id = ${level.level_id}`
  const [next] = await sql()<{ id: string; title: string }[]>`
    select id, title from levels where course_id = ${level.course_id} and position > ${level.position}
    order by position limit 1`

  return c.json({
    level: { id: level.level_id, position: level.position, title: level.title },
    course: { id: level.course_id, title: level.course_title },
    next_level: next ?? null,
    questions,
    tries: record.tries,
    passed: record.passed,
  })
})

// One try. Passing needs every question right; tries are unlimited.
levels.post('/levels/:id/quiz', async (c) => {
  const body = await parseBody(c, submitSchema)
  const level = await myLevel(uuidParam(c, 'id'), c.get('user').id)

  const singles = await sql()<{ id: string }[]>`
    select id from questions where level_id = ${level.level_id} and type = 'single'`
  const singleIds = new Set(singles.map((q) => q.id))
  if (body.answers.some((a) => singleIds.has(a.question_id) && new Set(a.selected_option_ids).size > 1)) {
    throw new HttpError(422, 'single_choice')
  }

  try {
    const [result] = await sql()<{ correct_count: number; question_count: number; passed: boolean; wrong_question_ids: string[] }[]>`
      select * from submit_level_quiz(${level.enrollment_id}, ${level.level_id}, ${sql().json(body.answers as postgres.JSONValue)})`
    return c.json({
      ...result,
      score_pct: Math.round((result.correct_count * 100) / result.question_count),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (REFUSALS_409.has(message)) throw new HttpError(409, message)
    if (REFUSALS_422.has(message)) throw new HttpError(422, message)
    throw err
  }
})
