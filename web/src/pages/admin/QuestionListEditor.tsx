import type { Question } from '../../api/adminApi.ts'
import { EmptyState } from '../../components/ui.tsx'
import { blankQuestion, move } from './editorHelpers.ts'
import { ImportQuestions } from './ImportQuestions.tsx'

// Editing a list of questions: a level quiz or the final test.
export function QuestionListEditor({ questions, onChange, editable, emptyText, label }: {
  questions: Question[]
  onChange(next: Question[]): void
  editable: boolean
  emptyText: string
  label: string
}) {
  function update(i: number, change: Partial<Question>) {
    onChange(questions.map((q, j) => (j === i ? { ...q, ...change } : q)))
  }

  function setCorrect(qi: number, oi: number, checked: boolean) {
    const q = questions[qi]
    const options = q.options.map((o, j) =>
      q.type === 'single' ? { ...o, is_correct: j === oi } : j === oi ? { ...o, is_correct: checked } : o,
    )
    update(qi, { options })
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {questions.length === 0 && <EmptyState title="No questions yet" text={editable ? emptyText : undefined} />}
      {questions.map((q, i) => (
        <div className="item" key={i}>
          <div className="item-head">
            <span>{label} question {i + 1}</span>
            {editable && (
              <span className="row">
                <button className="button button-secondary button-small" onClick={() => onChange(move(questions, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="button button-secondary button-small" onClick={() => onChange(move(questions, i, i + 1))} disabled={i === questions.length - 1} aria-label="Move down">↓</button>
                <button className="button button-danger button-small" onClick={() => onChange(questions.filter((_, j) => j !== i))}>Remove</button>
              </span>
            )}
          </div>
          {editable ? (
            <>
              <div className="field">
                <textarea className="input" placeholder="Question text" maxLength={2000} value={q.text}
                  onChange={(e) => update(i, { text: e.target.value })} />
              </div>
              <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                <label>
                  Type{' '}
                  <select className="input" style={{ width: 'auto' }} value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as Question['type']
                      const firstCorrect = Math.max(0, q.options.findIndex((o) => o.is_correct))
                      update(i, { type, options: type === 'single' ? q.options.map((o, j) => ({ ...o, is_correct: j === firstCorrect })) : q.options })
                    }}>
                    <option value="single">One correct answer</option>
                    <option value="multiple">Several correct answers</option>
                  </select>
                </label>
                <span className="muted">Mark the correct {q.type === 'single' ? 'answer' : 'answers'}.</span>
              </div>
              {q.options.map((o, oi) => (
                <div className="option-row" key={oi}>
                  <input
                    type={q.type === 'single' ? 'radio' : 'checkbox'}
                    name={`correct-${label}-${i}`}
                    checked={o.is_correct}
                    onChange={(e) => setCorrect(i, oi, e.target.checked)}
                    aria-label={`Option ${oi + 1} is correct`}
                  />
                  <input className="input" placeholder={`Option ${oi + 1}`} maxLength={500} value={o.text}
                    onChange={(e) => update(i, { options: q.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })} />
                  <button className="button button-secondary button-small" disabled={q.options.length <= 2}
                    onClick={() => update(i, { options: q.options.filter((_, j) => j !== oi) })} aria-label={`Remove option ${oi + 1}`}>✕</button>
                </div>
              ))}
              {q.options.length < 10 && (
                <button className="button button-secondary button-small"
                  onClick={() => update(i, { options: [...q.options, { text: '', is_correct: false }] })}>
                  + Option
                </button>
              )}
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>{q.text}</p>
              <ul style={{ margin: 0 }}>
                {q.options.map((o, oi) => (
                  <li key={oi} className={o.is_correct ? 'correct-mark' : undefined}>{o.text}{o.is_correct ? ' ✓' : ''}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
      {editable && (
        <div className="row">
          <button className="button button-secondary" onClick={() => onChange([...questions, blankQuestion()])}>+ Add question</button>
          <ImportQuestions onImport={(imported) => onChange([...questions, ...imported])} />
        </div>
      )}
    </div>
  )
}
