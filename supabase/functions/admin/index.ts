// `admin` Edge Function. Every request must check x-admin-password first.
// Endpoints: architecture.md section 6.1. Not implemented yet.
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return json({ error: 'not_implemented' }, 501)
})
