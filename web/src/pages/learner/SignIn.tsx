import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setTestUser } from '../../api/client.ts'
import { getHealth } from '../../api/learnerApi.ts'
import { Logo } from '../../components/ui.tsx'

// Sign-in (architecture.md 4.3): the button goes to WorkOS, which emails a
// 6-digit code. Local runs and preview deployments also offer test sign-in (4.2).

const NOTICES: Record<string, string> = {
  domain: 'Use your company email address to sign in.',
  failed: "Sign-in didn't finish. Please try again.",
  unavailable: "Sign-in isn't set up on this site yet.",
}

// Set by the API when the reason has to survive a trip through WorkOS.
function takeNoticeCookie(): string | null {
  const match = /(?:^|; )signin_notice=([a-z]+)/.exec(document.cookie)
  if (!match) return null
  document.cookie = 'signin_notice=; Max-Age=0; Path=/'
  return match[1]
}

function SignIn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [testSignin, setTestSignin] = useState(false)
  const [email, setEmail] = useState('')
  const [notice] = useState(() => {
    const reason = params.get('error') ?? takeNoticeCookie()
    return reason ? NOTICES[reason] ?? NOTICES.failed : null
  })

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
        <p className="muted" style={{ marginTop: 0 }}>Use your Transfunnel email. We'll email you a 6-digit code.</p>
        {notice && <div className="alert alert-danger" role="alert">{notice}</div>}
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
