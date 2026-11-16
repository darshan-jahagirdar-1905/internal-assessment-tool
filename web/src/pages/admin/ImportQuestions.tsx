import { useState } from 'react'
import type { Question } from '../../api/adminApi.ts'
import { parseQuestions } from './parseImport.ts'

// "Import questions": paste questions in the review doc's format, preview
// them, then add them to this level quiz or the final test.
export function ImportQuestions({ onImport }: { onImport(questions: Question[]): void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const result = text.trim() ? parseQuestions(text) : null

  if (!open) return <button className="button button-secondary" onClick={() => setOpen(true)}>Import questions</button>

  return (
    <div className="import-box">
      <label className="muted" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
        Paste questions copied from the review doc: each question on a line starting with its number
        ("1."), then its options on lines starting "A.", "B.", …, with the right one ending in "(correct)".
      </label>
      <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'1. What does the video say email etiquette is? (0:47)\nA. Replying within one hour\nB. Using appropriate language (correct)\nC. Writing short emails\nD. Copying your manager'} aria-label="Questions to import" />
      {result && (
        <div className="import-preview">
          <p style={{ margin: 'var(--space-2) 0' }}>
            <strong>{result.questions.length} question{result.questions.length === 1 ? '' : 's'} found.</strong>
            {result.questions.length > 0 && ` ${result.questions.filter((q) => q.type === 'multiple').length} with several correct answers.`}
          </p>
          {result.problems.length > 0 && (
            <div className="alert alert-danger" role="alert">
              Fix these in the text above (they won't be added):
              <ul style={{ margin: 'var(--space-2) 0 0' }}>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          <ol className="import-list">
            {result.questions.map((q, i) => (
              <li key={i}>
                {q.text}
                <span className="muted"> · {q.options.length} options, correct: {q.options.filter((o) => o.is_correct).map((o) => o.text).join(' / ')}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="button button-primary" disabled={!result || result.questions.length === 0}
          onClick={() => { if (result) onImport(result.questions); setText(''); setOpen(false) }}>
          Add {result?.questions.length ?? 0} question{result?.questions.length === 1 ? '' : 's'}
        </button>
        <button className="button button-secondary" onClick={() => { setText(''); setOpen(false) }}>Cancel</button>
      </div>
    </div>
  )
}
