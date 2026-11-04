import postgres from 'postgres'

// One small pool per function instance. Supabase's transaction pooler
// (port 6543) does not support prepared statements, so they are off.
let client: postgres.Sql | undefined

export function sql(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    client = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 })
  }
  return client
}

export async function databaseIsUp(): Promise<boolean> {
  try {
    await sql()`select 1`
    return true
  } catch {
    return false
  }
}
