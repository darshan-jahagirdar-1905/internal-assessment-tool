import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { enroll, listMyCourses, type CourseListItem } from '../../api/learnerApi.ts'
import { Card, EmptyState } from '../../components/ui.tsx'
import { dueText, minutes } from './courseFormat.ts'
import { EnrollmentBadge } from './courseUi.tsx'

// Course catalog: published courses, enroll (execution step C2).
function Catalog() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    listMyCourses().then((r) => setCourses(r.courses)).catch(() => setError('Could not load courses.'))
  }, [])

  async function onEnroll(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await enroll(id)
      navigate(`/courses/${id}`)
    } catch {
      setError('Could not enroll. The course may have closed.')
      setBusyId(null)
    }
  }

  const published = (courses ?? []).filter((c) => c.status === 'published')

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1>Course catalog</h1>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!courses && !error && <p className="muted">Loading…</p>}
      {courses && published.length === 0 && (
        <Card title="Available courses">
          <EmptyState title="No courses published yet" text="When HR publishes a course, you can enroll here." />
        </Card>
      )}
      {published.length > 0 && (
        <div className="grid grid-cards">
          {published.map((c) => (
            <section key={c.id} className="card course-tile">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="course-card-title">{c.title}</h2>
                <EnrollmentBadge course={c} />
              </div>
              {c.description && <p className="course-card-desc">{c.description}</p>}
              <p className="course-card-meta">
                {c.video_count} video{c.video_count === 1 ? '' : 's'} · {minutes(c.total_seconds)} · {c.question_count} question{c.question_count === 1 ? '' : 's'}
              </p>
              {dueText(c.due_at) && <p className="course-card-meta">{dueText(c.due_at)}</p>}
              <div className="course-tile-actions">
                {c.enrollment ? (
                  <Link className="button button-secondary" to={`/courses/${c.id}`}>Open course</Link>
                ) : (
                  <button className="button button-primary" disabled={busyId === c.id} onClick={() => void onEnroll(c.id)}>
                    {busyId === c.id ? 'Enrolling…' : 'Enroll'}
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default Catalog
