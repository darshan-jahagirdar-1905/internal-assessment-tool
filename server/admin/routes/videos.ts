import { Hono } from 'hono'
import { z } from 'zod'
import { parseBody } from '../../lib/http.js'
import type { AppEnv } from '../../lib/identity.js'
import { checkEmbeddable } from '../../lib/youtube.js'

// Checks a YouTube link before it is added to a course (architecture.md 7.3).
export const videos = new Hono<AppEnv>().post('/videos/check', async (c) => {
  const { url } = await parseBody(c, z.object({ url: z.string().trim().min(1).max(500) }))
  return c.json(await checkEmbeddable(url))
})
