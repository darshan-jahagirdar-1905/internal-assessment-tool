// All learner calls (/api/*). Endpoints: architecture.md section 7.2.
import { apiRequest } from './client.ts'

export type Health = { ok: boolean; db: boolean; testSignin: boolean }
export type Me = { id: string; email: string; full_name: string | null; role: 'learner' | 'admin' }

export type EnrollmentStatus = 'enrolled' | 'videos_done' | 'assessment_in_progress' | 'completed'

export type CourseListItem = {
  id: string
  title: string
  description: string | null
  status: 'published' | 'archived' | 'draft'
  due_at: string | null
  video_count: number
  total_seconds: number
  question_count: number
  enrollment: null | {
    status: EnrollmentStatus
    source: 'self' | 'admin'
    enrolled_at: string
    completed_at: string | null
    score_pct: number | null
    videos_completed: number
    started: boolean
    progress_pct: number
  }
}

export type AssessmentState = 'not_enrolled' | 'locked' | 'available' | 'in_progress' | 'completed' | 'closed'

export type CoursePage = {
  id: string
  title: string
  description: string | null
  status: 'published' | 'archived' | 'draft'
  due_at: string | null
  past_due: boolean
  enrollment: null | { status: EnrollmentStatus; score_pct: number | null; completed_at: string | null }
  videos: {
    id: string
    position: number
    title: string
    youtube_video_id: string
    duration_seconds: number
    watched_pct: number
    completed: boolean
    locked: boolean
    resume_position_seconds: number
  }[]
  assessment: { state: AssessmentState; question_count: number; attempt_id: string | null; score_pct: number | null }
}

export const getHealth = () => apiRequest<Health>('/health')
export const getMe = () => apiRequest<Me>('/me')
export const listMyCourses = () => apiRequest<{ courses: CourseListItem[] }>('/courses')
export const getCoursePage = (id: string) => apiRequest<CoursePage>(`/courses/${id}`)
export const enroll = (id: string) => apiRequest<CoursePage>(`/courses/${id}/enroll`, { method: 'POST' })

export type VideoProgress = {
  watched_segments: number
  total_segments: number
  completed: boolean
  last_position_seconds: number
  watched_pct: number
}

// keepalive lets the last report finish when the page is being closed.
export const reportProgress = (videoId: string, segments: number[], position: number, keepalive = false) =>
  apiRequest<VideoProgress>(`/videos/${videoId}/progress`, {
    method: 'POST',
    body: JSON.stringify({ segments, position }),
    keepalive,
  })

export const reportVideoError = (videoId: string, code: number) =>
  apiRequest<{ ok: true }>(`/videos/${videoId}/error`, { method: 'POST', body: JSON.stringify({ code }) })

// The assessment. Questions come without correct answers; after submitting,
// only the score comes back.
export type AttemptQuestion = {
  id: string
  position: number
  text: string
  type: 'single' | 'multiple'
  options: { id: string; text: string }[]
}

export type Attempt =
  | { id: string; course_id: string; course_title: string; due_at: string | null; status: 'submitted'; score_pct: number }
  | {
      id: string
      course_id: string
      course_title: string
      due_at: string | null
      status: 'in_progress'
      questions: AttemptQuestion[]
      answers: { question_id: string; selected_option_ids: string[] }[]
    }

export type AnswerInput = { question_id: string; selected_option_ids: string[] }

export const startAttempt = (courseId: string) =>
  apiRequest<{ attempt_id: string }>(`/courses/${courseId}/attempt`, { method: 'POST' })
export const getAttempt = (id: string) => apiRequest<Attempt>(`/attempts/${id}`)
export const saveAnswer = (id: string, answer: AnswerInput) =>
  apiRequest<{ ok: true }>(`/attempts/${id}/answers`, { method: 'PUT', body: JSON.stringify(answer) })
export const submitAttempt = (id: string, answers: AnswerInput[]) =>
  apiRequest<{ score_pct: number }>(`/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) })
