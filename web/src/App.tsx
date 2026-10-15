import { Navigate, Route, Routes } from 'react-router-dom'
import AdminHome from './pages/admin/AdminHome.tsx'
import TakeLanding from './pages/take/TakeLanding.tsx'
import InvalidLink from './pages/take/InvalidLink.tsx'

function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminHome />} />
      <Route path="/t/:token" element={<TakeLanding />} />
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<InvalidLink />} />
    </Routes>
  )
}

export default App
