import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { jobStatusColor, formatDate } from '@/lib/utils'
import { ChevronLeft, FileText, ExternalLink } from 'lucide-react'
import CandidateTable from '@/components/candidates/CandidateTable'
import CVUpload from '@/components/candidates/CVUpload'
import type { Candidate } from '@/types'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export default async function JobDetailPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: job } = await supabase
    .from('jobs')
    .select('*, profiles(full_name, email)')
    .eq('id', params.id)
    .single()

  if (!job) notFound()

  const { data: candidates } = await supabase
    .from('candidates')
    .select('*, profiles(full_name, email)')
    .eq('job_id', params.id)
    .order('created_at', { ascending: false })

  const allCandidates = (candidates ?? []) as Candidate[]

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeft className="h-4 w-4" />
          All Jobs
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
              <span className={`badge ${jobStatusColor(job.status)}`}>{job.status}</span>
              {!job.ndpa_consent && (
                <span className="badge bg-orange-100 text-orange-700">Awaiting NDPA Consent</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {job.client_name} · Created {formatDate(job.created_at)}
              {job.profiles && ` · by ${job.profiles.full_name || job.profiles.email}`}
            </p>
          </div>
          {job.jd_file_url && (
            <a
              href={job.jd_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              <FileText className="h-4 w-4" />
              View JD
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </a>
          )}
        </div>
      </div>

      {/* NDPA warning — uploads disabled until consent given */}
      {!job.ndpa_consent && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>NDPA consent not recorded.</strong> CV uploads are disabled until consent is confirmed on this job.
        </div>
      )}

      {/* Two-column layout on large screens */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Candidate table — takes 2/3 width */}
        <div className="lg:col-span-2">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Candidates ({allCandidates.length})
            </h2>
            <CandidateTable candidates={allCandidates} jobId={params.id} />
          </div>
        </div>

        {/* Upload panel — takes 1/3 width */}
        <div>
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Upload CVs</h2>
            <p className="text-xs text-gray-400 mb-4">
              AI will screen each CV against the job description automatically.
            </p>
            {job.ndpa_consent ? (
              <CVUpload jobId={params.id} jdText={job.jd_text} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                NDPA consent required before uploading CVs.
              </p>
            )}
          </div>

          {/* JD text preview if available */}
          {job.jd_text && (
            <div className="card p-5 mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                JD Preview
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-6">
                {job.jd_text}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
