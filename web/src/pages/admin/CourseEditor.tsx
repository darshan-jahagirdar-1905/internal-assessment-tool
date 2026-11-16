import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  archiveCourse, checkVideo, duplicateCourse, getCourse, publishCourse, saveContent, setPassMark, updateCourse,
  type Course, type Question, type Video,
} from '../../api/adminApi.ts'
import { ApiError } from '../../api/client.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { formatDuration, parseDuration, readDuration } from '../../lib/youtube.ts'
import { statusBadge } from './courseStatus.ts'
import { move, videoReasons } from './editorHelpers.ts'
import { QuestionListEditor } from './QuestionListEditor.tsx'

// Course editor (steps C1 and L4): details, the level path (each level's
// videos and quiz questions), the final test, publish, duplicate, archive, and
// the pass mark (changeable after publishing). Levels, videos and questions
// are saved together with one "Save course content".

type Notice = { tone: 'ok' | 'danger' | 'info'; text: string; list?: string[] } | null

type EditorLevel = { title: string; videos: Video[]; durations: string[]; questions: Question[] }

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
  const [levels, setLevels] = useState<EditorLevel[]>([])
  const [finalQuestions, setFinalQuestions] = useState<Question[]>([])
  const [dirty, setDirty] = useState({ details: false, content: false })

  function load(c: Course) {
    setCourse(c)
    setTitle(c.title)
    setDescription(c.description ?? '')
    setPassMarkValue(c.pass_percentage)
    setDueAt(toLocalInput(c.due_at))
    setLevels(c.levels.map((l) => ({
      title: l.title, videos: l.videos, durations: l.videos.map((v) => formatDuration(v.duration_seconds)), questions: l.questions,
    })))
    setFinalQuestions(c.questions)
    setDirty({ details: false, content: false })
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

  function editLevels(next: EditorLevel[]) {
    setLevels(next)
    setDirty((d) => ({ ...d, content: true }))
  }

  function editLevel(i: number, change: Partial<EditorLevel>) {
    editLevels(levels.map((l, j) => (j === i ? { ...l, ...change } : l)))
  }

  function onSaveContent() {
    const problems: string[] = []
    const parsed = levels.map((l, li) => l.durations.map((d, vi) => {
      const seconds = parseDuration(d)
      if (seconds === null) problems.push(`Level ${li + 1}, video ${vi + 1}: enter its length as minutes:seconds, e.g. 3:25.`)
      return seconds ?? 0
    }))
    levels.forEach((l, li) => { if (!l.title.trim()) problems.push(`Level ${li + 1} needs a title.`) })
    if (problems.length) {
      setNotice({ tone: 'danger', text: 'Please fix these first:', list: problems })
      return
    }
    void run(
      () => saveContent(id, {
        levels: levels.map((l, li) => ({
          title: l.title.trim(),
          videos: l.videos.map((v, vi) => ({ ...v, duration_seconds: parsed[li][vi] })),
          questions: l.questions,
        })),
        final_questions: finalQuestions,
      }),
      'Course content saved.',
      'Could not save the course content. Check every question has text, options and a correct answer.',
    )
  }

  const anyDirty = dirty.details || dirty.content
  const badge = statusBadge[course.status]
  const questionCount = levels.reduce((n, l) => n + l.questions.length, 0)

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
                if (window.confirm('Publish this course? Learners can then enroll, and levels, videos and questions are locked.')) {
                  void run(() => publishCourse(id), 'Course published.', 'Could not publish the course.')
                }
              }}
            >
              Publish
            </button>
          )}
          {!isDraft && <Link className="button button-secondary" to={`/admin/courses/${id}/results`}>Results &amp; assign</Link>}
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
          This course is {course.status}, so its levels, videos and questions are locked. Only the pass mark can change; use Duplicate to make other changes.
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
                <label htmlFor="pass">Final test pass mark (%)</label>
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
              <label htmlFor="pass-live">Final test pass mark (%)</label>
              <input id="pass-live" className="input" style={{ width: 100 }} type="number" min={1} max={100} required
                value={passMark} onChange={(e) => setPassMarkValue(Number(e.target.value))} />
              <button className="button button-secondary" type="submit" disabled={busy || passMark === course.pass_percentage}>
                Change pass mark
              </button>
            </form>
          </>
        )}
      </Card>

      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ margin: 0 }}>Levels</h2>
          <p className="muted" style={{ margin: 0 }}>
            Learners go through the levels in order: each level's videos, then its quiz (all correct to pass, unlimited tries).
            {levels.length > 1 && ` ${levels.length} levels, ${questionCount} quiz questions.`}
          </p>
        </div>
        {isDraft && (
          <div className="row">
            {dirty.content && <span className="unsaved">Unsaved changes</span>}
            <button className="button button-primary" onClick={onSaveContent} disabled={busy || !dirty.content}>Save course content</button>
          </div>
        )}
      </div>

      {levels.map((level, li) => (
        <Card key={li}>
          <div className="item-head">
            <span className="level-kicker">Level {li + 1}</span>
            {isDraft && (
              <span className="row">
                <button className="button button-secondary button-small" onClick={() => editLevels(move(levels, li, li - 1))} disabled={li === 0} aria-label={`Move level ${li + 1} up`}>↑</button>
                <button className="button button-secondary button-small" onClick={() => editLevels(move(levels, li, li + 1))} disabled={li === levels.length - 1} aria-label={`Move level ${li + 1} down`}>↓</button>
                <button className="button button-danger button-small" disabled={levels.length === 1}
                  onClick={() => {
                    if (level.videos.length + level.questions.length === 0 || window.confirm(`Remove level ${li + 1} with its videos and questions?`)) {
                      editLevels(levels.filter((_, j) => j !== li))
                    }
                  }}>Remove level</button>
              </span>
            )}
          </div>
          {isDraft ? (
            <div className="field">
              <label htmlFor={`level-title-${li}`}>Level title</label>
              <input id={`level-title-${li}`} className="input" maxLength={200} value={level.title}
                onChange={(e) => editLevel(li, { title: e.target.value })} placeholder="e.g. Email" />
            </div>
          ) : <h3 style={{ marginTop: 0 }}>{level.title}</h3>}

          <h4 className="editor-subhead">Videos ({level.videos.length})</h4>
          <LevelVideos
            level={level}
            editable={isDraft}
            onChange={(videos, durations) => editLevel(li, { videos, durations })}
            setNotice={setNotice}
          />

          <h4 className="editor-subhead">Level quiz ({level.questions.length})</h4>
          <QuestionListEditor
            label={`Level ${li + 1}`}
            questions={level.questions}
            editable={isDraft}
            emptyText={levels.length > 1 ? 'Add the questions learners must get all right to unlock the next level (5 is a good size).' : 'Optional for a one-level course: leave empty to go straight to the final test.'}
            onChange={(questions) => editLevel(li, { questions })}
          />
        </Card>
      ))}

      {isDraft && (
        <div>
          <button className="button button-secondary" disabled={levels.length >= 20}
            onClick={() => editLevels([...levels, { title: `Level ${levels.length + 1}`, videos: [], durations: [], questions: [] }])}>
            + Add level
          </button>
        </div>
      )}

      <Card title={`Final test (${finalQuestions.length} question${finalQuestions.length === 1 ? '' : 's'})`}>
        <p className="muted" style={{ marginTop: 0 }}>Taken once after every level is passed. This is the score that counts; pass mark {course.pass_percentage}%.</p>
        <QuestionListEditor
          label="Final test"
          questions={finalQuestions}
          editable={isDraft}
          emptyText="Add the questions for the scored final test."
          onChange={(questions) => { setFinalQuestions(questions); setDirty((d) => ({ ...d, content: true })) }}
        />
        {isDraft && (
          <div className="row row-end" style={{ marginTop: 'var(--space-4)' }}>
            {dirty.content && <span className="unsaved">Unsaved changes</span>}
            <button className="button button-primary" onClick={onSaveContent} disabled={busy || !dirty.content}>Save course content</button>
          </div>
        )}
      </Card>
    </div>
  )
}

function LevelVideos({ level, editable, onChange, setNotice }: {
  level: EditorLevel
  editable: boolean
  onChange(videos: Video[], durations: string[]): void
  setNotice(n: Notice): void
}) {
  const [url, setUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const { videos, durations } = level

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setNotice(null)
    try {
      const check = await checkVideo(url)
      if (!check.ok) {
        setNotice({ tone: 'danger', text: videoReasons[check.reason] })
        return
      }
      const seconds = await readDuration(check.youtubeId)
      onChange(
        [...videos, { title: check.title || `Video ${videos.length + 1}`, youtube_video_id: check.youtubeId, duration_seconds: seconds ?? 0 }],
        [...durations, seconds ? formatDuration(seconds) : ''],
      )
      setUrl('')
      setNotice(seconds
        ? { tone: 'info', text: 'Video added. Save the course content to keep it.' }
        : { tone: 'info', text: "Video added, but its length couldn't be read from YouTube here. Type it in (minutes:seconds), then save." })
    } catch {
      setNotice({ tone: 'danger', text: 'Could not check the video.' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {videos.length === 0 && <p className="muted" style={{ margin: 0 }}>{editable ? 'No videos yet. Add a YouTube link below; learners watch them in this order.' : 'No videos.'}</p>}
      {videos.map((v, i) => (
        <div className="item" key={`${v.youtube_video_id}-${i}`}>
          <div className="item-head">
            <span>Video {i + 1}</span>
            {editable && (
              <span className="row">
                <button className="button button-secondary button-small" onClick={() => onChange(move(videos, i, i - 1), move(durations, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="button button-secondary button-small" onClick={() => onChange(move(videos, i, i + 1), move(durations, i, i + 1))} disabled={i === videos.length - 1} aria-label="Move down">↓</button>
                <button className="button button-danger button-small" onClick={() => onChange(videos.filter((_, j) => j !== i), durations.filter((_, j) => j !== i))}>Remove</button>
              </span>
            )}
          </div>
          {editable ? (
            <div className="form-grid">
              <div className="field">
                <label>Title</label>
                <input className="input" maxLength={200} value={v.title}
                  onChange={(e) => onChange(videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)), durations)} />
              </div>
              <div className="field">
                <label>Length (minutes:seconds)</label>
                <input className="input" placeholder="3:25" value={durations[i] ?? ''}
                  onChange={(e) => onChange(videos, durations.map((d, j) => (j === i ? e.target.value : d)))} />
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
      {editable && (
        <form className="row" onSubmit={onAdd}>
          <input className="input grow" placeholder="Paste a YouTube link" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button className="button button-secondary" type="submit" disabled={checking}>{checking ? 'Checking…' : 'Add video'}</button>
        </form>
      )}
    </div>
  )
}

export default CourseEditor
