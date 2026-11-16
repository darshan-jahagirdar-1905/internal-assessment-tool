import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { enroll, getCoursePage, type CourseLevel, type CoursePage as Course } from '../../api/learnerApi.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { Icon } from '../../components/Icon.tsx'
import { formatDuration } from '../../lib/youtube.ts'
import { dueText } from './courseFormat.ts'
import { ProgressBar } from './courseUi.tsx'

// Course page: the level path (architecture.md 9.8, step L3). Each level shows
// its videos, then its quiz; the final test comes last. A course with a single
// level and no level quiz (made before levels) shows a plain video list.

type CourseVideo = Course['videos'][number]

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
  const hasPath = course.levels.length > 1 || course.levels.some((l) => l.quiz.question_count > 0)
  const passedLevels = course.levels.filter((l) => l.passed).length
  const videoById = new Map(course.videos.map((v) => [v.id, v]))

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

      {hasPath ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {course.enrollment
              ? `${passedLevels} of ${course.levels.length} levels passed · ${done} of ${course.videos.length} videos watched`
              : `${course.levels.length} levels. Enroll to start: watch each level's videos, then pass its quiz to unlock the next level.`}
          </p>
          <ol className="level-path">
            {course.levels.map((level) => (
              <LevelNode
                key={level.id}
                course={course}
                level={level}
                videos={level.video_ids.map((vid) => videoById.get(vid)).filter((v): v is CourseVideo => Boolean(v))}
              />
            ))}
            <li className={`level-node is-final${a.state === 'locked' || a.state === 'not_enrolled' ? ' is-locked' : ''}`}>
              <span className="level-marker" aria-hidden="true">
                {a.state === 'completed' ? <Icon name="check" /> : <Icon name="chart" />}
              </span>
              <AssessmentCard course={course} />
            </li>
          </ol>
        </>
      ) : (
        <>
          <Card title={`Videos · ${done} of ${course.videos.length} watched`}>
            {!course.enrollment && <p className="muted" style={{ marginTop: 0 }}>Enroll to start watching. Each video must be watched to 80% before the next one unlocks.</p>}
            <VideoList course={course} videos={course.videos} />
          </Card>
          <AssessmentCard course={course} />
        </>
      )}
    </div>
  )
}

function LevelNode({ course, level, videos }: { course: Course; level: CourseLevel; videos: CourseVideo[] }) {
  const enrolled = Boolean(course.enrollment)
  const state = level.passed ? 'passed' : level.unlocked ? 'open' : 'locked'
  const previous = course.levels.find((l) => l.position < level.position && !l.passed)
  return (
    <li className={`level-node is-${state}`}>
      <span className="level-marker" aria-hidden="true">
        {state === 'passed' ? <Icon name="check" /> : state === 'locked' ? <span className="lock">🔒</span> : <strong>{level.position}</strong>}
      </span>
      <Card>
        <div className="level-head">
          <div>
            <div className="muted level-kicker">Level {level.position}</div>
            <h2 className="level-title">{level.title}</h2>
          </div>
          {state === 'passed' && <Badge tone="ok">Passed</Badge>}
          {state === 'open' && enrolled && <Badge tone="warn">In progress</Badge>}
        </div>
        {state === 'locked' && enrolled ? (
          <p className="muted" style={{ margin: 0 }}>
            Pass {previous ? `Level ${previous.position}` : 'the previous level'} to unlock · {videos.length} video{videos.length === 1 ? '' : 's'}
            {level.quiz.question_count > 0 ? ` and a ${level.quiz.question_count}-question quiz` : ''}
          </p>
        ) : (
          <>
            <VideoList course={course} videos={videos} />
            {level.quiz.question_count > 0 && <QuizRow course={course} level={level} />}
          </>
        )}
      </Card>
    </li>
  )
}

function QuizRow({ course, level }: { course: Course; level: CourseLevel }) {
  const q = level.quiz
  const to = `/courses/${course.id}/levels/${level.id}/quiz`
  return (
    <div className={`video-row quiz-row${q.unlocked ? '' : ' is-locked'}`}>
      <span className="video-status" aria-hidden="true">{q.passed ? <Icon name="check" /> : <Icon name="layers" />}</span>
      <div className="grow">
        <div className="video-title">Level quiz</div>
        <div className="muted">
          {q.question_count} question{q.question_count === 1 ? '' : 's'} · all correct to pass, as many tries as you need
          {q.tries > 0 && !q.passed ? ` · ${q.tries} tr${q.tries === 1 ? 'y' : 'ies'} so far` : ''}
        </div>
      </div>
      <span>
        {q.passed ? <span className="row-actions"><Badge tone="ok">Passed</Badge><Link className="button button-secondary button-small" to={to}>Practise again</Link></span>
          : q.unlocked ? <Link className="button button-primary button-small" to={to}>{q.tries > 0 ? 'Try again' : 'Take the quiz'}</Link>
          : <span className="muted">{course.enrollment ? 'Watch the videos first' : 'Locked'}</span>}
      </span>
    </div>
  )
}

function VideoList({ course, videos }: { course: Course; videos: CourseVideo[] }) {
  return (
    <ol className="video-list">
      {videos.map((v) => (
        <li key={v.id} className={`video-row${v.locked ? ' is-locked' : ''}`}>
          <span className="video-status" aria-hidden="true">
            {v.completed ? <Icon name="check" /> : v.locked ? <span className="lock">🔒</span> : <Icon name="play" />}
          </span>
          <div className="grow">
            <div className="video-title">{v.title}</div>
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
  )
}

function AssessmentCard({ course }: { course: Course }) {
  const a = course.assessment
  const hasLevels = course.levels.some((l) => l.quiz.question_count > 0)
  return (
    <Card title={hasLevels ? 'Final test' : 'Assessment'}>
      <p style={{ marginTop: 0 }}>{a.question_count} question{a.question_count === 1 ? '' : 's'}. You can take it once; this is your score for the course.</p>
      {a.state === 'not_enrolled' && <p className="muted">Enroll and work through the course to unlock it.</p>}
      {a.state === 'locked' && (
        <p className="muted">{hasLevels ? 'Unlocks when you’ve passed every level.' : 'Unlocks when you’ve watched every video (at least 80% of each).'}</p>
      )}
      {(a.state === 'available' || a.state === 'in_progress') && (
        <div className="row-actions">
          <Link className="button button-primary" to={`/courses/${course.id}/assessment`}>{a.state === 'available' ? (hasLevels ? 'Go to the final test' : 'Go to the assessment') : 'Continue'}</Link>
          <span className="muted">{a.state === 'available' ? 'Ready when you are.' : 'Your answers so far are saved.'}</span>
        </div>
      )}
      {a.state === 'completed' && a.score_pct !== null && (
        <div className="score"><span className="stat-value">{a.score_pct}%</span><span className="muted">Your score</span></div>
      )}
      {a.state === 'closed' && <p className="muted">This test is closed.</p>}
    </Card>
  )
}

export default CoursePage
