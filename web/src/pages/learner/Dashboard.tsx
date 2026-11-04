import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, setTestUser } from '../../api/client.ts'
import { getMe, type Me } from '../../api/learnerApi.ts'

// Placeholder dashboard: shows who is signed in. Courses arrive in step C2.
function Dashboard() {
  const navigate = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) navigate('/signin', { replace: true })
        else setError('Something went wrong. Try again later.')
      })
  }, [navigate])

  function signOut() {
    setTestUser(null)
    navigate('/signin')
  }

  if (error) return <main><p>{error}</p></main>
  if (!me) return <main><p>Loading…</p></main>
  return (
    <main>
      <h1>My courses</h1>
      <p>Signed in as {me.email}</p>
      {me.role === 'admin' && <p><Link to="/admin">Admin</Link></p>}
      <button type="button" onClick={signOut}>Sign out</button>
    </main>
  )
}

export default Dashboard
