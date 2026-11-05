import { Hono } from 'hono'
import { z } from 'zod'
import { logActivity } from '../../lib/activity.js'
import { sql } from '../../lib/db.js'
import { HttpError, parseBody, uuidParam } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'

// Video watch tracking (architecture.md 9.1, execution step C3). The browser
// reports which 5-second segments it played; record_video_progress decides
// what to credit. Scoped to the signed-in user's own enrollment.

const progressSchema = z.object({
  segments: z.array(z.number().int().min(0).max(20000)).max(500),
  position: z.number().int().min(0).max(24 * 60 * 60),
})

const KNOWN_REFUSALS = new Set(['video_locked', 'past_due', 'course_not_open'])

async function myEnrollmentFor(videoId: string, userId: string) {
  const [row] = await sql()<{ enrollment_id: string; course_id: string }[]>`
    select e.id as enrollment_id, v.course_id
    from videos v join enrollments e on e.course_id = v.course_id and e.user_id = ${userId}
    where v.id = ${videoId}`
  if (!row) throw new HttpError(404, 'not_found')
  return row
}

export const videos = new Hono<AppEnv>()

videos.post('/videos/:id/progress', async (c) => {
  const videoId = uuidParam(c, 'id')
  const body = await parseBody(c, progressSchema)
  const { enrollment_id } = await myEnrollmentFor(videoId, c.get('user').id)
  try {
    const [p] = await sql()<{ watched_segments: number; total_segments: number; completed: boolean; last_position_seconds: number }[]>`
      select * from record_video_progress(${enrollment_id}, ${videoId}, ${body.segments}, ${body.position})`
    return c.json({ ...p, watched_pct: Math.min(100, Math.round((p.watched_segments * 100) / p.total_segments)) })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (KNOWN_REFUSALS.has(message)) throw new HttpError(409, message)
    throw err
  }
})

// The player couldn't play the video (removed, private, embedding off).
videos.post('/videos/:id/error', async (c) => {
  const videoId = uuidParam(c, 'id')
  const body = await parseBody(c, z.object({ code: z.number().int().min(0).max(1000) }))
  const user = c.get('user')
  const { enrollment_id, course_id } = await myEnrollmentFor(videoId, user.id)
  await logActivity(sql(), {
    actorUserId: user.id,
    action: 'video.unavailable',
    courseId: course_id,
    enrollmentId: enrollment_id,
    details: { video_id: videoId, youtube_error: body.code },
  })
  return c.json({ ok: true })
})
