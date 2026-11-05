import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  assignByEmail, downloadExport, getStats, getTracking,
  type AssignResult, type CourseStats, type TrackingRow,
} from '../../api/adminApi.ts'
import { ApiError } from '../../api/client.ts'
import { Badge, Card, EmptyState, StatTile } from '../../components/ui.tsx'
import { ProgressBar } from '../learner/courseUi.tsx'
import { enrollmentBadge, formatDateTime } from './resultsFormat.ts'
import { ResultBadge } from './resultsUi.tsx'
import { statusBadge } from './courseStatus.ts'

// Course results (execution step C5): assign by email, stats, everyone's
// progress and score with pass/fail from the current pass mark, % correct per
// question, and the CSV export.

function CourseResults() {
  const { id = '' } = useParams()
  const [stats, setStats] = useState<CourseStats | null>(null)
  const [rows, setRows] = useState<TrackingRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([getStats(id), getTracking(id)])
    setStats(s)
    setRows(t.enrollments)
  }, [id])

  useEffect(() => {
    load().catch(() => setLoadError(true))
  }, [load])

  if (loadError) return <EmptyState title="Course not found" text="It may have been removed." />
  if (!stats) return <p className="muted">Loading…</p>

  const course = stats.course
  const badge = statusBadge[course.status]
  const canAssign = course.status === 'published' && !course.past_due
  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? rows.filter((r) => r.email.includes(needle) || (r.full_name ?? '').toLowerCase().includes(needle))
    : rows

  async function onExport() {
    setDownloading(true)
    setError(null)
    try {
      const { blob, filename } = await downloadExport(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download the export.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <p style={{ margin: 0 }}><Link to="/admin">← All courses</Link></p>
          <h1 className="row">{course.title}: results <Badge tone={badge.tone}>{badge.label}</Badge></h1>
          <p className="muted" style={{ margin: 0 }}>Pass mark {course.pass_percentage}%. Changing it in the course editor updates pass/fail here straight away.</p>
        </div>
        <div className="row">
          <Link className="button button-secondary" to={`/admin/courses/${id}`}>Course editor</Link>
          <button className="button button-primary" onClick={() => void onExport()} disabled={downloading || rows.length === 0}>
            {downloading ? 'Downloading…' : 'Download CSV'}
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="grid grid-stats">
        <StatTile icon="users" value={stats.enrolled} label="Enrolled" />
        <StatTile icon="play" value={stats.videos_done} label="Watched all videos" />
        <StatTile icon="check" value={stats.completed} label="Completed" />
        <StatTile icon="chart" value={stats.pass_rate === null ? '—' : `${stats.pass_rate}%`} label={`Pass rate (${stats.passed} of ${stats.completed})`} />
        <StatTile icon="chart" value={stats.average_score === null ? '—' : `${stats.average_score}%`} label="Average score" />
      </div>

      {canAssign && <AssignCard courseId={id} onAssigned={() => void load()} />}

      <Card title={`People · ${rows.length}`}>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nobody is enrolled yet.{canAssign ? ' Assign people above, or they can enroll from the course catalog.' : ''}</p>
        ) : (
          <>
            <input className="input" style={{ maxWidth: 320, marginBottom: 'var(--space-3)' }} placeholder="Filter by name or email"
              value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter people" />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Source</th>
                    <th>Videos</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Result</th>
                    <th>Completed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const s = enrollmentBadge(r)
                    return (
                      <tr key={r.id}>
                        <td>
                          <div>{r.full_name ?? r.email}</div>
                          {r.full_name && <div className="muted">{r.email}</div>}
                          {!r.signed_in && <div className="muted">Hasn't signed in yet</div>}
                        </td>
                        <td>{r.source === 'admin' ? 'Assigned' : 'Self'}</td>
                        <td style={{ minWidth: 120 }}>
                          {r.videos_completed} of {course.video_count}
                          <ProgressBar value={r.progress_pct} label={`${r.email} watched`} />
                        </td>
                        <td><Badge tone={s.tone}>{s.label}</Badge></td>
                        <td>{r.score_pct === null ? '—' : `${r.score_pct}%`}</td>
                        <td><ResultBadge passed={r.passed} /></td>
                        <td>{formatDateTime(r.completed_at)}</td>
                        <td><Link to={`/admin/enrollments/${r.id}`}>Report</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="Questions">
        {stats.questions.length === 0 ? <p className="muted" style={{ margin: 0 }}>No questions.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Question</th><th>Answered correctly</th></tr></thead>
              <tbody>
                {stats.questions.map((q) => (
                  <tr key={q.id}>
                    <td>{q.position}</td>
                    <td>{q.text}</td>
                    <td style={{ minWidth: 160 }}>
                      {q.pct_correct === null ? <span className="muted">No submissions yet</span> : (
                        <>
                          {q.pct_correct}% <span className="muted">({q.correct} of {q.answered})</span>
                          <ProgressBar value={q.pct_correct} label={`Question ${q.position} answered correctly`} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function AssignCard({ courseId, onAssigned }: { courseId: string; onAssigned(): void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AssignResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const emails = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
    if (emails.length === 0) return
    if (emails.length > 500) {
      setError('Up to 500 emails at a time.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await assignByEmail(courseId, emails)
      setResult(r)
      setText(r.rejected.map((x) => x.input).join('\n'))
      onAssigned()
    } catch (err) {
      setError(err instanceof ApiError && err.message === 'past_due'
        ? "This course is past its due date, so nobody new can be assigned."
        : 'Could not assign. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Assign people">
      <form className="stack" onSubmit={onSubmit}>
        <label className="muted" htmlFor="assign-emails">
          Company email addresses, one per line or separated by commas. People who haven't signed in yet see the course when they first sign in.
        </label>
        <textarea id="assign-emails" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'priya@transfunnel.com\nrahul@transfunnel.com'} />
        <div><button className="button button-primary" type="submit" disabled={busy || !text.trim()}>{busy ? 'Assigning…' : 'Assign'}</button></div>
      </form>
      {error && <div className="alert alert-danger" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}
      {result && (
        <div className={`alert ${result.rejected.length ? 'alert-info' : 'alert-ok'}`} style={{ marginTop: 'var(--space-3)' }}>
          {result.enrolled} assigned{result.already_enrolled ? `, ${result.already_enrolled} already enrolled` : ''}.
          {result.rejected.length > 0 && (
            <>
              {' '}Not added (left in the box above):
              <ul style={{ margin: 'var(--space-2) 0 0' }}>
                {result.rejected.map((x) => (
                  <li key={x.input}>{x.input}: {x.reason === 'domain' ? 'not a company email address' : 'not an email address'}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

export default CourseResults
