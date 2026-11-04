import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { setTestUser } from '../../api/client.ts'
import { getHealth } from '../../api/learnerApi.ts'

// Real sign-in (WorkOS) arrives in execution step C6. Until then, preview
// deployments and local runs offer test sign-in (architecture.md section 4.2).
function SignIn() {
  const navigate = useNavigate()
  const [testSignin, setTestSignin] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    getHealth()
      .then((h) => setTestSignin(h.testSignin))
      .catch(() => setTestSignin(false))
  }, [])

  function onTestSignIn(e: FormEvent) {
    e.preventDefault()
    setTestUser(email.trim())
    navigate('/')
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p>
        <a href="/api/auth/signin">Sign in with your company email</a>
      </p>
      {testSignin && (
        <form onSubmit={onTestSignIn}>
          <h2>Test sign-in</h2>
          <p>Preview and local only. Enter a company email address.</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@transfunnel.com"
          />
          <button type="submit">Continue</button>
        </form>
      )}
    </main>
  )
}

export default SignIn
