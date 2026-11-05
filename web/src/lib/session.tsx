import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../api/client.ts'
import { getMe } from '../api/learnerApi.ts'
import { SessionContext, type Session } from './sessionContext.ts'

// Loads who is signed in once for the whole shell.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' })

  useEffect(() => {
    getMe()
      .then((me) => setSession({ status: 'signed-in', me }))
      .catch((err: unknown) =>
        setSession(err instanceof ApiError && err.status === 401 ? { status: 'signed-out' } : { status: 'error' }),
      )
  }, [])

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
