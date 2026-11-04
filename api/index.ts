import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

// Vercel entry: the only file that knows about Vercel (architecture.md section 2).
const handler = handle(app)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
