import { useEffect, useState } from 'react'
import { listUsers, setUserRole, type AdminUser } from '../../api/adminApi.ts'
import { Badge, Card } from '../../components/ui.tsx'
import { useMe } from '../../lib/sessionContext.ts'
import { formatDateTime } from './resultsFormat.ts'

// Users and roles (step C5): search people, make someone an admin or a
// learner. An admin can't change their own role.
function Users() {
  const me = useMe()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listUsers(query).then((r) => setUsers(r.users)).catch(() => setError('Could not load users.'))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  async function changeRole(user: AdminUser) {
    const role = user.role === 'admin' ? 'learner' : 'admin'
    const question = role === 'admin'
      ? `Make ${user.email} an admin? They will be able to build courses and see everyone's results.`
      : `Remove admin access from ${user.email}?`
    if (!window.confirm(question)) return
    setBusyId(user.id)
    setError(null)
    try {
      const updated = await setUserRole(user.id, role)
      setUsers((list) => list?.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)) ?? null)
    } catch {
      setError('Could not change the role.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}><h1>Users</h1></div>
      <Card>
        <input className="input" style={{ maxWidth: 360 }} placeholder="Search by email or name" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
        <p className="muted" style={{ marginBottom: 0 }}>People appear here once they sign in or are assigned a course.</p>
      </Card>
      {error && <div className="alert alert-danger">{error}</div>}
      <Card title={users ? `${users.length}${users.length === 200 ? '+' : ''} ${users.length === 1 ? 'person' : 'people'}` : 'People'}>
        {users === null ? <p className="muted">Loading…</p> : users.length === 0 ? <p className="muted" style={{ margin: 0 }}>No matches.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Role</th><th>Courses</th><th>First signed in</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><div>{u.full_name ?? u.email}</div>{u.full_name && <div className="muted">{u.email}</div>}</td>
                    <td>{u.role === 'admin' ? <Badge tone="ok">Admin</Badge> : <Badge tone="neutral">Learner</Badge>}</td>
                    <td>{u.enrollments}</td>
                    <td>{u.first_signed_in_at ? formatDateTime(u.first_signed_in_at) : <span className="muted">Not yet</span>}</td>
                    <td>
                      {u.id === me.id ? <span className="muted">You</span> : (
                        <button className="button button-secondary button-small" disabled={busyId === u.id} onClick={() => void changeRole(u)}>
                          {u.role === 'admin' ? 'Make learner' : 'Make admin'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Users
