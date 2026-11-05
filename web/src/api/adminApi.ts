// All admin calls (/api/admin/*). Endpoints: architecture.md section 7.3.
import { apiDownload, apiRequest } from './client.ts'

export const adminRequest = <T>(path: string, init?: RequestInit) => apiRequest<T>(`/admin${path}`, init)

export type CourseStatus = 'draft' | 'published' | 'archived'

export type CourseSummary = {
  id: string
  title: string
  status: CourseStatus
  pass_percentage: number
  due_at: string | null
  published_at: string | null
  created_at: string
  video_count: number
  question_count: number
  enrolled: number
  completed: number
  average_score: number | null
}

export type Video = { id?: string; position?: number; title: string; youtube_video_id: string; duration_seconds: number }
export type Option = { id?: string; position?: number; text: string; is_correct: boolean }
export type QuestionType = 'single' | 'multiple'
export type Question = { id?: string; position?: number; text: string; type: QuestionType; points: number; options: Option[] }

export type Course = {
  id: string
  title: string
  description: string | null
  pass_percentage: number
  due_at: string | null
  status: CourseStatus
  published_at: string | null
  created_at: string
  videos: Video[]
  questions: Question[]
}

export type CourseDetails = { title: string; description: string | null; pass_percentage: number; due_at: string | null }
export type VideoCheck =
  | { ok: true; youtubeId: string; title: string }
  | { ok: false; reason: 'bad_url' | 'not_embeddable' | 'not_found' | 'check_failed' }

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const listCourses = () => adminRequest<{ courses: CourseSummary[] }>('/courses')
export const getCourse = (id: string) => adminRequest<Course>(`/courses/${id}`)
export const createCourse = (details: CourseDetails) => adminRequest<Course>('/courses', json('POST', details))
export const updateCourse = (id: string, details: CourseDetails) => adminRequest<Course>(`/courses/${id}`, json('PUT', details))
export const saveVideos = (id: string, videos: Video[]) =>
  adminRequest<Course>(`/courses/${id}/videos`, json('PUT', {
    videos: videos.map(({ title, youtube_video_id, duration_seconds }) => ({ title, youtube_video_id, duration_seconds })),
  }))
export const saveQuestions = (id: string, questions: Question[]) =>
  adminRequest<Course>(`/courses/${id}/questions`, json('PUT', {
    questions: questions.map(({ text, type, points, options }) => ({
      text, type, points, options: options.map(({ text, is_correct }) => ({ text, is_correct })),
    })),
  }))
export const publishCourse = (id: string) => adminRequest<Course>(`/courses/${id}/publish`, { method: 'POST' })
export const duplicateCourse = (id: string) => adminRequest<Course>(`/courses/${id}/duplicate`, { method: 'POST' })
export const archiveCourse = (id: string) => adminRequest<Course>(`/courses/${id}/archive`, { method: 'POST' })
export const setPassMark = (id: string, pass_percentage: number) =>
  adminRequest<Course>(`/courses/${id}/pass-mark`, json('PUT', { pass_percentage }))
export const checkVideo = (url: string) => adminRequest<VideoCheck>('/videos/check', json('POST', { url }))

// Assign, tracking, reports, stats, export, users (step C5). Pass/fail is
// worked out by the API from the current pass mark.
export type CourseHead = {
  id: string; title: string; status: CourseStatus; pass_percentage: number
  video_count: number; question_count: number; past_due: boolean
}

export type EnrollmentStatus = 'enrolled' | 'videos_done' | 'assessment_in_progress' | 'completed'

export type TrackingRow = {
  id: string
  email: string
  full_name: string | null
  employee_code: string | null
  signed_in: boolean
  source: 'self' | 'admin'
  enrolled_at: string
  status: EnrollmentStatus
  completed_at: string | null
  videos_completed: number
  progress_pct: number
  score_pct: number | null
  passed: boolean | null
}

export type CourseStats = {
  course: CourseHead
  enrolled: number
  videos_done: number
  completed: number
  passed: number
  pass_rate: number | null
  average_score: number | null
  questions: { id: string; position: number; text: string; type: QuestionType; answered: number; correct: number; pct_correct: number | null }[]
}

export type AssignResult = {
  enrolled: number
  already_enrolled: number
  rejected: { input: string; reason: 'invalid' | 'domain' }[]
}

export type EnrollmentReport = {
  course: CourseHead
  enrollment: TrackingRow
  videos: {
    id: string; position: number; title: string; duration_seconds: number
    watched_segments: number; total_segments: number; watched_pct: number
    completed_at: string | null; last_reported_at: string | null
  }[]
  attempts: {
    id: string; attempt_no: number; status: 'in_progress' | 'submitted'; submit_reason: 'learner' | 'due_date' | null
    started_at: string; submitted_at: string | null
    score_points: number | null; max_points: number | null; score_pct: number | null; passed: boolean | null
    answers: {
      question_id: string; position: number; text: string; type: QuestionType; points: number
      is_correct: boolean | null; points_awarded: number | null
      options: { id: string; text: string; is_correct: boolean; selected: boolean }[]
    }[]
  }[]
}

export type AdminUser = {
  id: string; email: string; full_name: string | null; role: 'learner' | 'admin'
  employee_code: string | null; first_signed_in_at: string | null; created_at: string; enrollments: number
}

export const assignByEmail = (id: string, emails: string[]) =>
  adminRequest<AssignResult>(`/courses/${id}/assign`, json('POST', { emails }))
export const getTracking = (id: string) =>
  adminRequest<{ course: CourseHead; enrollments: TrackingRow[] }>(`/courses/${id}/tracking`)
export const getStats = (id: string) => adminRequest<CourseStats>(`/courses/${id}/stats`)
export const getEnrollmentReport = (id: string) => adminRequest<EnrollmentReport>(`/enrollments/${id}/report`)
export const downloadExport = (id: string) => apiDownload(`/admin/courses/${id}/export`)
export const listUsers = (q: string) => adminRequest<{ users: AdminUser[] }>(`/users?q=${encodeURIComponent(q)}`)
export const setUserRole = (id: string, role: 'learner' | 'admin') =>
  adminRequest<AdminUser>(`/users/${id}/role`, json('PUT', { role }))
