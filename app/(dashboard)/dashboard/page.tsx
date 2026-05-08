import { createClient } from '@/lib/supabase/server'
import {
  formatDate,
  stageColor,
  outcomeColor,
  isTerminalOutcome,
  scoreColor,
} from '@/lib/utils'
import { CANDIDATE_STAGES } from '@/types'
import type { Candidate, Job, ProbationCheckin, TalentPoolEntry } from '@/types'
import {
  AlertTriangle,
  Briefcase,
  Users,
  Clock,
  Bell,
  TrendingUp,
} from 'lucide-react'
import PipelineFunnelChart from './FunnelChart'
import type { SearchParams } from 'next/dist/server/request/search-params'

export const dynamic = 'force-dynamic'

const TERMINAL_OUTCOMES = ['Dropped', 'Voluntary Exit', 'Role Filled Internally', 'Role Closed', 'Hired'] as const

function getDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

interface PageProps {
  searchParams: SearchParams
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  // Refresh probation statuses first
  await supabase.rpc('refresh_probation_statuses')

  // Determine date range filter
  const rangeParam = (await searchParams)?.range as string | undefined
  const range = rangeParam === '90d' ? '90d' : rangeParam === 'all' ? 'all' : '30d'
  const rangeLabel = range === '90d' ? 'Last 90 days' : range === 'all' ? 'All time' : 'Last 30 days'
  const rangeCutoff = range === '30d' ? getDaysAgo(30) : range === '90d' ? getDaysAgo(90) : null

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    { data: jobs },
    { data: allCandidates },
    { data: probationAlerts },
    { data: talentPool },
  ] = await Promise.all([
    supabase.from('jobs').select('id, title, client_name, status, created_at'),
    supabase
      .from('candidates')
      .select('id, job_id, name, email, ai_score, stage, outcome, created_at, updated_at, uploaded_by, profiles(email, full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('probation_checkins')
      .select(`
        id, candidate_id, day_number, label, due_date, status, notes, completed_at,
        candidates(name, jobs(title, client_name))
      `)
      .in('status', ['Due Today', 'Overdue'])
      .order('due_date', { ascending: true }),
    supabase
      .from('talent_pool')
      .select('id, pool_status, skills_tags, date_added')
      .order('date_added', { ascending: false }),
  ])

  const jobList = (jobs ?? []) as (Job & { created_at: string })[]
  const candidates = (allCandidates ?? []) as Candidate[]
  const checkins = (probationAlerts ?? []) as (ProbationCheckin & {
    candidates?: { name: string; jobs?: { title: string; client_name: string } }
  })[]
  const poolEntries = (talentPool ?? []) as TalentPoolEntry[]

  // Filter candidates by date range if applicable
  const filteredCandidates = rangeCutoff
    ? candidates.filter((c) => c.created_at >= rangeCutoff)
    : candidates

  // ── Section 2 stat calculations ────────────────────────────────────────────
  const activeRoles = jobList.filter((j) => j.status === 'Active').length

  const pipelineCandidates = filteredCandidates.filter(
    (c) => !isTerminalOutcome(c.outcome),
  ).length

  const sevenDaysAgo = getDaysAgo(7)
  const staleThisWeek = filteredCandidates.filter(
    (c) => !isTerminalOutcome(c.outcome) && c.updated_at < sevenDaysAgo,
  ).length

  const probationDue = checkins.length

  // ── Section 4 funnel chart data ────────────────────────────────────────────
  const stageCounts: Record<string, number> = {}
  CANDIDATE_STAGES.forEach((s) => { stageCounts[s] = 0 })
  filteredCandidates
    .filter((c) => !isTerminalOutcome(c.outcome))
    .forEach((c) => { stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1 })

  const funnelData = CANDIDATE_STAGES.map((stage) => ({
    stage,
    count: stageCounts[stage] ?? 0,
  }))

  // ── Section 5 placement metrics ────────────────────────────────────────────
  const totalCandidates = filteredCandidates.length
  const PIPELINE_STAGES = ['Interview', 'Technical Assessment', 'Culture Assessment', 'Background & Reference Check', 'Offer', 'Hired', 'Onboarding']
  const advancedPastCVReview = filteredCandidates.filter((c) => PIPELINE_STAGES.includes(c.stage)).length
  const cvToInterviewRate = totalCandidates > 0 ? Math.round((advancedPastCVReview / totalCandidates) * 100) : 0

  const hiredCandidates = filteredCandidates.filter((c) => c.outcome === 'Hired')
  const reachedOfferOrHired = filteredCandidates.filter(
    (c) => c.stage === 'Offer' || c.stage === 'Hired' || c.outcome === 'Hired',
  ).length
  const placementSuccessRate = reachedOfferOrHired > 0
    ? Math.round((hiredCandidates.length / reachedOfferOrHired) * 100)
    : 0

  const hiredWithDates = hiredCandidates.filter((c) => c.created_at && c.updated_at)
  const avgTimeToHire = hiredWithDates.length > 0
    ? Math.round(
        hiredWithDates.reduce((sum, c) => sum + daysBetween(c.created_at, c.updated_at), 0) /
          hiredWithDates.length,
      )
    : null

  // Drop-off by stage (terminal outcomes grouped by stage)
  const dropoffByStageCounts: Record<string, number> = {}
  filteredCandidates
    .filter((c) => isTerminalOutcome(c.outcome) && c.outcome !== 'Hired')
    .forEach((c) => {
      dropoffByStageCounts[c.stage] = (dropoffByStageCounts[c.stage] ?? 0) + 1
    })
  const dropoffData = CANDIDATE_STAGES.map((stage) => ({
    stage,
    count: dropoffByStageCounts[stage] ?? 0,
  })).filter((d) => d.count > 0)

  // ── Section 6 active roles table ──────────────────────────────────────────
  const activeJobs = jobList.filter((j) => j.status === 'Active')

  const candidatesByJob = candidates.reduce<Record<string, Candidate[]>>((acc, c) => {
    if (!acc[c.job_id]) acc[c.job_id] = []
    acc[c.job_id].push(c)
    return acc
  }, {})

  const activeRolesTableData = activeJobs.map((job) => {
    const jobCandidates = candidatesByJob[job.id] ?? []
    const inPipeline = jobCandidates.filter((c) => !isTerminalOutcome(c.outcome))
    const furthestStageIndex = inPipeline.reduce((max, c) => {
      const idx = CANDIDATE_STAGES.indexOf(c.stage)
      return idx > max ? idx : max
    }, -1)
    const furthestStage = furthestStageIndex >= 0 ? CANDIDATE_STAGES[furthestStageIndex] : null
    const daysOpen = daysBetween(job.created_at, new Date().toISOString())
    return {
      job,
      cvsScreened: jobCandidates.length,
      inPipeline: inPipeline.length,
      furthestStage,
      daysOpen,
    }
  })

  // ── Section 7 talent pool ─────────────────────────────────────────────────
  const totalPool = poolEntries.length
  const availablePool = poolEntries.filter((e) => e.pool_status === 'Available').length
  const inProcessPool = poolEntries.filter((e) => e.pool_status === 'In Process').length

  const tagFrequency: Record<string, number> = {}
  poolEntries.forEach((e) => {
    ;(e.skills_tags ?? []).forEach((tag) => {
      tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1
    })
  })
  const topTags = Object.entries(tagFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-8">
      {/* ── Section 1: Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {([['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['all', 'All time']] as const).map(
            ([val, label]) => (
              <a
                key={val}
                href={`/dashboard?range=${val}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === val
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </a>
            ),
          )}
        </div>
      </div>

      {/* ── Section 2: Live Pipeline Summary ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Briefcase className="h-5 w-5 text-brand-500" />}
          label="Total Active Roles"
          value={activeRoles}
          color="bg-brand-50"
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Candidates in Pipeline"
          value={pipelineCandidates}
          sub={rangeLabel}
          color="bg-blue-50"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          label="Stale This Week"
          value={staleThisWeek}
          sub="Need action"
          color="bg-amber-50"
          alert={staleThisWeek > 0}
        />
        <StatCard
          icon={<Bell className="h-5 w-5 text-red-500" />}
          label="Probation Due"
          value={probationDue}
          sub="Due Today / Overdue"
          color="bg-red-50"
          alert={probationDue > 0}
        />
      </div>

      {/* ── Section 3: Probation Alerts ───────────────────────────────────────── */}
      {checkins.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-amber-800">
              Probation Alerts — {checkins.length} check-in{checkins.length !== 1 ? 's' : ''} need attention
            </h2>
          </div>
          <div className="space-y-2">
            {checkins.map((checkin) => (
              <div
                key={checkin.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {checkin.candidates?.name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {checkin.candidates?.jobs?.title ?? '—'} ·{' '}
                    {checkin.candidates?.jobs?.client_name ?? '—'} · {checkin.label}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{formatDate(checkin.due_date)}</span>
                  <span
                    className={`badge ${
                      checkin.status === 'Overdue'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {checkin.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: Pipeline Funnel Chart ─────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pipeline Funnel</h2>
        <p className="text-xs text-gray-400 mb-4">Active candidates (non-terminal outcomes) by stage</p>
        <PipelineFunnelChart data={funnelData} />
      </div>

      {/* ── Section 5: Placement Metrics ─────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Placement Metrics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="CV to Interview Rate"
            value={`${cvToInterviewRate}%`}
            sub={`${advancedPastCVReview} of ${totalCandidates} advanced`}
            color="text-blue-600"
          />
          <MetricCard
            label="Placement Success Rate"
            value={`${placementSuccessRate}%`}
            sub={`${hiredCandidates.length} hired of ${reachedOfferOrHired} offers`}
            color="text-green-600"
          />
          <MetricCard
            label="Avg Time to Hire"
            value={avgTimeToHire !== null ? `${avgTimeToHire}d` : '—'}
            sub="Days from upload to hire"
            color="text-violet-600"
          />
        </div>

        {/* Drop-off by Stage */}
        {dropoffData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Drop-off by Stage</h3>
            <PipelineFunnelChart data={dropoffData} color="#ef4444" />
          </div>
        )}
      </div>

      {/* ── Section 6: Active Roles Table ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Active Roles</h2>
          <span className="text-xs text-gray-400">{activeRolesTableData.length} roles</span>
        </div>
        {activeRolesTableData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No active roles</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Client
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">
                    CVs Screened
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">
                    In Pipeline
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Furthest Stage
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Days Open
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeRolesTableData.map(({ job, cvsScreened, inPipeline, furthestStage, daysOpen }) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <a
                        href={`/jobs/${job.id}`}
                        className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                      >
                        {job.title}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{job.client_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{cvsScreened}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${inPipeline > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {inPipeline}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {furthestStage ? (
                        <span className={`badge ${stageColor(furthestStage)}`}>{furthestStage}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          daysOpen > 60 ? 'text-red-600' : daysOpen > 30 ? 'text-amber-600' : 'text-gray-600'
                        }`}
                      >
                        {daysOpen}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 7: Talent Pool Summary ───────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Talent Pool</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total in Pool</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{totalPool}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Available</p>
            <p className="mt-2 text-3xl font-bold text-green-600">{availablePool}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">In Process</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{inProcessPool}</p>
          </div>
        </div>

        {topTags.length > 0 && (
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Top Skills in Pool</p>
            <div className="flex flex-wrap gap-2">
              {topTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 border border-brand-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  alert,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  color: string
  alert?: boolean
}) {
  return (
    <div className={`card p-5 ${alert ? 'ring-2 ring-amber-200' : ''}`}>
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
