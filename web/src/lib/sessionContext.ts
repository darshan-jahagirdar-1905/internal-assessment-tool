import { createContext, useContext } from 'react'
import type { Me } from '../api/learnerApi.ts'

// Who is signed in. The provider is in session.tsx.
export type Session =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'signed-in'; me: Me }

export const SessionContext = createContext<Session>({ status: 'loading' })

export const useSession = () => useContext(SessionContext)

export function useMe(): Me {
  const session = useSession()
  if (session.status !== 'signed-in') throw new Error('useMe used outside a signed-in shell')
  return session.me
}
