'use client'

import { Check, X } from 'lucide-react'
import { CANDIDATE_STAGES } from '@/types'
import type { CandidateStage, CandidateOutcome } from '@/types'
import { isTerminalOutcome } from '@/lib/utils'

interface Props {
  stage: CandidateStage
  outcome: CandidateOutcome
}

const SHORT_LABELS: Record<CandidateStage, string> = {
  'CV Review':                    'CV',
  'Interview':                    'Int.',
  'Technical Assessment':         'Tech.',
  'Culture Assessment':           'Culture',
  'Background & Reference Check': 'Ref. Check',
  'Offer':                        'Offer',
  'Hired':                        'Hired',
  'Onboarding':                   'Onboarding',
}

export default function PipelineProgress({ stage, outcome }: Props) {
  const currentIdx   = CANDIDATE_STAGES.indexOf(stage)
  const isTerminal   = isTerminalOutcome(outcome)
  const isHired      = outcome === 'Hired'
  // Dropped/exit/etc — show red X on current stage
  const isNegative   = isTerminal && !isHired

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-start min-w-max px-1">
        {CANDIDATE_STAGES.map((s, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent   = idx === currentIdx
          const isFuture    = idx > currentIdx

          // Hired outcome: all stages up to & including 'Hired' (index 6) go green
          const hiredIdx   = CANDIDATE_STAGES.indexOf('Hired')
          const greenFill  = isHired && idx <= hiredIdx

          let circleClasses = ''
          let lineClasses   = ''
          let content: React.ReactNode = null

          if (greenFill) {
            circleClasses = 'bg-green-500 border-green-500 text-white'
            content       = idx === hiredIdx
              ? <Check className="h-3.5 w-3.5" />
              : <Check className="h-3.5 w-3.5" />
          } else if (isCurrent && isNegative) {
            circleClasses = 'bg-red-500 border-red-500 text-white'
            content       = <X className="h-3.5 w-3.5" />
          } else if (isCurrent) {
            circleClasses = 'bg-brand-500 border-brand-500 text-white ring-4 ring-brand-100'
            content       = <span className="text-xs font-bold">{idx + 1}</span>
          } else if (isCompleted) {
            circleClasses = 'bg-brand-500 border-brand-500 text-white'
            content       = <Check className="h-3.5 w-3.5" />
          } else {
            // future
            circleClasses = 'bg-white border-gray-300 text-gray-400'
            content       = <span className="text-xs">{idx + 1}</span>
          }

          // Connector line after this step (not on last)
          if (idx < CANDIDATE_STAGES.length - 1) {
            if (isHired && idx < hiredIdx) {
              lineClasses = 'bg-green-400'
            } else if (isCompleted || (isCurrent && !isNegative && !isHired)) {
              lineClasses = idx < currentIdx ? 'bg-brand-500' : 'bg-gray-200'
            } else {
              lineClasses = 'bg-gray-200'
            }
          }

          return (
            <div key={s} className="flex items-start">
              {/* Step */}
              <div className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all ${circleClasses}`}
                >
                  {content}
                </div>
                <span
                  className={`mt-2 text-center text-[10px] leading-tight font-medium max-w-[52px] ${
                    isCurrent && !isNegative
                      ? 'text-brand-600'
                      : isCurrent && isNegative
                      ? 'text-red-600'
                      : isCompleted || greenFill
                      ? 'text-gray-600'
                      : isFuture
                      ? 'text-gray-400'
                      : 'text-gray-500'
                  }`}
                >
                  {SHORT_LABELS[s]}
                </span>
              </div>

              {/* Connector line */}
              {idx < CANDIDATE_STAGES.length - 1 && (
                <div className="flex items-center mt-4 mx-1">
                  <div className={`h-0.5 w-8 sm:w-10 ${lineClasses}`} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
