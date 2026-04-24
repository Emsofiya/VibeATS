import type { CandidateStatus, Candidate } from '@/types'

// ─── Status helpers ───────────────────────────────────────────────────────────

export function scoreToStatus(score: number): CandidateStatus {
  if (score >= 75) return 'Second Review'
  if (score >= 70) return 'Potential Fit'
  return 'Rejected'
}

export function statusColor(status: CandidateStatus | 'Pending' | null | undefined): string {
  switch (status) {
    case 'Second Review': return 'bg-green-100 text-green-800'
    case 'Potential Fit':  return 'bg-yellow-100 text-yellow-800'
    case 'Rejected':       return 'bg-red-100 text-red-800'
    default:               return 'bg-gray-100 text-gray-600'
  }
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 75)   return 'text-green-700 font-semibold'
  if (score >= 70)   return 'text-yellow-700 font-semibold'
  return 'text-red-700 font-semibold'
}

export function jobStatusColor(status: string): string {
  switch (status) {
    case 'Active':  return 'bg-green-100 text-green-800'
    case 'On Hold': return 'bg-yellow-100 text-yellow-800'
    case 'Closed':  return 'bg-gray-100 text-gray-600'
    default:        return 'bg-gray-100 text-gray-600'
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

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportCandidatesToCSV(candidates: Candidate[], filename = 'shortlist.csv') {
  const headers = [
    'Name', 'Email', 'Total Score', 'Status', 'AI Status',
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
      q(c.manual_status ?? c.ai_status ?? ''),
      q(c.ai_status ?? ''),
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

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAuditToCSV(rows: Record<string, unknown>[], filename = 'audit.csv') {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => q(String(r[h] ?? ''))).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// CSV-quote a value
function q(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

// ─── Template interpolation ───────────────────────────────────────────────────

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}
