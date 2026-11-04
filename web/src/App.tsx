import { Route, Routes } from 'react-router-dom'
import AdminHome from './pages/admin/AdminHome.tsx'
import Dashboard from './pages/learner/Dashboard.tsx'
import SignIn from './pages/learner/SignIn.tsx'
import NotFound from './pages/NotFound.tsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/admin/*" element={<AdminHome />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
