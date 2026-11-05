import type postgres from 'postgres'

type Tx = postgres.Sql | postgres.TransactionSql

// One row in activity_log (architecture.md section 10, "Audit").
export async function logActivity(
  tx: Tx,
  entry: { actorUserId: string | null; action: string; courseId?: string | null; enrollmentId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await tx`
    insert into activity_log (actor_user_id, action, course_id, enrollment_id, details)
    values (${entry.actorUserId}, ${entry.action}, ${entry.courseId ?? null}, ${entry.enrollmentId ?? null},
            ${entry.details ? tx.json(entry.details as postgres.JSONValue) : null})`
}
