import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { enroll, getCoursePage, type CoursePage as Course } from '../../api/learnerApi.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { Icon } from '../../components/Icon.tsx'
import { formatDuration } from '../../lib/youtube.ts'
import { dueText } from './courseFormat.ts'
import { ProgressBar } from './courseUi.tsx'

// Course page: videos in order with progress and locks, and the assessment
// card (execution step C2). Videos open in VideoPage, the assessment in
// AssessmentPage.
function CoursePage() {
  const { id = '' } = useParams()
  const [course, setCourse] = useState<Course | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    getCoursePage(id).then(setCourse).catch(() => setNotFound(true))
  }, [id])

  if (notFound) return <EmptyState title="Course not found" text="It may not be published yet." />
  if (!course) return <p className="muted">Loading…</p>

  async function onEnroll() {
    setEnrolling(true)
    setError(null)
    try {
      setCourse(await enroll(id))
    } catch {
      setError('Could not enroll. The course may have closed.')
    } finally {
      setEnrolling(false)
    }
  }

  const done = course.videos.filter((v) => v.completed).length
  const a = course.assessment

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <p style={{ margin: 0 }}><Link to="/">← My courses</Link></p>
          <h1>{course.title}</h1>
          {dueText(course.due_at) && <p className={course.past_due ? 'error-text' : 'muted'} style={{ margin: 0 }}>{dueText(course.due_at)}</p>}
        </div>
        {!course.enrollment && course.status === 'published' && !course.past_due && (
          <button className="button button-primary" onClick={() => void onEnroll()} disabled={enrolling}>
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </button>
        )}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {course.status === 'archived' && <div className="alert alert-info">This course has been closed. Your results are kept.</div>}
      {course.description && <Card><p style={{ margin: 0 }}>{course.description}</p></Card>}

      <Card title={`Videos · ${done} of ${course.videos.length} watched`}>
        {!course.enrollment && <p className="muted" style={{ marginTop: 0 }}>Enroll to start watching. Each video must be watched to 80% before the next one unlocks.</p>}
        <ol className="video-list">
          {course.videos.map((v) => (
            <li key={v.id} className={`video-row${v.locked ? ' is-locked' : ''}`}>
              <span className="video-status" aria-hidden="true">
                {v.completed ? <Icon name="check" /> : v.locked ? <span className="lock">🔒</span> : <Icon name="play" />}
              </span>
              <div className="grow">
                <div className="video-title">{v.position}. {v.title}</div>
                <div className="muted">{formatDuration(v.duration_seconds)}{v.watched_pct > 0 && !v.completed ? ` · ${v.watched_pct}% watched` : ''}</div>
                {!v.locked && !v.completed && v.watched_pct > 0 && <ProgressBar value={v.watched_pct} label={`${v.title} watched`} />}
              </div>
              <span>
                {v.completed ? <span className="row-actions"><Badge tone="ok">Watched</Badge><Link className="button button-secondary button-small" to={`/courses/${course.id}/videos/${v.id}`}>Watch again</Link></span>
                  : v.locked ? <span className="muted">{course.enrollment ? 'Watch the previous video first' : 'Locked'}</span>
                  : <Link className="button button-secondary button-small" to={`/courses/${course.id}/videos/${v.id}`}>{v.watched_pct > 0 ? 'Continue' : 'Watch'}</Link>}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Assessment">
        <p style={{ marginTop: 0 }}>{a.question_count} question{a.question_count === 1 ? '' : 's'}. You can take it once.</p>
        {a.state === 'not_enrolled' && <p className="muted">Enroll and watch the videos to unlock the assessment.</p>}
        {a.state === 'locked' && <p className="muted">Unlocks when you've watched every video (at least 80% of each).</p>}
        {(a.state === 'available' || a.state === 'in_progress') && (
          <div className="row-actions">
            <Link className="button button-primary" to={`/courses/${course.id}/assessment`}>{a.state === 'available' ? 'Go to the assessment' : 'Continue the assessment'}</Link>
            <span className="muted">{a.state === 'available' ? 'Ready when you are.' : 'Your answers so far are saved.'}</span>
          </div>
        )}
        {a.state === 'completed' && a.score_pct !== null && (
          <div className="score"><span className="stat-value">{a.score_pct}%</span><span className="muted">Your score</span></div>
        )}
        {a.state === 'closed' && <p className="muted">This assessment is closed.</p>}
      </Card>
    </div>
  )
}

export default CoursePage
