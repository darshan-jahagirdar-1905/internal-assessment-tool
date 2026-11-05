// All admin calls (/api/admin/*). Endpoints: architecture.md section 7.3.
import { apiRequest } from './client.ts'

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
