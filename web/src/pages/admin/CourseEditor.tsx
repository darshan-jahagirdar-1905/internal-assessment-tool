import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  archiveCourse, checkVideo, duplicateCourse, getCourse, publishCourse, saveQuestions, saveVideos, setPassMark, updateCourse,
  type Course, type Question, type Video,
} from '../../api/adminApi.ts'
import { ApiError } from '../../api/client.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { formatDuration, parseDuration, readDuration } from '../../lib/youtube.ts'
import { statusBadge } from './courseStatus.ts'

// Course editor (execution step C1): details, videos, questions, publish,
// duplicate, archive, and the pass mark (changeable after publishing).

type Notice = { tone: 'ok' | 'danger' | 'info'; text: string; list?: string[] } | null

const videoReasons: Record<string, string> = {
  bad_url: "That doesn't look like a YouTube link.",
  not_embeddable: "This video can't be embedded (it may be private, removed, or have embedding turned off).",
  not_found: 'No YouTube video found at that link.',
  check_failed: "Couldn't reach YouTube to check the link. Try again.",
}

function errorNotice(err: unknown, fallback: string): Notice {
  if (err instanceof ApiError) {
    if (err.message === 'cannot_publish' && Array.isArray(err.details)) {
      return { tone: 'danger', text: 'This course can’t be published yet:', list: err.details as string[] }
    }
    if (err.message === 'not_draft') return { tone: 'danger', text: 'This course is published, so it can’t be changed. Duplicate it to make changes.' }
    if (err.message === 'validation' && Array.isArray(err.details)) {
      return { tone: 'danger', text: 'Please check these fields:', list: (err.details as { path: string; message: string }[]).map((d) => `${d.path || 'form'}: ${d.message}`) }
    }
  }
  return { tone: 'danger', text: fallback }
}

const blankQuestion = (): Question => ({
  text: '', type: 'single', points: 1,
  options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }],
})

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function CourseEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)

  // Editable copies
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [passMark, setPassMarkValue] = useState(70)
  const [dueAt, setDueAt] = useState('')
  const [videos, setVideos] = useState<Video[]>([])
  const [durations, setDurations] = useState<string[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [dirty, setDirty] = useState({ details: false, videos: false, questions: false })

  // Add-video form
  const [videoUrl, setVideoUrl] = useState('')
  const [checking, setChecking] = useState(false)

  function load(c: Course) {
    setCourse(c)
    setTitle(c.title)
    setDescription(c.description ?? '')
    setPassMarkValue(c.pass_percentage)
    setDueAt(toLocalInput(c.due_at))
    setVideos(c.videos)
    setDurations(c.videos.map((v) => formatDuration(v.duration_seconds)))
    setQuestions(c.questions)
    setDirty({ details: false, videos: false, questions: false })
  }

  useEffect(() => {
    getCourse(id).then(load).catch(() => setLoadError(true))
  }, [id])

  if (loadError) return <EmptyState title="Course not found" text="It may have been removed." />
  if (!course) return <p className="muted">Loading…</p>

  const isDraft = course.status === 'draft'

  async function run(action: () => Promise<Course | void>, success: string, fallback: string) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await action()
      if (result) load(result)
      setNotice({ tone: 'ok', text: success })
    } catch (err) {
      setNotice(errorNotice(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  function onSaveDetails(e: FormEvent) {
    e.preventDefault()
    void run(
      () => updateCourse(id, {
        title: title.trim(),
        description: description.trim() || null,
        pass_percentage: passMark,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      }),
      'Details saved.',
      'Could not save the details.',
    )
  }

  function onSaveVideos() {
    const parsed = durations.map(parseDuration)
    const bad = parsed.findIndex((d) => d === null)
    if (bad >= 0) {
      setNotice({ tone: 'danger', text: `Video ${bad + 1}: enter its length as minutes:seconds, e.g. 3:25.` })
      return
    }
    void run(
      () => saveVideos(id, videos.map((v, i) => ({ ...v, duration_seconds: parsed[i] as number }))),
      'Videos saved.',
      'Could not save the videos.',
    )
  }

  function onSaveQuestions() {
    void run(() => saveQuestions(id, questions), 'Questions saved.', 'Could not save the questions.')
  }

  async function onAddVideo(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setNotice(null)
    try {
      const check = await checkVideo(videoUrl)
      if (!check.ok) {
        setNotice({ tone: 'danger', text: videoReasons[check.reason] })
        return
      }
      const seconds = await readDuration(check.youtubeId)
      setVideos((list) => [...list, { title: check.title || `Video ${list.length + 1}`, youtube_video_id: check.youtubeId, duration_seconds: seconds ?? 0 }])
      setDurations((list) => [...list, seconds ? formatDuration(seconds) : ''])
      setDirty((d) => ({ ...d, videos: true }))
      setVideoUrl('')
      setNotice(seconds
        ? { tone: 'info', text: 'Video added. Save the videos to keep it.' }
        : { tone: 'info', text: "Video added, but its length couldn't be read from YouTube here. Type it in (minutes:seconds), then save." })
    } catch {
      setNotice({ tone: 'danger', text: 'Could not check the video.' })
    } finally {
      setChecking(false)
    }
  }

  function editVideos(next: Video[], nextDurations: string[]) {
    setVideos(next)
    setDurations(nextDurations)
    setDirty((d) => ({ ...d, videos: true }))
  }

  function editQuestions(next: Question[]) {
    setQuestions(next)
    setDirty((d) => ({ ...d, questions: true }))
  }

  function updateQuestion(i: number, change: Partial<Question>) {
    editQuestions(questions.map((q, j) => (j === i ? { ...q, ...change } : q)))
  }

  function setCorrect(qi: number, oi: number, checked: boolean) {
    const q = questions[qi]
    const options = q.options.map((o, j) =>
      q.type === 'single' ? { ...o, is_correct: j === oi } : j === oi ? { ...o, is_correct: checked } : o,
    )
    updateQuestion(qi, { options })
  }

  const anyDirty = dirty.details || dirty.videos || dirty.questions
  const badge = statusBadge[course.status]

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <p style={{ margin: 0 }}><Link to="/admin">← All courses</Link></p>
          <h1 className="row">{course.title} <Badge tone={badge.tone}>{badge.label}</Badge></h1>
        </div>
        <div className="row">
          {isDraft && (
            <button
              className="button button-primary"
              disabled={busy || anyDirty}
              title={anyDirty ? 'Save your changes first' : undefined}
              onClick={() => {
                if (window.confirm('Publish this course? Learners can then enroll, and videos and questions are locked.')) {
                  void run(() => publishCourse(id), 'Course published.', 'Could not publish the course.')
                }
              }}
            >
              Publish
            </button>
          )}
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void run(async () => {
              const copy = await duplicateCourse(id)
              navigate(`/admin/courses/${copy.id}`)
              return copy
            }, 'Copy created as a new draft.', 'Could not duplicate the course.')}
          >
            Duplicate
          </button>
          {course.status !== 'archived' && (
            <button
              className="button button-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Archive this course? It disappears from the course list; learners keep their results.')) {
                  void run(() => archiveCourse(id), 'Course archived.', 'Could not archive the course.')
                }
              }}
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`alert alert-${notice.tone}`} role="status">
          {notice.text}
          {notice.list && <ul>{notice.list.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      )}
      {!isDraft && (
        <div className="alert alert-info">
          This course is {course.status}, so its videos and questions are locked. Only the pass mark can change; use Duplicate to make other changes.
        </div>
      )}

      <Card title="Details">
        {isDraft ? (
          <form onSubmit={onSaveDetails}>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" className="input" required maxLength={200} value={title}
                onChange={(e) => { setTitle(e.target.value); setDirty((d) => ({ ...d, details: true })) }} />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" className="input" maxLength={5000} value={description}
                onChange={(e) => { setDescription(e.target.value); setDirty((d) => ({ ...d, details: true })) }} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pass">Pass mark (%)</label>
                <input id="pass" className="input" type="number" min={1} max={100} required value={passMark}
                  onChange={(e) => { setPassMarkValue(Number(e.target.value)); setDirty((d) => ({ ...d, details: true })) }} />
              </div>
              <div className="field">
                <label htmlFor="due">Due date (optional)</label>
                <input id="due" className="input" type="datetime-local" value={dueAt}
                  onChange={(e) => { setDueAt(e.target.value); setDirty((d) => ({ ...d, details: true })) }} />
              </div>
            </div>
            <div className="row row-end">
              {dirty.details && <span className="unsaved">Unsaved changes</span>}
              <button className="button button-primary" type="submit" disabled={busy}>Save details</button>
            </div>
          </form>
        ) : (
          <>
            {course.description && <p style={{ marginTop: 0 }}>{course.description}</p>}
            <p className="muted">Due: {course.due_at ? new Date(course.due_at).toLocaleString() : 'no due date'}</p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => setPassMark(id, passMark), 'Pass mark updated. Pass/fail in reports now uses the new mark; scores are unchanged.', 'Could not change the pass mark.')
              }}
            >
              <label htmlFor="pass-live">Pass mark (%)</label>
              <input id="pass-live" className="input" style={{ width: 100 }} type="number" min={1} max={100} required
                value={passMark} onChange={(e) => setPassMarkValue(Number(e.target.value))} />
              <button className="button button-secondary" type="submit" disabled={busy || passMark === course.pass_percentage}>
                Change pass mark
              </button>
            </form>
          </>
        )}
      </Card>

      <Card title={`Videos (${videos.length})`}>
        {videos.length === 0 && <EmptyState title="No videos yet" text={isDraft ? 'Add a YouTube link below. Learners watch videos in this order.' : undefined} />}
        {videos.map((v, i) => (
          <div className="item" key={`${v.youtube_video_id}-${i}`}>
            <div className="item-head">
              <span>Video {i + 1}</span>
              {isDraft && (
                <span className="row">
                  <button className="button button-secondary button-small" onClick={() => editVideos(move(videos, i, i - 1), move(durations, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="button button-secondary button-small" onClick={() => editVideos(move(videos, i, i + 1), move(durations, i, i + 1))} disabled={i === videos.length - 1} aria-label="Move down">↓</button>
                  <button className="button button-danger button-small" onClick={() => editVideos(videos.filter((_, j) => j !== i), durations.filter((_, j) => j !== i))}>Remove</button>
                </span>
              )}
            </div>
            {isDraft ? (
              <div className="form-grid">
                <div className="field">
                  <label>Title</label>
                  <input className="input" maxLength={200} value={v.title}
                    onChange={(e) => editVideos(videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)), durations)} />
                </div>
                <div className="field">
                  <label>Length (minutes:seconds)</label>
                  <input className="input" placeholder="3:25" value={durations[i] ?? ''}
                    onChange={(e) => editVideos(videos, durations.map((d, j) => (j === i ? e.target.value : d)))} />
                </div>
              </div>
            ) : (
              <p style={{ margin: 0 }}>{v.title} <span className="muted">· {formatDuration(v.duration_seconds)}</span></p>
            )}
            <p className="muted" style={{ margin: 0 }}>
              <a href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`} target="_blank" rel="noreferrer">youtube.com/watch?v={v.youtube_video_id}</a>
            </p>
          </div>
        ))}
        {isDraft && (
          <>
            <form className="row" style={{ marginTop: 'var(--space-4)' }} onSubmit={onAddVideo}>
              <input className="input grow" placeholder="Paste a YouTube link" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
              <button className="button button-secondary" type="submit" disabled={checking}>{checking ? 'Checking…' : 'Add video'}</button>
            </form>
            <div className="row row-end" style={{ marginTop: 'var(--space-4)' }}>
              {dirty.videos && <span className="unsaved">Unsaved changes</span>}
              <button className="button button-primary" onClick={onSaveVideos} disabled={busy || !dirty.videos}>Save videos</button>
            </div>
          </>
        )}
      </Card>

      <Card title={`Assessment (${questions.length} question${questions.length === 1 ? '' : 's'})`}>
        {questions.length === 0 && <EmptyState title="No questions yet" text={isDraft ? 'Add the questions learners answer after the videos.' : undefined} />}
        {questions.map((q, i) => (
          <div className="item" key={i}>
            <div className="item-head">
              <span>Question {i + 1}</span>
              {isDraft && (
                <span className="row">
                  <button className="button button-secondary button-small" onClick={() => editQuestions(move(questions, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="button button-secondary button-small" onClick={() => editQuestions(move(questions, i, i + 1))} disabled={i === questions.length - 1} aria-label="Move down">↓</button>
                  <button className="button button-danger button-small" onClick={() => editQuestions(questions.filter((_, j) => j !== i))}>Remove</button>
                </span>
              )}
            </div>
            {isDraft ? (
              <>
                <div className="field">
                  <textarea className="input" placeholder="Question text" maxLength={2000} value={q.text}
                    onChange={(e) => updateQuestion(i, { text: e.target.value })} />
                </div>
                <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                  <label>
                    Type{' '}
                    <select className="input" style={{ width: 'auto' }} value={q.type}
                      onChange={(e) => {
                        const type = e.target.value as Question['type']
                        const firstCorrect = Math.max(0, q.options.findIndex((o) => o.is_correct))
                        updateQuestion(i, { type, options: type === 'single' ? q.options.map((o, j) => ({ ...o, is_correct: j === firstCorrect })) : q.options })
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
                      name={`correct-${i}`}
                      checked={o.is_correct}
                      onChange={(e) => setCorrect(i, oi, e.target.checked)}
                      aria-label={`Option ${oi + 1} is correct`}
                    />
                    <input className="input" placeholder={`Option ${oi + 1}`} maxLength={500} value={o.text}
                      onChange={(e) => updateQuestion(i, { options: q.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })} />
                    <button className="button button-secondary button-small" disabled={q.options.length <= 2}
                      onClick={() => updateQuestion(i, { options: q.options.filter((_, j) => j !== oi) })} aria-label={`Remove option ${oi + 1}`}>✕</button>
                  </div>
                ))}
                {q.options.length < 10 && (
                  <button className="button button-secondary button-small"
                    onClick={() => updateQuestion(i, { options: [...q.options, { text: '', is_correct: false }] })}>
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
        {isDraft && (
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
            <button className="button button-secondary" onClick={() => editQuestions([...questions, blankQuestion()])}>+ Add question</button>
            <span className="row">
              {dirty.questions && <span className="unsaved">Unsaved changes</span>}
              <button className="button button-primary" onClick={onSaveQuestions} disabled={busy || !dirty.questions}>Save questions</button>
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}

export default CourseEditor
