import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyCourses, type CourseListItem } from '../../api/learnerApi.ts'
import { Card, EmptyState, StatTile } from '../../components/ui.tsx'
import { useMe } from '../../lib/sessionContext.ts'
import { dueText } from './courseFormat.ts'
import { EnrollmentBadge, ProgressBar } from './courseUi.tsx'

// My courses (execution step C2).
function Dashboard() {
  const me = useMe()
  const firstName = (me.full_name ?? me.email).split(/[ @.]/)[0]
  const [courses, setCourses] = useState<CourseListItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    listMyCourses().then((r) => setCourses(r.courses)).catch(() => setError(true))
  }, [])

  const mine = (courses ?? []).filter((c) => c.enrollment)
  const completed = mine.filter((c) => c.enrollment?.status === 'completed').length
  const available = (courses ?? []).filter((c) => !c.enrollment && c.status === 'published').length

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1>Welcome, {firstName}</h1>
      </div>
      <div className="grid grid-stats">
        <StatTile icon="book" value={mine.length} label="Enrolled" />
        <StatTile icon="clock" value={mine.length - completed} label="In progress" />
        <StatTile icon="check" value={completed} label="Completed" />
      </div>
      <Card title="My courses">
        {error && <div className="alert alert-danger">Could not load your courses.</div>}
        {!courses && !error && <p className="muted">Loading…</p>}
        {courses && mine.length === 0 && (
          <EmptyState
            title="No courses yet"
            text={available > 0 ? 'Browse the course catalog to enroll.' : 'Courses you enroll in or are assigned will show here.'}
          />
        )}
        {mine.length > 0 && (
          <div className="grid grid-cards">
            {mine.map((c) => {
              const e = c.enrollment!
              return (
                <Link key={c.id} to={`/courses/${c.id}`} className="course-card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="course-card-title">{c.title}</span>
                    <EnrollmentBadge course={c} />
                  </div>
                  {e.status === 'completed' && e.score_pct !== null ? (
                    <p className="course-card-meta">Your score: <strong>{e.score_pct}%</strong></p>
                  ) : (
                    <>
                      <p className="course-card-meta">{e.videos_completed} of {c.video_count} videos watched · {e.progress_pct}%</p>
                      <ProgressBar value={e.progress_pct} label={`${c.title} progress`} />
                    </>
                  )}
                  {dueText(c.due_at) && <p className="course-card-meta">{dueText(c.due_at)}</p>}
                  {e.source === 'admin' && <p className="course-card-meta">Assigned by HR</p>}
                </Link>
              )
            })}
          </div>
        )}
        {courses && available > 0 && (
          <p style={{ marginBottom: 0 }}><Link to="/courses">See all {available} available course{available === 1 ? '' : 's'} →</Link></p>
        )}
      </Card>
    </div>
  )
}

export default Dashboard
