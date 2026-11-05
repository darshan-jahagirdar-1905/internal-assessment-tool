import { useState } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getTestUser, setTestUser } from '../api/client.ts'
import { SessionProvider } from '../lib/session.tsx'
import { useSession } from '../lib/sessionContext.ts'
import { Icon, type IconName } from './Icon.tsx'
import { EmptyState, Logo } from './ui.tsx'

type NavItem = { to: string; label: string; icon: IconName; end?: boolean }

const learnerNav: NavItem[] = [
  { to: '/', label: 'My courses', icon: 'book', end: true },
  { to: '/courses', label: 'Course catalog', icon: 'grid' },
]

// Admin screens are added here as they are built (execution steps C1 and C5).
const adminNav: NavItem[] = [
  { to: '/admin', label: 'Manage courses', icon: 'layers', end: true },
  { to: '/admin/users', label: 'Users', icon: 'users' },
]

function Shell() {
  const session = useSession()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  if (session.status === 'loading') return <div className="page muted">Loading…</div>
  if (session.status === 'signed-out') return <Navigate to="/signin" replace />
  if (session.status === 'error') {
    return (
      <div className="page">
        <EmptyState title="Something went wrong" text="Try again in a minute." />
      </div>
    )
  }

  const { me } = session
  const items = me.role === 'admin' ? [...learnerNav, ...adminNav] : learnerNav
  const displayName = me.full_name ?? me.email

  function signOut() {
    if (getTestUser()) {
      setTestUser(null)
      navigate('/signin')
      return
    }
    // Real sign-in: a form POST, so the API can clear the session cookie and
    // send the browser on to WorkOS's sign-out page.
    const form = document.createElement('form')
    form.method = 'post'
    form.action = '/api/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <>
      <header className="topbar">
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          <Logo />
        </NavLink>
        <div className="topbar-actions">
          <span className="user-chip">
            <span className="avatar">{displayName.charAt(0)}</span>
            <span className="user-name">{displayName}</span>
          </span>
          <button type="button" className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <nav className="navbar" aria-label="Main">
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name="menu" /> Menu
        </button>
        <ul className={`nav-links${menuOpen ? ' open' : ''}`}>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>
                <Icon name={item.icon} size={18} /> {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}

export function AppShell() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  )
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const session = useSession()
  if (session.status === 'signed-in' && session.me.role !== 'admin') {
    return <EmptyState title="Admins only" text="You don't have access to this page." />
  }
  return <>{children}</>
}
