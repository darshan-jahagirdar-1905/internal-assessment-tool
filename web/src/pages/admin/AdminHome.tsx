import { Card, EmptyState } from '../../components/ui.tsx'

// Course management. The course builder arrives in execution step C1.
function AdminHome() {
  return (
    <>
      <div className="page-header">
        <h1>Manage courses</h1>
      </div>
      <Card title="Courses">
        <EmptyState title="No courses yet" text="The course builder is coming next." />
      </Card>
    </>
  )
}

export default AdminHome
