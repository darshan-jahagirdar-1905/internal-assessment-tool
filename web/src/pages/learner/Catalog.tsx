import { Card, EmptyState } from '../../components/ui.tsx'

// Course catalog. Published courses and enrolling arrive in execution step C2.
function Catalog() {
  return (
    <>
      <div className="page-header">
        <h1>Course catalog</h1>
      </div>
      <Card title="Available courses">
        <EmptyState title="No courses published yet" text="When HR publishes a course, you can enroll here." />
      </Card>
    </>
  )
}

export default Catalog
