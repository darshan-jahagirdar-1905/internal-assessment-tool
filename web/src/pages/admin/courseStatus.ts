import type { CourseStatus } from '../../api/adminApi.ts'

export const statusBadge: Record<CourseStatus, { tone: 'neutral' | 'ok' | 'warn'; label: string }> = {
  draft: { tone: 'warn', label: 'Draft' },
  published: { tone: 'ok', label: 'Published' },
  archived: { tone: 'neutral', label: 'Archived' },
}
