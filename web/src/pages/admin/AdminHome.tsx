import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createCourse, listCourses, type CourseSummary } from '../../api/adminApi.ts'
import { Badge, Card, EmptyState } from '../../components/ui.tsx'
import { statusBadge } from './courseStatus.ts'

// Course list and "New course" (execution step C1).
function AdminHome() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listCourses()
      .then((r) => setCourses(r.courses))
      .catch(() => setError('Could not load courses.'))
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const course = await createCourse({ title: title.trim(), description: null, pass_percentage: 70, due_at: null })
      navigate(`/admin/courses/${course.id}`)
    } catch {
      setError('Could not create the course.')
      setCreating(false)
    }
  }

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1>Manage courses</h1>
      </div>

      <Card title="New course">
        <form className="row" onSubmit={onCreate}>
          <input
            className="input grow"
            required
            maxLength={200}
            placeholder="Course title, e.g. Email Etiquette"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="button button-primary" type="submit" disabled={creating || !title.trim()}>
            Create draft
          </button>
        </form>
      </Card>

      <Card title="Courses">
        {error && <div className="alert alert-danger">{error}</div>}
        {courses === null && !error && <p className="muted">Loading…</p>}
        {courses?.length === 0 && <EmptyState title="No courses yet" text="Create your first course above." />}
        {courses && courses.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Videos</th>
                  <th>Questions</th>
                  <th>Pass mark</th>
                  <th>Enrolled</th>
                  <th>Completed</th>
                  <th>Avg. score</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/admin/courses/${c.id}`}>{c.title}</Link></td>
                    <td><Badge tone={statusBadge[c.status].tone}>{statusBadge[c.status].label}</Badge></td>
                    <td>{c.video_count}</td>
                    <td>{c.question_count}</td>
                    <td>{c.pass_percentage}%</td>
                    <td>{c.enrolled}</td>
                    <td>{c.completed}</td>
                    <td>{c.average_score === null ? '—' : `${c.average_score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default AdminHome
