import type { TrackingRow } from '../../api/adminApi.ts'

// Shared labels for the admin results and report pages (step C5).

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

export function enrollmentBadge(r: Pick<TrackingRow, 'status' | 'progress_pct'>): { tone: Tone; label: string } {
  switch (r.status) {
    case 'completed': return { tone: 'ok', label: 'Completed' }
    case 'assessment_in_progress': return { tone: 'warn', label: 'Taking assessment' }
    case 'videos_done': return { tone: 'warn', label: 'Videos done' }
    default: return r.progress_pct > 0 ? { tone: 'warn', label: 'Watching' } : { tone: 'neutral', label: 'Not started' }
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
