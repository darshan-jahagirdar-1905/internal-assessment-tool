import type { Question } from '../../api/adminApi.ts'

// Small helpers shared by the course editor's parts.

export const videoReasons: Record<string, string> = {
  bad_url: "That doesn't look like a YouTube link.",
  not_embeddable: "This video can't be embedded (it may be private, removed, or have embedding turned off).",
  not_found: 'No YouTube video found at that link.',
  check_failed: "Couldn't reach YouTube to check the link. Try again.",
}

export const blankQuestion = (): Question => ({
  text: '', type: 'single', points: 1,
  options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }],
})

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}
