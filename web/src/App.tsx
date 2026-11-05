import { Route, Routes } from 'react-router-dom'
import { AdminOnly, AppShell } from './components/AppShell.tsx'
import AdminHome from './pages/admin/AdminHome.tsx'
import Catalog from './pages/learner/Catalog.tsx'
import Dashboard from './pages/learner/Dashboard.tsx'
import SignIn from './pages/learner/SignIn.tsx'
import NotFound from './pages/NotFound.tsx'

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/courses" element={<Catalog />} />
        <Route path="/admin/*" element={<AdminOnly><AdminHome /></AdminOnly>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
