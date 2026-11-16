import type { Question } from '../../api/adminApi.ts'

// "Import questions" (architecture.md 9.8): turns questions pasted from the
// review doc into builder questions. Expected shape, one item per line:
//
//   1. What does the video say email etiquette is? (0:47)
//   A. Replying to every email within one hour
//   B. Using appropriate language ... (correct)
//   C. ...
//
// A question line starts with a number (or S1, Q1) and a full stop or bracket.
// Option lines start with a letter A–H. The right option ends in "(correct)".
// Anything else (headings, notes) is ignored. Timestamps like "(0:47)" and
// bold markers are removed.

export type ImportResult = { questions: Question[]; problems: string[] }

const QUESTION = /^(?:[QS]\s*)?(\d+)\s*[.)]\s+(.+)$/i
const OPTION = /^(?:[-*•]\s*)?([A-H])\s*[.)]\s+(.+)$/i
const CORRECT = /\(\s*correct\s*\)/i

function clean(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/\s*\*?\(\s*\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*\)\*?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseQuestions(input: string): ImportResult {
  const questions: Question[] = []
  const labels: string[] = []
  const problems: string[] = []
  let current: { label: string; text: string; options: { text: string; is_correct: boolean }[] } | null = null

  const finish = () => {
    if (!current) return
    const correct = current.options.filter((o) => o.is_correct).length
    if (current.options.length < 2) problems.push(`Question ${current.label} needs at least two options (lines starting A., B., …).`)
    else if (correct === 0) problems.push(`Question ${current.label} has no option marked "(correct)".`)
    else if (current.options.length > 10) problems.push(`Question ${current.label} has more than 10 options.`)
    else {
      questions.push({
        text: current.text.slice(0, 2000),
        type: correct === 1 ? 'single' : 'multiple',
        points: 1,
        options: current.options.map((o) => ({ text: o.text.slice(0, 500), is_correct: o.is_correct })),
      })
      labels.push(current.label)
    }
    current = null
  }

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(/\*\*/g, '').trim()
    if (!line) continue
    const option = OPTION.exec(line)
    if (option && current) {
      const isCorrect = CORRECT.test(option[2])
      const text = clean(option[2].replace(CORRECT, ''))
      if (text) current.options.push({ text, is_correct: isCorrect })
      continue
    }
    const question = QUESTION.exec(line)
    if (question) {
      finish()
      const prefix = /^[QS]/i.test(line) ? line[0].toUpperCase() : ''
      current = { label: `${prefix}${question[1]}`, text: clean(question[2]), options: [] }
    }
  }
  finish()
  if (questions.length === 0 && problems.length === 0) problems.push('No questions found. Paste lines like "1. Question" followed by "A. Option".')
  return { questions, problems }
}
