// CORS headers for the frontend. The site's origin is APP_BASE_URL.
const allowedOrigin = Deno.env.get('APP_BASE_URL') ?? ''

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-admin-password, x-assessment-token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Vary': 'Origin',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
