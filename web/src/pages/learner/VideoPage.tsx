import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.ts'
import { getCoursePage, reportProgress, reportVideoError, type CoursePage as Course } from '../../api/learnerApi.ts'
import { Card, EmptyState } from '../../components/ui.tsx'
import { loadYouTubeApi, PLAYER_STATE, type YTPlayer } from '../../lib/youtube.ts'
import { ProgressBar } from './courseUi.tsx'

// Video player with watch tracking (architecture.md 9.1, execution step C3).
// While the video plays in a visible tab, the 5-second segment under the
// playhead is noted each second. Noted segments are sent to the server, which
// decides what to credit. Seeking past a part never marks it watched.

type CourseVideo = Course['videos'][number]

const SEGMENT_SECONDS = 5
const REPORT_EVERY_MS = 15000
const MAX_SEGMENTS_PER_REPORT = 500

const REFUSALS: Record<string, string> = {
  video_locked: 'Watch the previous video first.',
  past_due: "This course's due date has passed, so watching no longer counts.",
  course_not_open: 'This course is closed, so watching no longer counts.',
}

function VideoPage() {
  const { id = '', videoId = '' } = useParams()
  const [course, setCourse] = useState<Course | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    setCourse(null)
    setNotFound(false)
    getCoursePage(id).then(setCourse).catch(() => setNotFound(true))
  }, [id, videoId])

  if (notFound) return <EmptyState title="Course not found" text="It may not be published yet." />
  if (!course) return <p className="muted">Loading…</p>

  const index = course.videos.findIndex((v) => v.id === videoId)
  const video = course.videos[index]
  const back = <p style={{ margin: 0 }}><Link to={`/courses/${course.id}`}>← {course.title}</Link></p>

  if (!video) return <div className="stack">{back}<EmptyState title="Video not found" text="It may have been removed from this course." /></div>
  if (!course.enrollment || video.locked) {
    return (
      <div className="stack">
        {back}
        <EmptyState
          title={video.title}
          text={course.enrollment ? 'Watch the previous video first. Each video unlocks when the one before it is 80% watched.' : 'Enroll in this course to watch its videos.'}
        />
      </div>
    )
  }

  const next = course.videos[index + 1] ?? null
  return (
    <div className="stack">
      <div>
        {back}
        <h1 style={{ marginBottom: 0 }}>{video.position}. {video.title}</h1>
        <p className="muted" style={{ margin: 0 }}>Video {video.position} of {course.videos.length}</p>
      </div>
      {course.past_due && <div className="alert alert-info">{REFUSALS.past_due}</div>}
      {course.status === 'archived' && <div className="alert alert-info">{REFUSALS.course_not_open}</div>}
      <Player key={video.id} courseId={course.id} video={video} next={next} tracking={course.status === 'published' && !course.past_due} />
    </div>
  )
}

function Player({ courseId, video, next, tracking }: { courseId: string; video: CourseVideo; next: CourseVideo | null; tracking: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [pct, setPct] = useState(video.watched_pct)
  const [completed, setCompleted] = useState(video.completed)
  const [problem, setProblem] = useState<string | null>(null)
  const [stopped, setStopped] = useState<string | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let cancelled = false
    let player: YTPlayer | null = null
    let blocked = !tracking
    let sending = false
    let started = false
    let playedSinceReport = false
    let lastReport = 0
    let errorReported = false
    const pending = new Set<number>()
    const totalSegments = Math.ceil(video.duration_seconds / SEGMENT_SECONDS)

    const position = () => Math.max(0, Math.floor(player?.getCurrentTime() ?? 0))

    function takeBatch(): number[] {
      return [...pending].sort((a, b) => a - b).slice(0, MAX_SEGMENTS_PER_REPORT)
    }

    // A report on page close can't wait for the reply; keepalive lets it finish.
    function reportOnClose() {
      if (blocked || !player || (!pending.size && !playedSinceReport)) return
      const batch = takeBatch()
      batch.forEach((s) => pending.delete(s))
      playedSinceReport = false
      void reportProgress(video.id, batch, position(), true).catch(() => undefined)
    }

    async function report() {
      if (blocked || sending || !player) return
      sending = true
      lastReport = Date.now()
      const batch = takeBatch()
      playedSinceReport = false
      try {
        const p = await reportProgress(video.id, batch, position())
        batch.forEach((s) => pending.delete(s))
        if (!cancelled) {
          setPct(p.watched_pct)
          if (p.completed) setCompleted(true)
        }
      } catch (err) {
        // Network problems: the segments stay pending and go with the next report.
        if (err instanceof ApiError && err.status === 409) {
          blocked = true
          if (!cancelled) setStopped(REFUSALS[err.message] ?? 'Watching no longer counts for this course.')
        }
      } finally {
        sending = false
      }
    }

    function tick() {
      if (!player || player.getPlayerState() !== PLAYER_STATE.PLAYING || document.hidden) return
      const segment = Math.floor(player.getCurrentTime() / SEGMENT_SECONDS)
      if (segment >= 0 && segment < totalSegments) pending.add(segment)
      playedSinceReport = true
      // The server credits at most one segment on the first report, so the
      // first one goes out as soon as playback starts.
      if (!started || Date.now() - lastReport >= REPORT_EVERY_MS) {
        started = true
        void report()
      }
    }

    function onStateChange(state: number) {
      if (state === PLAYER_STATE.PLAYING) tick()
      if ((state === PLAYER_STATE.PAUSED || state === PLAYER_STATE.ENDED) && (pending.size || playedSinceReport)) void report()
    }

    function onVisibility() {
      if (document.hidden && (pending.size || playedSinceReport)) void report()
    }

    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', reportOnClose)

    // A resume point near the end (or a finished video) starts from the top.
    const resume = video.resume_position_seconds
    const start = video.completed || resume >= video.duration_seconds - SEGMENT_SECONDS ? 0 : resume

    void loadYouTubeApi().then((YT) => {
      if (cancelled) return
      if (!YT) {
        setProblem("The video player couldn't load. Check your connection and reload the page.")
        return
      }
      // YouTube replaces this element with its iframe, so React never owns it.
      const holder = document.createElement('div')
      frame.appendChild(holder)
      player = new YT.Player(holder, {
        videoId: video.youtube_video_id,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, start, origin: window.location.origin },
        events: {
          onStateChange: (e) => onStateChange(e.data),
          onError: (e) => {
            setProblem('This video is unavailable. Contact HR.')
            if (!errorReported) {
              errorReported = true
              void reportVideoError(video.id, e.data).catch(() => undefined)
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', reportOnClose)
      reportOnClose()
      player?.destroy()
      player = null
      frame.replaceChildren()
    }
  }, [video, tracking])

  return (
    <div className="player-column stack">
      <div className="player-frame" ref={frameRef}>
        {problem && <div className="player-problem">{problem}</div>}
      </div>
      {stopped && <div className="alert alert-info">{stopped}</div>}
      <Card>
        <div className="player-progress">
          <div className="grow">
            <strong>{completed ? 'Watched' : `${pct}% watched`}</strong>
            <ProgressBar value={pct} label={`${video.title} watched`} />
            <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>
              {completed
                ? next ? 'The next video is unlocked.' : 'All videos in this course need to be watched to unlock the assessment.'
                : 'Watching 80% of the video completes it. Skipped parts and playback in a hidden tab are not counted.'}
            </p>
          </div>
          {completed && (next
            ? <Link className="button button-primary" to={`/courses/${courseId}/videos/${next.id}`}>Next video</Link>
            : <Link className="button button-primary" to={`/courses/${courseId}`}>Back to the course</Link>)}
        </div>
      </Card>
    </div>
  )
}

export default VideoPage
