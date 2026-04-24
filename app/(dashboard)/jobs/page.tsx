import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, jobStatusColor } from '@/lib/utils'
import { Plus, Briefcase, Users } from 'lucide-react'
import type { Job } from '@/types'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const supabase = await createClient()

  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      *,
      profiles(full_name, email),
      candidates(count)
    `)
    .order('created_at', { ascending: false })

  const allJobs = (jobs ?? []) as (Job & { candidates: { count: number }[] })[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{allJobs.length} total</p>
        </div>
        <Link href="/jobs/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Job
        </Link>
      </div>

      {allJobs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No jobs yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first job to start screening CVs.</p>
          <Link href="/jobs/new" className="btn-primary mt-4">
            <Plus className="h-4 w-4" />
            Create Job
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {allJobs.map((job) => {
            const candidateCount = job.candidates?.[0]?.count ?? 0
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="card p-5 hover:shadow-md transition-shadow block">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900">{job.title}</h2>
                      <span className={`badge ${jobStatusColor(job.status)}`}>{job.status}</span>
                      {!job.ndpa_consent && (
                        <span className="badge bg-orange-100 text-orange-700">Awaiting NDPA</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{job.client_name}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-sm text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>{candidateCount}</span>
                    </div>
                    <span>{formatDate(job.created_at)}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
