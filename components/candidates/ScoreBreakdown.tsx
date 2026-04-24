import type { AIReport } from '@/types'
import { AlertTriangle } from 'lucide-react'

interface Props {
  report: AIReport
}

const dimensions = [
  { key: 'experience_fit',      label: 'Experience Fit',         max: 20 },
  { key: 'skills_competencies', label: 'Skills & Competencies',  max: 25 },
  { key: 'jd_context_fit',      label: 'JD & Context Fit',       max: 20 },
  { key: 'achievements_impact', label: 'Achievements & Impact',  max: 25 },
  { key: 'values_mindset',      label: 'Values & Mindset',       max: 10 },
] as const

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-yellow-400'
  return 'bg-red-400'
}

export default function ScoreBreakdown({ report }: Props) {
  const total = report.total_score
  const totalColor = total >= 75 ? 'text-green-700' : total >= 70 ? 'text-yellow-700' : 'text-red-700'

  return (
    <div className="space-y-6">
      {/* Total score hero */}
      <div className="flex items-center gap-5 rounded-xl bg-gray-50 border border-gray-200 p-5">
        <div className={`text-5xl font-bold tabular-nums ${totalColor}`}>{total}</div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Score</p>
          <p className="font-medium text-gray-800">{report.candidate_name}</p>
          {report.candidate_email && (
            <p className="text-sm text-gray-500">{report.candidate_email}</p>
          )}
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-4">
        {dimensions.map(({ key, label, max }) => {
          const score = report.scores[key]
          const pct   = Math.round((score / max) * 100)
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm tabular-nums text-gray-600">
                  {score} <span className="text-gray-400">/ {max}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {report.rationale[key] && (
                <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                  {report.rationale[key]}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Red flags */}
      {report.red_flags.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <h4 className="text-sm font-semibold text-red-800">Red Flags</h4>
          </div>
          <ul className="space-y-1 list-disc list-inside">
            {report.red_flags.map((flag, i) => (
              <li key={i} className="text-sm text-red-700">{flag}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Overall recommendation */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-1.5">Overall Recommendation</h4>
        <p className="text-sm text-gray-600 leading-relaxed">{report.overall_recommendation}</p>
      </div>

      {/* Internal notes */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
          Internal Notes (not for candidates)
        </h4>
        <p className="text-sm text-amber-900 leading-relaxed">{report.internal_notes}</p>
      </div>

      {/* Candidate-facing rationale (NDPA) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          Candidate-Facing Rationale (NDPA Subject Access)
        </h4>
        <p className="text-sm text-gray-700 leading-relaxed">{report.candidate_facing_rationale}</p>
      </div>
    </div>
  )
}
