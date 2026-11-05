import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { setTestUser } from '../../api/client.ts'
import { getHealth } from '../../api/learnerApi.ts'
import { Logo } from '../../components/ui.tsx'

// Real sign-in (WorkOS) arrives in execution step C6. Until then, local runs
// (and preview deployments) offer test sign-in (architecture.md section 4.2).
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
    <main className="auth-page">
      <div className="card auth-card">
        <Logo />
        <h1 style={{ fontSize: '1.3rem', marginBottom: 'var(--space-2)' }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>Use your Transfunnel email to access your courses.</p>
        <a className="button button-primary" style={{ width: '100%' }} href="/api/auth/signin">
          Sign in with your company email
        </a>
        {testSignin && (
          <>
            <hr className="divider" />
            <form onSubmit={onTestSignIn}>
              <div className="field">
                <label htmlFor="test-email">Test sign-in (local only)</label>
                <input
                  id="test-email"
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@transfunnel.com"
                />
              </div>
              <button type="submit" className="button button-secondary" style={{ width: '100%' }}>
                Continue
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}

export default SignIn
