import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.ts'
import {
  getAttempt,
  getCoursePage,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type AttemptQuestion,
  type CoursePage as Course,
} from '../../api/learnerApi.ts'
import { Card, EmptyState } from '../../components/ui.tsx'

// The assessment (architecture.md 9.2 and 9.3, execution step C4): start or
// resume, answers save as soon as they change, an unanswered warning before
// submitting, then the score. Learners never see pass/fail or correct answers.

type View =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'message'; course: Course; title: string; text: string }
  | { kind: 'start'; course: Course }
  | { kind: 'take'; attemptId: string; courseTitle: string; questions: AttemptQuestion[]; answers: Record<string, string[]> }
  | { kind: 'score'; courseTitle: string; score: number }

type SaveState = 'saving' | 'saved' | 'error'

const SAVE_DELAY_MS = 500
const RETRY_MS = 3000

function AssessmentPage() {
  const { id = '' } = useParams()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    let course: Course
    try {
      course = await getCoursePage(id)
    } catch {
      setView({ kind: 'not_found' })
      return
    }
    const a = course.assessment
    if (a.state === 'in_progress' && a.attempt_id) {
      const attempt = await getAttempt(a.attempt_id)
      if (attempt.status === 'submitted') {
        setView({ kind: 'score', courseTitle: attempt.course_title, score: attempt.score_pct })
        return
      }
      const answers: Record<string, string[]> = {}
      for (const ans of attempt.answers) answers[ans.question_id] = ans.selected_option_ids
      setView({ kind: 'take', attemptId: attempt.id, courseTitle: attempt.course_title, questions: attempt.questions, answers })
    } else if (a.state === 'completed' && a.score_pct !== null) {
      setView({ kind: 'score', courseTitle: course.title, score: a.score_pct })
    } else if (a.state === 'available') {
      setView({ kind: 'start', course })
    } else if (a.state === 'not_enrolled') {
      setView({ kind: 'message', course, title: 'Not enrolled', text: 'Enroll in this course and watch its videos to unlock the assessment.' })
    } else if (a.state === 'locked') {
      setView({ kind: 'message', course, title: 'Assessment locked', text: "It unlocks when you've watched every video (at least 80% of each)." })
    } else {
      setView({ kind: 'message', course, title: 'Assessment closed', text: 'This assessment is no longer open.' })
    }
  }, [id])

  useEffect(() => {
    load().catch(() => setError('Could not load the assessment. Check your connection and reload the page.'))
  }, [load])

  async function onStart() {
    setBusy(true)
    setError(null)
    try {
      await startAttempt(id)
      await load()
    } catch {
      setError('Could not start the assessment. Reload the page and try again.')
    } finally {
      setBusy(false)
    }
  }

  const back = <p style={{ margin: 0 }}><Link to={`/courses/${id}`}>← Back to the course</Link></p>

  if (view.kind === 'loading') return error ? <div className="alert alert-danger">{error}</div> : <p className="muted">Loading…</p>
  if (view.kind === 'not_found') return <EmptyState title="Course not found" text="It may not be published yet." />
  if (view.kind === 'message') {
    return <div className="stack">{back}<EmptyState title={view.title} text={view.text} /></div>
  }
  if (view.kind === 'score') return <div className="stack">{back}<ScoreCard courseTitle={view.courseTitle} score={view.score} /></div>
  if (view.kind === 'start') {
    const count = view.course.assessment.question_count
    return (
      <div className="stack">
        {back}
        <h1 style={{ margin: 0 }}>{view.course.title}: assessment</h1>
        {error && <div className="alert alert-danger">{error}</div>}
        <Card>
          <ul className="plain-list">
            <li>{count} question{count === 1 ? '' : 's'}.</li>
            <li>You can take it <strong>once</strong>.</li>
            <li>Each answer saves as soon as you pick it. You can leave and come back to finish.</li>
            <li>After you submit, you'll see your score.</li>
          </ul>
          <button className="button button-primary" onClick={() => void onStart()} disabled={busy}>
            {busy ? 'Starting…' : 'Start assessment'}
          </button>
        </Card>
      </div>
    )
  }
  return (
    <TakeAssessment
      key={view.attemptId}
      attemptId={view.attemptId}
      courseId={id}
      courseTitle={view.courseTitle}
      questions={view.questions}
      initialAnswers={view.answers}
      onDone={(score) => setView({ kind: 'score', courseTitle: view.courseTitle, score })}
      onClosed={() => void load()}
    />
  )
}

function ScoreCard({ courseTitle, score }: { courseTitle: string; score: number }) {
  return (
    <Card>
      <p className="muted" style={{ marginTop: 0 }}>{courseTitle}</p>
      <div className="score"><span className="stat-value">{score}%</span><span className="muted">Your score</span></div>
      <p style={{ marginBottom: 0 }}>Your result has been recorded. <Link to="/">Back to my courses</Link></p>
    </Card>
  )
}

function TakeAssessment(props: {
  attemptId: string
  courseId: string
  courseTitle: string
  questions: AttemptQuestion[]
  initialAnswers: Record<string, string[]>
  onDone(score: number): void
  onClosed(): void
}) {
  const { attemptId, questions, onDone, onClosed } = props
  const [answers, setAnswers] = useState<Record<string, string[]>>(props.initialAnswers)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Save bookkeeping lives in refs so timers always see the latest values.
  const latest = useRef(props.initialAnswers)
  const timers = useRef(new Map<string, number>())
  const inFlight = useRef(new Set<string>())
  const dirty = useRef(new Set<string>())
  const stopped = useRef(false)

  const setSaveState = (qid: string, state: SaveState) => setSaveStates((s) => ({ ...s, [qid]: state }))

  function schedule(qid: string, delay: number) {
    window.clearTimeout(timers.current.get(qid))
    timers.current.set(qid, window.setTimeout(() => void flush(qid), delay))
  }

  async function flush(qid: string) {
    if (stopped.current) return
    if (inFlight.current.has(qid)) {
      dirty.current.add(qid)
      return
    }
    inFlight.current.add(qid)
    dirty.current.delete(qid)
    setSaveState(qid, 'saving')
    try {
      await saveAnswer(attemptId, { question_id: qid, selected_option_ids: latest.current[qid] ?? [] })
      if (!dirty.current.has(qid)) setSaveState(qid, 'saved')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Submitted elsewhere (another tab) or closed by the due date.
        stopped.current = true
        onClosed()
        return
      }
      if (err instanceof ApiError && err.status === 401) {
        setError('Your session has ended. Sign in again; your saved answers are kept.')
      }
      setSaveState(qid, 'error')
      schedule(qid, RETRY_MS)
    } finally {
      inFlight.current.delete(qid)
      if (dirty.current.has(qid) && !stopped.current) void flush(qid)
    }
  }

  useEffect(() => {
    const pending = timers.current
    stopped.current = false
    return () => {
      stopped.current = true
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const unsaved = Object.values(saveStates).some((s) => s !== 'saved')
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  function choose(q: AttemptQuestion, optionId: string, checked: boolean) {
    const current = latest.current[q.id] ?? []
    const next = q.type === 'single' ? [optionId] : checked ? [...current, optionId] : current.filter((o) => o !== optionId)
    latest.current = { ...latest.current, [q.id]: next }
    setAnswers(latest.current)
    setConfirming(false)
    schedule(q.id, SAVE_DELAY_MS)
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    stopped.current = true
    timers.current.forEach((t) => window.clearTimeout(t))
    // Every answer goes with the submit, so unsaved changes aren't lost.
    const snapshot = questions.map((q) => ({ question_id: q.id, selected_option_ids: latest.current[q.id] ?? [] }))
    try {
      const { score_pct } = await submitAttempt(attemptId, snapshot)
      onDone(score_pct)
    } catch (err) {
      stopped.current = false
      setSubmitting(false)
      setConfirming(false)
      setError(err instanceof ApiError && err.status === 401
        ? 'Your session has ended. Sign in again; your saved answers are kept.'
        : 'Could not submit. Check your connection and try again; your answers are still here.')
    }
  }

  const answered = questions.filter((q) => (answers[q.id] ?? []).length > 0).length
  const unanswered = questions.length - answered
  const states = Object.values(saveStates)
  const status = states.includes('saving') ? 'Saving…' : states.includes('error') ? 'Not saved, retrying…' : states.length ? 'All answers saved' : ''

  return (
    <div className="stack">
      <p style={{ margin: 0 }}><Link to={`/courses/${props.courseId}`}>← Back to the course</Link></p>
      <h1 style={{ margin: 0 }}>{props.courseTitle}: assessment</h1>
      <div className="assessment-bar">
        <span>{answered} of {questions.length} answered</span>
        <span className={states.includes('error') ? 'error-text' : 'muted'} role="status" aria-live="polite">{status}</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      {questions.map((q, i) => {
        const selected = answers[q.id] ?? []
        return (
          <Card key={q.id}>
            <fieldset className="question">
              <legend>
                <span className="question-number">Question {i + 1}</span>
                <span className="question-text">{q.text}</span>
                {q.type === 'multiple' && <span className="muted"> Choose all that apply.</span>}
              </legend>
              {q.options.map((o) => (
                <label key={o.id} className={`option${selected.includes(o.id) ? ' is-selected' : ''}`}>
                  <input
                    type={q.type === 'single' ? 'radio' : 'checkbox'}
                    name={q.id}
                    checked={selected.includes(o.id)}
                    disabled={submitting}
                    onChange={(e) => choose(q, o.id, e.target.checked)}
                  />
                  <span>{o.text}</span>
                </label>
              ))}
              {saveStates[q.id] === 'error' && <p className="error-text" style={{ margin: 0 }}>Not saved yet. Retrying…</p>}
            </fieldset>
          </Card>
        )
      })}

      <Card>
        {!confirming ? (
          <button className="button button-primary" onClick={() => setConfirming(true)} disabled={submitting}>Submit assessment</button>
        ) : (
          <div className="stack">
            <p style={{ margin: 0 }}>
              {unanswered > 0
                ? <><strong>{unanswered} question{unanswered === 1 ? '' : 's'} unanswered.</strong> Submit anyway? Unanswered questions score 0.</>
                : "Submit your answers? You can't change them afterwards."}
            </p>
            <div className="row-actions">
              <button className="button button-primary" onClick={() => void onSubmit()} disabled={submitting}>
                {submitting ? 'Submitting…' : unanswered > 0 ? 'Submit anyway' : 'Submit'}
              </button>
              <button className="button button-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Keep answering</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default AssessmentPage
