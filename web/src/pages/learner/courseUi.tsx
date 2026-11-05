import type { CourseListItem } from '../../api/learnerApi.ts'
import { Badge } from '../../components/ui.tsx'

// Small pieces shared by the dashboard, catalog and course page.

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function EnrollmentBadge({ course }: { course: CourseListItem }) {
  const e = course.enrollment
  if (!e) return null
  if (e.status === 'completed') return <Badge tone="ok">Completed</Badge>
  if (course.due_at && new Date(course.due_at) < new Date()) return <Badge tone="danger">Overdue</Badge>
  if (e.status === 'enrolled' && !e.started) return <Badge tone="neutral">Not started</Badge>
  return <Badge tone="warn">In progress</Badge>
}
