import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getEnrollmentReport, type EnrollmentReport as Report } from '../../api/adminApi.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { formatDuration } from '../../lib/youtube.ts'
import { ProgressBar } from '../learner/courseUi.tsx'
import { enrollmentBadge, formatDateTime } from './resultsFormat.ts'
import { ResultBadge } from './resultsUi.tsx'

// One person's report for one course (step C5): video progress, and every
// attempt with every answer and whether it was correct. Admins only.
function EnrollmentReport() {
  const { id = '' } = useParams()
  const [report, setReport] = useState<Report | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    getEnrollmentReport(id).then(setReport).catch(() => setNotFound(true))
  }, [id])

  if (notFound) return <EmptyState title="Report not found" />
  if (!report) return <p className="muted">Loading…</p>

  const { course, enrollment: e, videos, attempts } = report
  const s = enrollmentBadge(e)

  return (
    <div className="stack">
      <div>
        <p style={{ margin: 0 }}><Link to={`/admin/courses/${course.id}/results`}>← {course.title}: results</Link></p>
        <h1 style={{ marginBottom: 0 }}>{e.full_name ?? e.email}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {e.full_name ? `${e.email} · ` : ''}{e.source === 'admin' ? 'Assigned' : 'Enrolled themselves'} {formatDateTime(e.enrolled_at)}
          {!e.signed_in && ' · hasn’t signed in yet'}
        </p>
      </div>

      <Card>
        <div className="report-summary">
          <div><div className="muted">Status</div><Badge tone={s.tone}>{s.label}</Badge></div>
          <div><div className="muted">Score</div><strong>{e.score_pct === null ? '—' : `${e.score_pct}%`}</strong></div>
          <div><div className="muted">Result (pass mark {course.pass_percentage}%)</div><ResultBadge passed={e.passed} /></div>
          <div><div className="muted">Completed</div>{formatDateTime(e.completed_at)}</div>
        </div>
      </Card>

      <Card title={`Videos · ${e.videos_completed} of ${course.video_count} watched`}>
        <ol className="video-list">
          {videos.map((v) => (
            <li key={v.id} className="video-row">
              <div className="grow">
                <div className="video-title">{v.position}. {v.title}</div>
                <div className="muted">
                  {formatDuration(v.duration_seconds)} · {v.watched_pct}% watched
                  {v.completed_at ? ` · completed ${formatDateTime(v.completed_at)}` : ''}
                </div>
                <ProgressBar value={v.watched_pct} label={`${v.title} watched`} />
              </div>
              {v.completed_at ? <Badge tone="ok">Watched</Badge> : <Badge tone="neutral">Not yet</Badge>}
            </li>
          ))}
        </ol>
      </Card>

      {attempts.length === 0 && <Card title="Assessment"><p className="muted" style={{ margin: 0 }}>Not started.</p></Card>}
      {attempts.map((a) => (
        <Card key={a.id} title={`Assessment · attempt ${a.attempt_no}`}>
          <p style={{ marginTop: 0 }}>
            {a.status === 'submitted'
              ? <>Submitted {formatDateTime(a.submitted_at)}{a.submit_reason === 'due_date' ? ' (automatically, at the due date)' : ''}: <strong>{a.score_points} of {a.max_points} points, {a.score_pct}%</strong> <ResultBadge passed={a.passed} /></>
              : <>Started {formatDateTime(a.started_at)}, not submitted yet. Answers saved so far are shown.</>}
          </p>
          <ol className="answer-list">
            {a.answers.map((q) => {
              const answered = q.options.some((o) => o.selected)
              return (
                <li key={q.question_id} className="answer">
                  <div className="answer-head">
                    <strong>{q.position}. {q.text}</strong>
                    {q.is_correct === null ? null
                      : q.is_correct ? <Badge tone="ok">Correct</Badge>
                      : <Badge tone="danger">{answered ? 'Wrong' : 'Unanswered'}</Badge>}
                  </div>
                  <ul className="answer-options">
                    {q.options.map((o) => (
                      <li key={o.id} className={`${o.is_correct ? 'is-correct' : ''}${o.selected ? ' is-picked' : ''}`}>
                        <span aria-hidden="true">{o.selected ? '●' : '○'}</span> {o.text}
                        {o.selected && <span className="muted"> (picked)</span>}
                        {o.is_correct && <span className="correct-mark"> ✓ correct answer</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
        </Card>
      ))}
    </div>
  )
}

export default EnrollmentReport
