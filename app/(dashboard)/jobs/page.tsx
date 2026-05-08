'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDate, jobStatusColor } from '@/lib/utils'
import {
  Plus, Briefcase, Users, MoreVertical, ExternalLink,
  Pencil, Archive, X, Loader2, Check,
} from 'lucide-react'
import type { Job, JobStatus } from '@/types'

const JOB_STATUSES: JobStatus[] = ['Active', 'Filled', 'On Hold', 'Closed']

type JobWithCount = Job & { candidates: { count: number }[] }

// ── Status badge helper ────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: JobStatus | string }) {
  return (
    <span className={`badge ${jobStatusColor(status)}`}>{status}</span>
  )
}

// ── Edit Status Modal ──────────────────────────────────────────────────────────
interface EditStatusModalProps {
  job: JobWithCount
  onClose: () => void
  onSaved: (id: string, newStatus: JobStatus) => void
}

function EditStatusModal({ job, onClose, onSaved }: EditStatusModalProps) {
  const supabase = createClient()
  const [status, setStatus]   = useState<JobStatus>(job.status)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSave() {
    if (status === job.status) { onClose(); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(job.id, status)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Edit Job Status</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-3 truncate">{job.title}</p>
          <div className="grid grid-cols-2 gap-2">
            {JOB_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  status === s
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{s}</span>
                {status === s && <Check className="h-4 w-4 text-brand-500" />}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kebab menu for a single job ────────────────────────────────────────────────
interface KebabMenuProps {
  job: JobWithCount
  onEditStatus: () => void
  onArchive: () => void
}

function KebabMenu({ job, onEditStatus, onArchive }: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="More options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <Link
            href={`/jobs/${job.id}`}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
            View Candidates
          </Link>
          <button
            onClick={() => { setOpen(false); onEditStatus() }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
            Edit Status
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => { setOpen(false); onArchive() }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function JobsPage() {
  const supabase = createClient()

  const [jobs, setJobs]           = useState<JobWithCount[]>([])
  const [loading, setLoading]     = useState(true)
  const [editingJob, setEditingJob] = useState<JobWithCount | null>(null)

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('*, profiles(full_name, email), candidates(count)')
      .order('created_at', { ascending: false })
    setJobs((data ?? []) as JobWithCount[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  function handleStatusSaved(id: string, newStatus: JobStatus) {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: newStatus } : j))
  }

  async function handleArchive(job: JobWithCount) {
    if (!confirm(`Archive "${job.title}"? It will be set to Closed.`)) return
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'Closed', updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (!error) handleStatusSaved(job.id, 'Closed')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
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
          {jobs.map((job) => {
            const candidateCount = job.candidates?.[0]?.count ?? 0
            return (
              <div key={job.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  {/* Clickable area → job detail */}
                  <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1 block">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900 hover:text-brand-600 transition-colors">
                        {job.title}
                      </h2>
                      <StatusBadge status={job.status} />
                      {!job.ndpa_consent && (
                        <span className="badge bg-orange-100 text-orange-700">Awaiting NDPA</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{job.client_name}</p>
                  </Link>

                  {/* Right: meta + kebab */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        <span>{candidateCount}</span>
                      </div>
                      <span className="hidden sm:inline">{formatDate(job.created_at)}</span>
                    </div>
                    <KebabMenu
                      job={job}
                      onEditStatus={() => setEditingJob(job)}
                      onArchive={() => handleArchive(job)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Status Modal */}
      {editingJob && (
        <EditStatusModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSaved={handleStatusSaved}
        />
      )}
    </div>
  )
}
