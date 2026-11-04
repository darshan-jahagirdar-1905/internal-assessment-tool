import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <main>
      <p>Page not found.</p>
      <Link to="/">Go to my courses</Link>
    </main>
  )
}

export default NotFound
