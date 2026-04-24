import JobForm from '@/components/jobs/JobForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function NewJobPage() {
  return (
    <div>
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="h-4 w-4" />
        Back to Jobs
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Job</h1>
      <div className="card p-6">
        <JobForm />
      </div>
    </div>
  )
}
