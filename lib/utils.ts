import type { Candidate, CandidateStage, CandidateOutcome, JobStatus } from '@/types'
import { CANDIDATE_STAGES } from '@/types'

// ─── Stage helpers ────────────────────────────────────────────────────────────

export function nextStage(current: CandidateStage): CandidateStage | null {
  const idx = CANDIDATE_STAGES.indexOf(current)
  return idx >= 0 && idx < CANDIDATE_STAGES.length - 1
    ? CANDIDATE_STAGES[idx + 1]
    : null
}

export function stageIndex(stage: CandidateStage): number {
  return CANDIDATE_STAGES.indexOf(stage)
}

export function stageColor(stage: CandidateStage | string): string {
  const map: Record<string, string> = {
    'CV Review':                    'bg-sky-50 text-sky-700',
    'Interview':                    'bg-blue-100 text-blue-700',
    'Technical Assessment':         'bg-blue-200 text-blue-800',
    'Culture Assessment':           'bg-indigo-100 text-indigo-700',
    'Background & Reference Check': 'bg-indigo-200 text-indigo-800',
    'Offer':                        'bg-violet-100 text-violet-800',
    'Hired':                        'bg-green-100 text-green-800',
    'Onboarding':                   'bg-green-200 text-green-900',
  }
  return map[stage] ?? 'bg-gray-100 text-gray-600'
}

// ─── Outcome helpers ──────────────────────────────────────────────────────────

export function outcomeColor(outcome: CandidateOutcome | string): string {
  const map: Record<string, string> = {
    'Pending':                'bg-gray-100 text-gray-600',
    'Second Review':          'bg-green-100 text-green-800',
    'Potential Fit':          'bg-yellow-100 text-yellow-800',
    'Progressed':             'bg-green-100 text-green-700',
    'Dropped':                'bg-red-100 text-red-700',
    'Voluntary Exit':         'bg-red-100 text-red-700',
    'Role Filled Internally': 'bg-red-200 text-red-800',
    'Role Closed':            'bg-red-200 text-red-800',
    'Downgraded':             'bg-amber-100 text-amber-800',
    'On Hold':                'bg-amber-100 text-amber-700',
    'Hired':                  'bg-emerald-200 text-emerald-900',
  }
  return map[outcome] ?? 'bg-gray-100 text-gray-600'
}

export function isTerminalOutcome(outcome: CandidateOutcome | string): boolean {
  return ['Dropped', 'Voluntary Exit', 'Role Filled Internally', 'Role Closed', 'Hired'].includes(outcome)
}

// ─── Score helpers ────────────────────────────────────────────────────────────

export function scoreToOutcome(score: number): CandidateOutcome {
  if (score >= 75) return 'Second Review'
  if (score >= 50) return 'Potential Fit'
  return 'Dropped'
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 75)   return 'text-green-700 font-semibold'
  if (score >= 50)   return 'text-yellow-700 font-semibold'
  return 'text-red-700 font-semibold'
}

// ─── Job status helpers ───────────────────────────────────────────────────────

export function jobStatusColor(status: JobStatus | string): string {
  switch (status) {
    case 'Active':  return 'bg-green-100 text-green-800'
    case 'Filled':  return 'bg-blue-100 text-blue-800'
    case 'On Hold': return 'bg-yellow-100 text-yellow-800'
    case 'Closed':  return 'bg-gray-100 text-gray-600'
    default:        return 'bg-gray-100 text-gray-600'
  }
}

// ─── Probation helpers ────────────────────────────────────────────────────────

export const PROBATION_SCHEDULE = [
  { day: 14, label: 'Week 2 Check-in' },
  { day: 30, label: 'Month 1 Check-in' },
  { day: 45, label: 'Month 1.5 Check-in' },
  { day: 60, label: 'Month 2 Check-in' },
  { day: 75, label: 'Month 2.5 Check-in' },
  { day: 90, label: 'End of Probation (Day 90)' },
]

export function probationStatusColor(status: string): string {
  switch (status) {
    case 'Completed':  return 'bg-green-100 text-green-800'
    case 'Due Today':  return 'bg-amber-100 text-amber-800'
    case 'Overdue':    return 'bg-red-100 text-red-700'
    default:           return 'bg-gray-100 text-gray-500'
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportCandidatesToCSV(candidates: Candidate[], filename = 'shortlist.csv') {
  const headers = [
    'Name', 'Email', 'Total Score', 'Stage', 'Outcome',
    'Experience Fit (0-20)', 'Skills & Competencies (0-25)',
    'JD & Context Fit (0-20)', 'Achievements & Impact (0-25)',
    'Values & Mindset (0-10)', 'Red Flags',
    'Overall Recommendation', 'Candidate-Facing Rationale',
    'Internal Notes', 'Uploaded At',
  ]

  const rows = candidates.map((c) => {
    const r = c.ai_report
    return [
      q(c.name),
      q(c.email ?? ''),
      r?.total_score ?? '',
      q(c.stage),
      q(c.outcome),
      r?.scores.experience_fit ?? '',
      r?.scores.skills_competencies ?? '',
      r?.scores.jd_context_fit ?? '',
      r?.scores.achievements_impact ?? '',
      r?.scores.values_mindset ?? '',
      q((r?.red_flags ?? []).join('; ')),
      q(r?.overall_recommendation ?? ''),
      q(r?.candidate_facing_rationale ?? ''),
      q(r?.internal_notes ?? ''),
      q(formatDateTime(c.created_at)),
    ]
  })

  downloadCSV([headers, ...rows], filename)
}

export function exportAuditToCSV(rows: Record<string, unknown>[], filename = 'audit.csv') {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  downloadCSV([headers, ...rows.map((r) => headers.map((h) => q(String(r[h] ?? ''))))], filename)
}

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv  = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function q(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

// ─── Template interpolation ───────────────────────────────────────────────────

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}
