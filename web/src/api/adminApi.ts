// All admin calls (/api/admin/*). Endpoints: architecture.md section 7.3.
// Calls are added from execution step C1.
import { apiRequest } from './client.ts'

export const adminRequest = <T>(path: string, init?: RequestInit) =>
  apiRequest<T>(`/admin${path}`, init)
