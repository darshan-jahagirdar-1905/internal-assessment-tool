import type postgres from 'postgres'

// Creating people (architecture.md section 15, convention 3): the one place
// that adds users. Admin assign adds them by email; WorkOS sign-in attaches to
// the same rows by email.
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

type SignedInUser = { id: string; email: string; full_name: string | null; role: 'learner' | 'admin' }

// First and later real sign-ins (architecture.md 4.3 step 4): match the WorkOS
// user id, else the email (people assigned before they ever signed in), then
// record the WorkOS id and the first sign-in time. A name from WorkOS fills an
// empty name only.
export async function upsertSignedInUser(
  db: postgres.Sql,
  person: { subject: string; email: string; name: string | null },
): Promise<SignedInUser> {
  return db.begin(async (tx) => {
    const [known] = await tx<SignedInUser[]>`
      update users
      set first_signed_in_at = coalesce(first_signed_in_at, now()),
          full_name = coalesce(full_name, ${person.name})
      where auth_subject = ${person.subject}
      returning id, email, full_name, role`
    if (known) return known
    const [user] = await tx<SignedInUser[]>`
      insert into users (email, full_name, auth_subject, first_signed_in_at)
      values (${person.email}, ${person.name}, ${person.subject}, now())
      on conflict (email) do update
        set auth_subject = excluded.auth_subject,
            first_signed_in_at = coalesce(users.first_signed_in_at, now()),
            full_name = coalesce(users.full_name, excluded.full_name)
      returning id, email, full_name, role`
    return user
  })
}
