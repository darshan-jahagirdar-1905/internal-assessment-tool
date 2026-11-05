import type postgres from 'postgres'

// Creating people (architecture.md section 15, convention 3): one place that
// adds users by email. Admin assign uses it; WorkOS sign-in (step C6) will
// attach to the same rows by email.
export async function ensureUsers(db: postgres.Sql | postgres.TransactionSql, emails: string[]) {
  if (emails.length === 0) return new Map<string, string>()
  await db`
    insert into users (email)
    select unnest(${emails}::text[])
    on conflict (email) do nothing`
  const rows = await db<{ id: string; email: string }[]>`
    select id, email from users where email = any(${emails}::text[])`
  return new Map(rows.map((r) => [r.email, r.id]))
}
