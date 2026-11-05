import { Badge } from '../../components/ui.tsx'

// Pass/fail badge for admin pages (step C5). Learners never see it.
export function ResultBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="muted">—</span>
  return passed ? <Badge tone="ok">Passed</Badge> : <Badge tone="danger">Not passed</Badge>
}
