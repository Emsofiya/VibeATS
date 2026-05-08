'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate,
  stageColor,
  outcomeColor,
  scoreColor,
  isTerminalOutcome,
  exportCandidatesToCSV,
} from '@/lib/utils'
import { CANDIDATE_STAGES, CANDIDATE_OUTCOMES } from '@/types'
import type { Candidate } from '@/types'
import {
  Search,
  Download,
  Users,
  Loader2,
  CheckCircle2,
  ChevronUp,
  ChevronsUpDown,
  AlertCircle,
  Plus,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'job' | 'stage' | 'outcome' | 'ai_score' | 'created_at'
type SortDir = 'asc' | 'desc'

type FilterTab = 'All' | 'Second Review' | 'Potential Fit' | 'Progressed' | 'On Hold' | 'Dropped' | 'Hired'

const FILTER_TABS: FilterTab[] = [
  'All', 'Second Review', 'Potential Fit', 'Progressed', 'On Hold', 'Dropped', 'Hired',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_ORDER = Object.fromEntries(CANDIDATE_STAGES.map((s, i) => [s, i]))
const OUTCOME_ORDER = Object.fromEntries(CANDIDATE_OUTCOMES.map((o, i) => [o, i]))

function compareCandidates(a: Candidate, b: Candidate, key: SortKey, dir: SortDir): number {
  let diff = 0
  switch (key) {
    case 'name':
      diff = a.name.localeCompare(b.name)
      break
    case 'job':
      diff = (a.jobs?.title ?? '').localeCompare(b.jobs?.title ?? '')
      break
    case 'stage':
      diff = (STAGE_ORDER[a.stage] ?? 0) - (STAGE_ORDER[b.stage] ?? 0)
      break
    case 'outcome':
      diff = (OUTCOME_ORDER[a.outcome] ?? 0) - (OUTCOME_ORDER[b.outcome] ?? 0)
      break
    case 'ai_score':
      diff = (a.ai_score ?? -1) - (b.ai_score ?? -1)
      break
    case 'created_at':
      diff = a.created_at.localeCompare(b.created_at)
      break
  }
  return dir === 'asc' ? diff : -diff
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const supabase = createClient()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [poolIds, setPoolIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [addingToPool, setAddingToPool] = useState<string | null>(null)
  const [poolToast, setPoolToast] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('All')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: pData }] = await Promise.all([
      supabase
        .from('candidates')
        .select(`
          id, job_id, name, email, ai_score, stage, outcome,
          uploaded_by, created_at, updated_at, notes,
          profiles(email, full_name),
          jobs(id, title, client_name, status)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('talent_pool').select('candidate_id'),
    ])
    setCandidates((cData ?? []) as Candidate[])
    setPoolIds(new Set((pData ?? []).map((r: { candidate_id: string }) => r.candidate_id)))
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = candidates

    // Tab filter
    if (activeTab !== 'All') {
      list = list.filter((c) => c.outcome === activeTab)
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.jobs?.title ?? '').toLowerCase().includes(q) ||
          (c.jobs?.client_name ?? '').toLowerCase().includes(q),
      )
    }

    return [...list].sort((a, b) => compareCandidates(a, b, sortKey, sortDir))
  }, [candidates, activeTab, search, sortKey, sortDir])

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = candidates.length
    const secondReview = candidates.filter((c) => c.outcome === 'Second Review').length
    const potentialFit = candidates.filter((c) => c.outcome === 'Potential Fit').length
    const dropped = candidates.filter((c) => c.outcome === 'Dropped').length
    const scores = candidates.filter((c) => c.ai_score != null).map((c) => c.ai_score as number)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null
    return { total, secondReview, potentialFit, dropped, avgScore }
  }, [candidates])

  // ── Sort toggle ───────────────────────────────────────────────────────────

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── Add to Talent Pool ────────────────────────────────────────────────────

  async function addToTalentPool(candidate: Candidate) {
    setAddingToPool(candidate.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const skillsTags: string[] =
        (candidate as Candidate & { ai_report?: { skills_tags?: string[] } })
          .ai_report?.skills_tags ?? []

      const { error } = await supabase.from('talent_pool').insert({
        candidate_id: candidate.id,
        original_job_id: candidate.job_id,
        ai_score: candidate.ai_score,
        added_by: user?.id ?? '',
        skills_tags: skillsTags,
        notes: null,
        pool_status: 'Available',
      })

      if (error) throw error

      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'added_to_talent_pool',
        entity_type: 'candidate',
        entity_id: candidate.id,
        job_id: candidate.job_id,
        candidate_id: candidate.id,
        performed_by: user?.id ?? null,
        metadata: { candidate_name: candidate.name },
      })

      setPoolIds((prev) => new Set([...prev, candidate.id]))
      setPoolToast(`${candidate.name} added to Talent Pool`)
      setTimeout(() => setPoolToast(null), 3500)
    } catch (err) {
      console.error('Failed to add to talent pool:', err)
    } finally {
      setAddingToPool(null)
    }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  function handleExportCSV() {
    exportCandidatesToCSV(filtered, 'candidates-export.csv')
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Loading…' : `${candidates.length} candidates across all jobs`}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="btn-secondary"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total" value={stats.total} color="text-gray-900" />
        <StatPill label="Second Review" value={stats.secondReview} color="text-green-700" />
        <StatPill label="Potential Fit" value={stats.potentialFit} color="text-yellow-700" />
        <StatPill label="Dropped" value={stats.dropped} color="text-red-700" />
        <StatPill
          label="Avg Score"
          value={stats.avgScore !== null ? `${stats.avgScore}` : '—'}
          color={stats.avgScore !== null ? scoreColor(stats.avgScore) : 'text-gray-400'}
        />
      </div>

      {/* ── Search + Filters ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email or job…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
      </div>

      {/* ── Filter Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-px">
        {FILTER_TABS.map((tab) => {
          const count =
            tab === 'All'
              ? candidates.length
              : candidates.filter((c) => c.outcome === tab).length
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
              {count > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    activeTab === tab ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">No candidates found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400 font-medium">
                {filtered.length} of {candidates.length} candidates
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <Th col="name"       label="Candidate" sortKey={sortKey} onSort={toggleSort} />
                    <Th col="job"        label="Job"       sortKey={sortKey} onSort={toggleSort} />
                    <Th col="stage"      label="Stage"     sortKey={sortKey} onSort={toggleSort} />
                    <Th col="outcome"    label="Outcome"   sortKey={sortKey} onSort={toggleSort} />
                    <Th col="ai_score"   label="Score"     sortKey={sortKey} onSort={toggleSort} right />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Uploaded By
                    </th>
                    <Th col="created_at" label="Date"      sortKey={sortKey} onSort={toggleSort} right />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((c) => {
                    const alreadyInPool = poolIds.has(c.id)
                    const eligible = (c.ai_score ?? 0) >= 60 && !isTerminalOutcome(c.outcome)
                    const uploaderEmail =
                      (c as Candidate & { profiles?: { email: string; full_name: string | null } })
                        .profiles?.email ?? c.uploaded_by

                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                        {/* Candidate */}
                        <td className="px-5 py-3">
                          <Link
                            href={`/jobs/${c.job_id}/candidates/${c.id}`}
                            className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                          >
                            {c.name}
                          </Link>
                          {c.email && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{c.email}</p>
                          )}
                        </td>

                        {/* Job */}
                        <td className="px-4 py-3">
                          {c.jobs ? (
                            <Link
                              href={`/jobs/${c.job_id}`}
                              className="text-gray-700 hover:text-brand-600 transition-colors"
                            >
                              {c.jobs.title}
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                          {c.jobs?.client_name && (
                            <p className="text-xs text-gray-400 mt-0.5">{c.jobs.client_name}</p>
                          )}
                        </td>

                        {/* Stage */}
                        <td className="px-4 py-3">
                          <span className={`badge ${stageColor(c.stage)}`}>{c.stage}</span>
                        </td>

                        {/* Outcome */}
                        <td className="px-4 py-3">
                          <span className={`badge ${outcomeColor(c.outcome)}`}>{c.outcome}</span>
                        </td>

                        {/* Score */}
                        <td className="px-4 py-3 text-right">
                          {c.ai_score != null ? (
                            <span className={`text-sm font-semibold tabular-nums ${scoreColor(c.ai_score)}`}>
                              {c.ai_score}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Uploaded by */}
                        <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[140px]">
                          {uploaderEmail}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-right text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(c.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          {alreadyInPool ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              In Pool
                            </span>
                          ) : eligible ? (
                            <button
                              onClick={() => addToTalentPool(c)}
                              disabled={addingToPool === c.id}
                              className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50"
                            >
                              {addingToPool === c.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Add to Pool
                            </button>
                          ) : (
                            <span className="text-gray-200 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {poolToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-white px-4 py-3 shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-sm text-gray-800">{poolToast}</span>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Th({
  col,
  label,
  sortKey,
  onSort,
  right,
}: {
  col: SortKey
  label: string
  sortKey: SortKey
  onSort: (k: SortKey) => void
  right?: boolean
}) {
  const px = right ? 'px-4' : col === 'name' ? 'px-5' : 'px-4'
  const align = right ? 'text-right' : 'text-left'
  const active = sortKey === col
  return (
    <th
      className={`${px} py-3 ${align} text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-pointer select-none hover:text-gray-600`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <ChevronUp className="h-3.5 w-3.5 text-brand-500" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
        )}
      </span>
    </th>
  )
}
