'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDate, scoreColor, outcomeColor, stageColor } from '@/lib/utils'
import { CANDIDATE_STAGES } from '@/types'
import type { TalentPoolEntry, Job, CandidateStage, CandidateOutcome } from '@/types'
import {
  Search,
  Star,
  Loader2,
  X,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  Briefcase,
  ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type PoolStatusFilter = 'All' | 'Available' | 'In Process' | 'Placed'
type ScoreFilter = 'All' | '75+' | '50-74' | 'Below 50'

interface ActiveJob {
  id: string
  title: string
  client_name: string
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function poolStatusColor(status: string): string {
  switch (status) {
    case 'Available':  return 'bg-green-100 text-green-800'
    case 'In Process': return 'bg-amber-100 text-amber-800'
    case 'Placed':     return 'bg-blue-100 text-blue-800'
    default:           return 'bg-gray-100 text-gray-600'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TalentPoolPage() {
  const supabase = createClient()

  const [entries, setEntries] = useState<TalentPoolEntry[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PoolStatusFilter>('All')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('All')

  // Assign modal state
  const [assignEntry, setAssignEntry] = useState<TalentPoolEntry | null>(null)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: poolData }, { data: jobData }] = await Promise.all([
      supabase
        .from('talent_pool')
        .select(`
          id, candidate_id, original_job_id, ai_score, date_added,
          added_by, skills_tags, notes, pool_status,
          candidates(
            id, name, email, ai_score, stage, outcome, job_id,
            jobs(id, title, client_name)
          ),
          jobs:original_job_id(id, title, client_name),
          profiles:added_by(email)
        `)
        .order('date_added', { ascending: false }),
      supabase
        .from('jobs')
        .select('id, title, client_name')
        .eq('status', 'Active')
        .order('title'),
    ])

    setEntries((poolData ?? []) as TalentPoolEntry[])
    setActiveJobs((jobData ?? []) as ActiveJob[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = entries

    if (statusFilter !== 'All') {
      list = list.filter((e) => e.pool_status === statusFilter)
    }

    if (scoreFilter !== 'All') {
      list = list.filter((e) => {
        const s = e.ai_score ?? 0
        if (scoreFilter === '75+')      return s >= 75
        if (scoreFilter === '50-74')    return s >= 50 && s < 75
        if (scoreFilter === 'Below 50') return s < 50
        return true
      })
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((e) => {
        const cand = e.candidates
        return (
          (cand?.name ?? '').toLowerCase().includes(q) ||
          (cand?.email ?? '').toLowerCase().includes(q) ||
          (e.skills_tags ?? []).some((t) => t.toLowerCase().includes(q))
        )
      })
    }

    return list
  }, [entries, statusFilter, scoreFilter, search])

  // ── Summary stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:     entries.length,
    available: entries.filter((e) => e.pool_status === 'Available').length,
    inProcess: entries.filter((e) => e.pool_status === 'In Process').length,
    placed:    entries.filter((e) => e.pool_status === 'Placed').length,
  }), [entries])

  // ── Assign to Job ──────────────────────────────────────────────────────────

  function openAssignModal(entry: TalentPoolEntry) {
    setAssignEntry(entry)
    setSelectedJobId(activeJobs[0]?.id ?? '')
    setAssignError(null)
  }

  function closeAssignModal() {
    setAssignEntry(null)
    setSelectedJobId('')
    setAssignError(null)
  }

  async function handleAssign() {
    if (!assignEntry || !selectedJobId) return
    setAssigning(true)
    setAssignError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const cand = assignEntry.candidates

      if (!cand) throw new Error('Candidate data missing')

      // Insert new candidate row for the target job
      const { data: newCand, error: insertError } = await supabase
        .from('candidates')
        .insert({
          job_id:      selectedJobId,
          name:        cand.name,
          email:       cand.email,
          ai_score:    cand.ai_score,
          stage:       'CV Review' as CandidateStage,
          outcome:     'Second Review' as CandidateOutcome,
          uploaded_by: user?.id ?? '',
          notes:       `Assigned from Talent Pool (original candidate ID: ${cand.id})`,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      // Update talent pool entry to In Process
      const { error: updateError } = await supabase
        .from('talent_pool')
        .update({ pool_status: 'In Process' })
        .eq('id', assignEntry.id)

      if (updateError) throw updateError

      // Audit log
      await supabase.from('audit_logs').insert({
        action:       'assigned_from_talent_pool',
        entity_type:  'candidate',
        entity_id:    newCand?.id ?? null,
        job_id:       selectedJobId,
        candidate_id: newCand?.id ?? null,
        performed_by: user?.id ?? null,
        metadata: {
          source_candidate_id:  cand.id,
          source_candidate_name: cand.name,
          pool_entry_id:        assignEntry.id,
          target_job_id:        selectedJobId,
        },
      })

      // Refresh
      await fetchData()
      closeAssignModal()
      setToast({ message: `${cand.name} assigned to job successfully`, type: 'success' })
      setTimeout(() => setToast(null), 3500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to assign candidate'
      setAssignError(msg)
    } finally {
      setAssigning(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Talent Pool</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? 'Loading…' : `${entries.length} candidates available for future roles`}
        </p>
      </div>

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total in Pool" value={stats.total}     color="text-gray-900"  />
        <SummaryCard label="Available"     value={stats.available} color="text-green-600" />
        <SummaryCard label="In Process"    value={stats.inProcess} color="text-amber-600" />
        <SummaryCard label="Placed"        value={stats.placed}    color="text-blue-600"  />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, email or skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Pool Status */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {(['All', 'Available', 'In Process', 'Placed'] as PoolStatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Score range */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {(['All', '75+', '50-74', 'Below 50'] as ScoreFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setScoreFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                scoreFilter === s
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table / Empty state ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : entries.length === 0 ? (
        /* Empty state */
        <div className="card flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <Star className="h-8 w-8 text-brand-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-800">No candidates in the talent pool yet</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">
            Candidates with a score of 60 or above can be added to the talent pool from the Candidates page.
          </p>
          <Link href="/candidates" className="btn-primary mt-5">
            <Search className="h-4 w-4" />
            Browse Candidates
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500">No results match your filters</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting the search or filter options.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400 font-medium">
              {filtered.length} of {entries.length} candidates
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Candidate</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Original Role</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Skills</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Date Added</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((entry) => {
                  const cand = entry.candidates
                  const origJob = entry.jobs as { id: string; title: string; client_name: string } | undefined
                  const visibleTags = (entry.skills_tags ?? []).slice(0, 4)
                  const extraTags = (entry.skills_tags ?? []).length - 4

                  return (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      {/* Candidate */}
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{cand?.name ?? '—'}</p>
                        {cand?.email && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{cand.email}</p>
                        )}
                        {cand && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`badge text-[10px] ${stageColor(cand.stage)}`}>{cand.stage}</span>
                            <span className={`badge text-[10px] ${outcomeColor(cand.outcome)}`}>{cand.outcome}</span>
                          </div>
                        )}
                      </td>

                      {/* Original Role */}
                      <td className="px-4 py-3">
                        {origJob ? (
                          <>
                            <p className="text-gray-700 font-medium truncate max-w-[160px]">{origJob.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{origJob.client_name}</p>
                          </>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3 text-right">
                        {entry.ai_score != null ? (
                          <span className={`text-sm font-semibold tabular-nums ${scoreColor(entry.ai_score)}`}>
                            {entry.ai_score}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Skills Tags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {visibleTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                            >
                              {tag}
                            </span>
                          ))}
                          {extraTags > 0 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                              +{extraTags}
                            </span>
                          )}
                          {visibleTags.length === 0 && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>

                      {/* Pool Status */}
                      <td className="px-4 py-3">
                        <span className={`badge ${poolStatusColor(entry.pool_status)}`}>
                          {entry.pool_status}
                        </span>
                      </td>

                      {/* Date Added */}
                      <td className="px-4 py-3 text-right text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(entry.date_added)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-nowrap">
                          {/* View Report */}
                          {cand && entry.original_job_id && (
                            <Link
                              href={`/jobs/${entry.original_job_id}/candidates/${cand.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Report
                            </Link>
                          )}

                          {/* Assign to Job */}
                          {entry.pool_status !== 'Placed' && (
                            <button
                              onClick={() => openAssignModal(entry)}
                              className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors whitespace-nowrap"
                            >
                              <Briefcase className="h-3 w-3" />
                              Assign to Job
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Assign to Job Modal ─────────────────────────────────────────────── */}
      {assignEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Assign to Job</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Assign{' '}
                  <span className="font-medium text-gray-800">{assignEntry.candidates?.name}</span>{' '}
                  to an active role
                </p>
              </div>
              <button
                onClick={closeAssignModal}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Candidate summary */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{assignEntry.candidates?.name}</p>
                  {assignEntry.candidates?.email && (
                    <p className="text-xs text-gray-500 mt-0.5">{assignEntry.candidates.email}</p>
                  )}
                </div>
                {assignEntry.ai_score != null && (
                  <span className={`text-sm font-bold tabular-nums ${scoreColor(assignEntry.ai_score)}`}>
                    {assignEntry.ai_score}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(assignEntry.skills_tags ?? []).slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Job selector */}
            <div>
              <label className="label">Select Active Job</label>
              {activeJobs.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">No active jobs available.</p>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="input appearance-none pr-8"
                  >
                    {activeJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} — {job.client_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>

            {/* Info note */}
            <p className="text-xs text-gray-400 leading-relaxed">
              A new candidate record will be created for the selected job with stage{' '}
              <strong className="text-gray-500">CV Review</strong> and outcome{' '}
              <strong className="text-gray-500">Second Review</strong>. The pool entry status
              will be updated to <strong className="text-gray-500">In Process</strong>.
            </p>

            {/* Error */}
            {assignError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{assignError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={closeAssignModal} className="btn-secondary" disabled={assigning}>
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedJobId || activeJobs.length === 0}
                className="btn-primary"
              >
                {assigning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning…
                  </>
                ) : (
                  <>
                    <Briefcase className="h-4 w-4" />
                    Confirm Assignment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 shadow-lg ${
            toast.type === 'success'
              ? 'border-green-200 bg-white'
              : 'border-red-200 bg-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm text-gray-800">{toast.message}</span>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
