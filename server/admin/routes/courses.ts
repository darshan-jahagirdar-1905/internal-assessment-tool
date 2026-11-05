import { Hono } from 'hono'
import type postgres from 'postgres'
import { z } from 'zod'
import { logActivity } from '../../lib/activity.js'
import { sql } from '../../lib/db.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'
import { checkEmbeddable } from '../../lib/youtube.js'

// Admin course builder (architecture.md sections 5, 7.3 and 9.7).

type Tx = postgres.TransactionSql

const detailsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  pass_percentage: z.number().int().min(1).max(100).default(70),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
})

const videosSchema = z.object({
  videos: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        youtube_video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
        duration_seconds: z.number().int().min(1).max(24 * 60 * 60),
      }),
    )
    .max(50),
})

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2000),
        type: z.enum(['single', 'multiple']),
        points: z.number().int().min(1).max(100).default(1),
        options: z
          .array(z.object({ text: z.string().trim().min(1).max(500), is_correct: z.boolean() }))
          .min(2)
          .max(10),
      }),
    )
    .max(200),
})

const passMarkSchema = z.object({ pass_percentage: z.number().int().min(1).max(100) })

type CourseRow = {
  id: string
  title: string
  description: string | null
  pass_percentage: number
  max_attempts: number
  due_at: Date | null
  status: 'draft' | 'published' | 'archived'
  published_at: Date | null
  created_at: Date
}

async function lockCourse(tx: Tx, id: string): Promise<CourseRow> {
  const [course] = await tx<CourseRow[]>`
    select id, title, description, pass_percentage, max_attempts, due_at, status, published_at, created_at
    from courses where id = ${id} for update`
  if (!course) throw new HttpError(404, 'not_found')
  return course
}

async function lockDraft(tx: Tx, id: string): Promise<CourseRow> {
  const course = await lockCourse(tx, id)
  if (course.status !== 'draft') throw new HttpError(409, 'not_draft')
  return course
}

async function loadCourse(db: postgres.Sql | Tx, id: string) {
  const [course] = await db<CourseRow[]>`
    select id, title, description, pass_percentage, max_attempts, due_at, status, published_at, created_at
    from courses where id = ${id}`
  if (!course) throw new HttpError(404, 'not_found')
  const videos = await db`
    select id, position, title, youtube_video_id, duration_seconds
    from videos where course_id = ${id} order by position`
  const questions = await db`
    select q.id, q.position, q.text, q.type, q.points,
           coalesce(json_agg(json_build_object('id', o.id, 'position', o.position, 'text', o.text, 'is_correct', o.is_correct)
                    order by o.position) filter (where o.id is not null), '[]') as options
    from questions q left join options o on o.question_id = q.id
    where q.course_id = ${id}
    group by q.id order by q.position`
  return { ...course, videos, questions }
}

// Reasons a draft can't be published yet (empty list = ready).
async function publishProblems(tx: Tx, id: string): Promise<string[]> {
  const problems: string[] = []
  const videos = await tx<{ position: number; youtube_video_id: string }[]>`
    select position, youtube_video_id from videos where course_id = ${id} order by position`
  const questions = await tx<{ position: number; type: string; options: number; correct: number }[]>`
    select q.position, q.type, count(o.id)::int as options, count(o.id) filter (where o.is_correct)::int as correct
    from questions q left join options o on o.question_id = q.id
    where q.course_id = ${id} group by q.id order by q.position`
  if (videos.length === 0) problems.push('Add at least one video.')
  if (questions.length === 0) problems.push('Add at least one question.')
  for (const q of questions) {
    if (q.options < 2) problems.push(`Question ${q.position} needs at least two options.`)
    if (q.type === 'single' && q.correct !== 1) problems.push(`Question ${q.position} must have exactly one correct option.`)
    if (q.type === 'multiple' && q.correct < 1) problems.push(`Question ${q.position} needs at least one correct option.`)
  }
  for (const v of videos) {
    const check = await checkEmbeddable(v.youtube_video_id)
    if (!check.ok) {
      problems.push(
        check.reason === 'check_failed'
          ? `Video ${v.position}: couldn't reach YouTube to check it. Try again.`
          : `Video ${v.position} can't be embedded (it may be private, removed, or have embedding turned off).`,
      )
    }
  }
  return problems
}

export const courses = new Hono<AppEnv>()

courses.get('/courses', async (c) => {
  const rows = await sql()`
    select c.id, c.title, c.status, c.pass_percentage, c.due_at, c.published_at, c.created_at,
      (select count(*) from videos v where v.course_id = c.id)::int as video_count,
      (select count(*) from questions q where q.course_id = c.id)::int as question_count,
      (select count(*) from enrollments e where e.course_id = c.id)::int as enrolled,
      (select count(*) from enrollments e where e.course_id = c.id and e.status = 'completed')::int as completed,
      (select round(avg(e.best_score_pct), 2)::float8 from enrollments e
        where e.course_id = c.id and e.best_score_pct is not null) as average_score
    from courses c
    order by case c.status when 'draft' then 0 when 'published' then 1 else 2 end, c.created_at desc`
  return c.json({ courses: rows })
})

courses.post('/courses', async (c) => {
  const body = await parseBody(c, detailsSchema)
  const user = c.get('user')
  const id = await sql().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into courses (title, description, pass_percentage, due_at, created_by)
      values (${body.title}, ${body.description ?? null}, ${body.pass_percentage},
              ${body.due_at ? new Date(body.due_at) : null}, ${user.id})
      returning id`
    await logActivity(tx, { actorUserId: user.id, action: 'course.created', courseId: row.id })
    return row.id
  })
  return c.json(await loadCourse(sql(), id), 201)
})

courses.get('/courses/:id', async (c) => c.json(await loadCourse(sql(), uuidParam(c, 'id'))))

courses.put('/courses/:id', async (c) => {
  const id = uuidParam(c, 'id')
  const body = await parseBody(c, detailsSchema)
  await sql().begin(async (tx) => {
    await lockDraft(tx, id)
    await tx`
      update courses set title = ${body.title}, description = ${body.description ?? null},
        pass_percentage = ${body.pass_percentage}, due_at = ${body.due_at ? new Date(body.due_at) : null}
      where id = ${id}`
  })
  return c.json(await loadCourse(sql(), id))
})

courses.put('/courses/:id/videos', async (c) => {
  const id = uuidParam(c, 'id')
  const body = await parseBody(c, videosSchema)
  await sql().begin(async (tx) => {
    await lockDraft(tx, id)
    await tx`delete from videos where course_id = ${id}`
    for (const [i, v] of body.videos.entries()) {
      await tx`
        insert into videos (course_id, position, title, youtube_video_id, duration_seconds)
        values (${id}, ${i + 1}, ${v.title}, ${v.youtube_video_id}, ${v.duration_seconds})`
    }
  })
  return c.json(await loadCourse(sql(), id))
})

courses.put('/courses/:id/questions', async (c) => {
  const id = uuidParam(c, 'id')
  const body = await parseBody(c, questionsSchema)
  await sql().begin(async (tx) => {
    await lockDraft(tx, id)
    await tx`delete from questions where course_id = ${id}`
    for (const [i, q] of body.questions.entries()) {
      const [question] = await tx<{ id: string }[]>`
        insert into questions (course_id, position, text, type, points)
        values (${id}, ${i + 1}, ${q.text}, ${q.type}, ${q.points}) returning id`
      for (const [j, o] of q.options.entries()) {
        await tx`
          insert into options (question_id, position, text, is_correct)
          values (${question.id}, ${j + 1}, ${o.text}, ${o.is_correct})`
      }
    }
  })
  return c.json(await loadCourse(sql(), id))
})

courses.post('/courses/:id/publish', async (c) => {
  const id = uuidParam(c, 'id')
  const user = c.get('user')
  await sql().begin(async (tx) => {
    await lockDraft(tx, id)
    const problems = await publishProblems(tx, id)
    if (problems.length > 0) throw new HttpError(422, 'cannot_publish', problems)
    await tx`update courses set status = 'published', published_at = now() where id = ${id}`
    await logActivity(tx, { actorUserId: user.id, action: 'course.published', courseId: id })
  })
  return c.json(await loadCourse(sql(), id))
})

courses.post('/courses/:id/duplicate', async (c) => {
  const id = uuidParam(c, 'id')
  const user = c.get('user')
  const newId = await sql().begin(async (tx) => {
    const source = await lockCourse(tx, id)
    const [copy] = await tx<{ id: string }[]>`
      insert into courses (title, description, pass_percentage, max_attempts, due_at, created_by)
      values (${`${source.title} (copy)`.slice(0, 200)}, ${source.description}, ${source.pass_percentage},
              ${source.max_attempts}, ${source.due_at}, ${user.id})
      returning id`
    await tx`
      insert into videos (course_id, position, title, youtube_video_id, duration_seconds)
      select ${copy.id}, position, title, youtube_video_id, duration_seconds from videos where course_id = ${id}`
    const questions = await tx<{ id: string; position: number; text: string; type: string; points: number }[]>`
      select id, position, text, type, points from questions where course_id = ${id} order by position`
    for (const q of questions) {
      const [nq] = await tx<{ id: string }[]>`
        insert into questions (course_id, position, text, type, points)
        values (${copy.id}, ${q.position}, ${q.text}, ${q.type}, ${q.points}) returning id`
      await tx`
        insert into options (question_id, position, text, is_correct)
        select ${nq.id}, position, text, is_correct from options where question_id = ${q.id}`
    }
    await logActivity(tx, { actorUserId: user.id, action: 'course.duplicated', courseId: copy.id, details: { from_course_id: id } })
    return copy.id
  })
  return c.json(await loadCourse(sql(), newId), 201)
})

courses.post('/courses/:id/archive', async (c) => {
  const id = uuidParam(c, 'id')
  const user = c.get('user')
  await sql().begin(async (tx) => {
    const course = await lockCourse(tx, id)
    if (course.status === 'archived') throw new HttpError(409, 'already_archived')
    await tx`update courses set status = 'archived' where id = ${id}`
    await logActivity(tx, { actorUserId: user.id, action: 'course.archived', courseId: id })
  })
  return c.json(await loadCourse(sql(), id))
})

// The pass mark can change at any time; pass/fail is computed from it (9.3).
courses.put('/courses/:id/pass-mark', async (c) => {
  const id = uuidParam(c, 'id')
  const body = await parseBody(c, passMarkSchema)
  const user = c.get('user')
  await sql().begin(async (tx) => {
    const course = await lockCourse(tx, id)
    if (course.pass_percentage === body.pass_percentage) return
    await tx`update courses set pass_percentage = ${body.pass_percentage} where id = ${id}`
    await logActivity(tx, {
      actorUserId: user.id,
      action: 'course.pass_mark_changed',
      courseId: id,
      details: { from: course.pass_percentage, to: body.pass_percentage },
    })
  })
  return c.json(await loadCourse(sql(), id))
})
