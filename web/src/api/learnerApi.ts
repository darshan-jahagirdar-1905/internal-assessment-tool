// All learner calls (/api/*). Endpoints: architecture.md section 7.2.
import { apiRequest } from './client.ts'

export type Health = { ok: boolean; db: boolean; testSignin: boolean }
export type Me = { id: string; email: string; full_name: string | null; role: 'learner' | 'admin' }

export const getHealth = () => apiRequest<Health>('/health')
export const getMe = () => apiRequest<Me>('/me')
