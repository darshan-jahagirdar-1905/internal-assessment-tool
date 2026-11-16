import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.ts'
import {
  getLevelQuiz, submitLevelQuiz,
  type AttemptQuestion, type LevelQuiz, type LevelQuizResult,
} from '../../api/learnerApi.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'

// A level quiz (architecture.md 9.8, step L3): answer every question, check,
// see the score and which questions were wrong (never the right option), then
// try again with the questions and options reshuffled. All correct passes the
// level and unlocks the next one.

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function reshuffle(questions: AttemptQuestion[]): AttemptQuestion[] {
  return shuffled(questions).map((q) => ({ ...q, options: shuffled(q.options) }))
}

const LOCKED: Record<string, string> = {
  level_locked: 'Pass the previous level first.',
  videos_not_done: 'Watch this level’s videos first (at least 80% of each).',
  past_due: 'This course is past its due date.',
  course_not_open: 'This course is closed.',
}

function LevelQuizPage() {
  const { id = '', levelId = '' } = useParams()
  const [quiz, setQuiz] = useState<LevelQuiz | null>(null)
  const [questions, setQuestions] = useState<AttemptQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<LevelQuizResult | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const load = useCallback(async () => {
    try {
      const q = await getLevelQuiz(levelId)
      setQuiz(q)
      setQuestions(q.questions)
    } catch (err) {
      setBlocked(err instanceof ApiError && LOCKED[err.message] ? LOCKED[err.message] : 'This quiz isn’t available.')
    }
  }, [levelId])

  useEffect(() => {
    void load()
  }, [load])

  const back = <p style={{ margin: 0 }}><Link to={`/courses/${id}`}>← Back to the course</Link></p>
  if (blocked) return <div className="stack">{back}<EmptyState title="Quiz locked" text={blocked} /></div>
  if (!quiz) return <p className="muted">Loading…</p>

  const answered = questions.filter((q) => (answers[q.id] ?? []).length > 0).length
  const wrong = new Set(result?.wrong_question_ids ?? [])

  function choose(q: AttemptQuestion, optionId: string, checked: boolean) {
    if (result) return
    setAnswers((a) => {
      const current = a[q.id] ?? []
      const next = q.type === 'single' ? [optionId] : checked ? [...current, optionId] : current.filter((o) => o !== optionId)
      return { ...a, [q.id]: next }
    })
  }

  async function onCheck() {
    setChecking(true)
    setError(null)
    try {
      const r = await submitLevelQuiz(levelId, questions.map((q) => ({ question_id: q.id, selected_option_ids: answers[q.id] ?? [] })))
      setResult(r)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof ApiError && LOCKED[err.message] ? LOCKED[err.message] : 'Could not check your answers. Try again.')
    } finally {
      setChecking(false)
    }
  }

  function onTryAgain() {
    setResult(null)
    setAnswers({})
    setQuestions(reshuffle(quiz?.questions ?? []))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="stack">
      {back}
      <div>
        <p className="muted" style={{ margin: 0 }}>{quiz.course.title} · Level {quiz.level.position}</p>
        <h1 style={{ margin: 0 }}>{quiz.level.title}: level quiz</h1>
      </div>

      {result && (result.passed ? (
        <Card>
          <div className="quiz-result is-passed" role="status">
            <div className="stat-value">{result.correct_count} of {result.question_count}</div>
            <div>
              <strong>Level passed.</strong>{' '}
              {quiz.next_level ? `Level ${quiz.level.position + 1}, ${quiz.next_level.title}, is unlocked.` : 'Every level is done: the final test is next.'}
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: 'var(--space-4)' }}>
            <Link className="button button-primary" to={`/courses/${id}`}>{quiz.next_level ? 'Continue to the next level' : 'Go to the final test'}</Link>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="quiz-result" role="status">
            <div className="stat-value">{result.correct_count} of {result.question_count}</div>
            <div>
              <strong>Not quite.</strong> {result.question_count - result.correct_count} question{result.question_count - result.correct_count === 1 ? ' is' : 's are'} marked below.
              All {result.question_count} must be right to pass. Try again as often as you like.
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: 'var(--space-4)' }}>
            <button className="button button-primary" onClick={onTryAgain}>Try again</button>
            <Link className="button button-secondary" to={`/courses/${id}`}>Rewatch the videos</Link>
          </div>
        </Card>
      ))}

      {!result && quiz.passed && <div className="alert alert-info">You've already passed this level. This try is practice and won't change anything.</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {questions.map((q, i) => {
        const selected = answers[q.id] ?? []
        const mark = result ? (wrong.has(q.id) ? 'wrong' : 'right') : null
        return (
          <Card key={q.id}>
            <fieldset className={`question${mark ? ` is-${mark}` : ''}`} disabled={Boolean(result) || checking}>
              <legend>
                <span className="question-number">
                  Question {i + 1}
                  {mark === 'right' && <> <Badge tone="ok">Correct</Badge></>}
                  {mark === 'wrong' && <> <Badge tone="danger">Not quite</Badge></>}
                </span>
                <span className="question-text">{q.text}</span>
                {q.type === 'multiple' && <span className="muted"> Choose all that apply.</span>}
              </legend>
              {q.options.map((o) => (
                <label key={o.id} className={`option${selected.includes(o.id) ? ' is-selected' : ''}`}>
                  <input
                    type={q.type === 'single' ? 'radio' : 'checkbox'}
                    name={q.id}
                    checked={selected.includes(o.id)}
                    onChange={(e) => choose(q, o.id, e.target.checked)}
                  />
                  <span>{o.text}</span>
                </label>
              ))}
            </fieldset>
          </Card>
        )
      })}

      {!result && (
        <Card>
          <div className="row-actions">
            <button className="button button-primary" onClick={() => void onCheck()} disabled={checking || answered < questions.length}>
              {checking ? 'Checking…' : 'Check answers'}
            </button>
            <span className="muted">{answered < questions.length ? `${answered} of ${questions.length} answered` : 'All answered'}</span>
          </div>
        </Card>
      )}
    </div>
  )
}

export default LevelQuizPage
