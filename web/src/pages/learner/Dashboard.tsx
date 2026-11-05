import { EmptyState, StatTile, Card } from '../../components/ui.tsx'
import { useMe } from '../../lib/sessionContext.ts'

// My courses. Real course data arrives in execution step C2.
function Dashboard() {
  const me = useMe()
  const firstName = (me.full_name ?? me.email).split(/[ @.]/)[0]

  return (
    <>
      <div className="page-header">
        <h1>Welcome, {firstName}</h1>
      </div>
      <div className="grid grid-stats" style={{ marginBottom: 'var(--space-5)' }}>
        <StatTile icon="book" value={0} label="Enrolled" />
        <StatTile icon="clock" value={0} label="In progress" />
        <StatTile icon="check" value={0} label="Completed" />
      </div>
      <Card title="My courses">
        <EmptyState title="No courses yet" text="Courses you enroll in or are assigned will show here." />
      </Card>
    </>
  )
}

export default Dashboard
