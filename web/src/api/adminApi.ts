// All admin calls go to the `admin` Edge Function with the `x-admin-password`
// header. Endpoints: architecture.md section 6.1.
const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin`

export async function adminRequest<T>(
  path: string,
  password: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'x-admin-password': password,
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`admin ${path} failed: ${res.status}`)
  return (await res.json()) as T
}
