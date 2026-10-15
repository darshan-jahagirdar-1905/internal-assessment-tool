// `employee` Edge Function. Every request must resolve the assignment from the
// x-assessment-token header first, and never return answer keys.
// Endpoints: architecture.md section 6.2. Not implemented yet.
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return json({ error: 'not_implemented' }, 501)
})
