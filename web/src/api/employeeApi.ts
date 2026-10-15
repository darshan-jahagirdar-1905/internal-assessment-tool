// All employee calls go to the `employee` Edge Function with the
// `x-assessment-token` header. The token is never put in a query string.
// Endpoints: architecture.md section 6.2.
const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/employee`

export async function employeeRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'x-assessment-token': token,
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`employee ${path} failed: ${res.status}`)
  return (await res.json()) as T
}
