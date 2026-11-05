import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui.tsx'

function NotFound() {
  return (
    <div className="page">
      <EmptyState title="Page not found" />
      <p style={{ textAlign: 'center' }}>
        <Link to="/">Go to my courses</Link>
      </p>
    </div>
  )
}

export default NotFound
