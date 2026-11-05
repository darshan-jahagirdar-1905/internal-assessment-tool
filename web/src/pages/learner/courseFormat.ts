// Text helpers shared by the learner course screens.

export function minutes(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60)
  return m < 1 ? 'under a minute' : `${m} min`
}

export function dueText(dueAt: string | null): string | null {
  return dueAt ? `Due ${new Date(dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : null
}
