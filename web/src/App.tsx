import { Route, Routes } from 'react-router-dom'
import { AdminOnly, AppShell } from './components/AppShell.tsx'
import AdminHome from './pages/admin/AdminHome.tsx'
import AssessmentPage from './pages/learner/AssessmentPage.tsx'
import CourseEditor from './pages/admin/CourseEditor.tsx'
import CourseResults from './pages/admin/CourseResults.tsx'
import EnrollmentReport from './pages/admin/EnrollmentReport.tsx'
import Users from './pages/admin/Users.tsx'
import Catalog from './pages/learner/Catalog.tsx'
import CoursePage from './pages/learner/CoursePage.tsx'
import Dashboard from './pages/learner/Dashboard.tsx'
import SignIn from './pages/learner/SignIn.tsx'
import VideoPage from './pages/learner/VideoPage.tsx'
import NotFound from './pages/NotFound.tsx'

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/courses" element={<Catalog />} />
        <Route path="/courses/:id" element={<CoursePage />} />
        <Route path="/courses/:id/videos/:videoId" element={<VideoPage />} />
        <Route path="/courses/:id/assessment" element={<AssessmentPage />} />
        <Route path="/admin" element={<AdminOnly><AdminHome /></AdminOnly>} />
        <Route path="/admin/courses/:id" element={<AdminOnly><CourseEditor /></AdminOnly>} />
        <Route path="/admin/courses/:id/results" element={<AdminOnly><CourseResults /></AdminOnly>} />
        <Route path="/admin/enrollments/:id" element={<AdminOnly><EnrollmentReport /></AdminOnly>} />
        <Route path="/admin/users" element={<AdminOnly><Users /></AdminOnly>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
