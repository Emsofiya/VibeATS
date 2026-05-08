'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { probationStatusColor, formatDate, formatDateTime, addDays, PROBATION_SCHEDULE } from '@/lib/utils'
import { CalendarDays, CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react'
import type { ProbationCheckin } from '@/types'

interface Props {
  candidateId: string
  startDate: string | null
}

export default function ProbationTab({ candidateId, startDate: initialStartDate }: Props) {
  const supabase = createClient()

  const [startDate, setStartDate]         = useState(initialStartDate)
  const [dateInput, setDateInput]         = useState(initialStartDate ?? '')
  const [savingDate, setSavingDate]       = useState(false)
  const [checkins, setCheckins]           = useState<ProbationCheckin[]>([])
  const [loading, setLoading]             = useState(false)
  const [completingId, setCompletingId]   = useState<string | null>(null)
  const [notesInputs, setNotesInputs]     = useState<Record<string, string>>({})
  const [openNotes, setOpenNotes]         = useState<Set<string>>(new Set())
  const [savingCheckin, setSavingCheckin] = useState<string | null>(null)
  const [error, setError]                 = useState<string | null>(null)

  const fetchCheckins = useCallback(async () => {
    if (!startDate) return
    setLoading(true)
    setError(null)

    const today = new Date().toISOString().split('T')[0]

    const { data, error: fetchError } = await supabase
      .from('probation_checkins')
      .select('*, profiles(email, full_name)')
      .eq('candidate_id', candidateId)
      .order('day_number', { ascending: true })

    if (fetchError) {
      setError('Failed to load check-ins.')
      setLoading(false)
      return
    }

    // Compute live status for each checkin
    const enriched = ((data ?? []) as ProbationCheckin[]).map((c) => {
      if (c.status === 'Completed') return c
      const due = c.due_date
      if (due === today) return { ...c, status: 'Due Today' as const }
      if (due < today)   return { ...c, status: 'Overdue' as const }
      return { ...c, status: 'Upcoming' as const }
    })

    setCheckins(enriched)
    setLoading(false)
  }, [candidateId, startDate])

  useEffect(() => { fetchCheckins() }, [fetchCheckins])

  async function handleSetStartDate() {
    if (!dateInput) return
    setSavingDate(true)
    setError(null)

    // Update candidate start_date
    await supabase.from('candidates').update({ start_date: dateInput }).eq('id', candidateId)

    // Create probation checkins via API
    const res = await fetch('/api/probation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId, start_date: dateInput }),
    })

    if (!res.ok) {
      setError('Failed to create probation schedule.')
      setSavingDate(false)
      return
    }

    setStartDate(dateInput)
    setSavingDate(false)
  }

  function toggleNotesPanel(id: string) {
    setOpenNotes((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!notesInputs[id]) setNotesInputs((prev) => ({ ...prev, [id]: '' }))
  }

  async function markComplete(checkin: ProbationCheckin) {
    setSavingCheckin(checkin.id)
    const notes = notesInputs[checkin.id] ?? ''

    const res = await fetch('/api/probation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkin_id: checkin.id, notes: notes || null }),
    })

    if (!res.ok) {
      setError('Failed to mark check-in as complete.')
      setSavingCheckin(null)
      return
    }

    setSavingCheckin(null)
    setOpenNotes((prev) => { const next = new Set(prev); next.delete(checkin.id); return next })
    fetchCheckins()
  }

  // ── No start date ─────────────────────────────────────────────────────────────
  if (!startDate) {
    return (
      <div className="py-8 text-center space-y-4">
        <CalendarDays className="h-10 w-10 text-gray-300 mx-auto" />
        <div>
          <p className="text-sm font-medium text-gray-700">No start date set</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Set the confirmed start date to activate the 90-day probation tracking schedule.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="input max-w-[180px]"
          />
          <button
            onClick={handleSetStartDate}
            disabled={savingDate || !dateInput}
            className="btn-primary"
          >
            {savingDate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Set Date
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1 justify-center">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </p>
        )}
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </div>
    )
  }

  // ── No checkins yet (schedule not created) ────────────────────────────────────
  if (checkins.length === 0) {
    return (
      <div className="py-8 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-amber-400 mx-auto" />
        <p className="text-sm text-gray-600">
          Start date is set to <strong>{formatDate(startDate)}</strong> but no check-ins found.
        </p>
        <button
          onClick={async () => {
            setSavingDate(true)
            await fetch('/api/probation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidate_id: candidateId, start_date: startDate }),
            })
            setSavingDate(false)
            fetchCheckins()
          }}
          disabled={savingDate}
          className="btn-secondary"
        >
          {savingDate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Generate Schedule
        </button>
      </div>
    )
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="h-4 w-4 text-brand-500" />
        <p className="text-sm text-gray-600">
          Start date: <strong>{formatDate(startDate)}</strong>
          {' · '}
          90-day probation schedule
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2.5 top-3 bottom-3 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {checkins.map((checkin) => {
            const isCompleted = checkin.status === 'Completed'
            const isOpen      = openNotes.has(checkin.id)

            return (
              <div key={checkin.id} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-6 top-3 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    isCompleted
                      ? 'bg-green-500 border-green-500'
                      : checkin.status === 'Overdue'
                      ? 'bg-red-400 border-red-400'
                      : checkin.status === 'Due Today'
                      ? 'bg-amber-400 border-amber-400'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {isCompleted && <CheckCircle2 className="h-3 w-3 text-white" />}
                  {!isCompleted && checkin.status === 'Overdue' && (
                    <Clock className="h-2.5 w-2.5 text-white" />
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{checkin.label}</p>
                        <span className={`badge text-xs ${probationStatusColor(checkin.status)}`}>
                          {checkin.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Due {formatDate(checkin.due_date)} · Day {checkin.day_number}
                      </p>
                    </div>

                    {!isCompleted && (
                      <button
                        onClick={() => toggleNotesPanel(checkin.id)}
                        className="btn-secondary text-xs shrink-0"
                      >
                        {isOpen ? 'Cancel' : 'Mark Complete'}
                      </button>
                    )}
                  </div>

                  {/* Completed details */}
                  {isCompleted && (
                    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                      <p className="text-xs text-gray-500">
                        Completed {checkin.completed_at ? formatDateTime(checkin.completed_at) : ''}
                        {checkin.profiles?.email && (
                          <span className="text-gray-400"> · by {checkin.profiles.email}</span>
                        )}
                      </p>
                      {checkin.notes && (
                        <p className="text-sm text-gray-700 bg-gray-50 rounded p-2 leading-relaxed">
                          {checkin.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Mark complete panel */}
                  {isOpen && !isCompleted && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                      <label className="label">Notes (optional)</label>
                      <textarea
                        rows={3}
                        className="input resize-none"
                        placeholder="Any notes about this check-in…"
                        value={notesInputs[checkin.id] ?? ''}
                        onChange={(e) =>
                          setNotesInputs((prev) => ({ ...prev, [checkin.id]: e.target.value }))
                        }
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toggleNotesPanel(checkin.id)}
                          className="btn-secondary text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => markComplete(checkin)}
                          disabled={savingCheckin === checkin.id}
                          className="btn-primary text-xs"
                        >
                          {savingCheckin === checkin.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Confirm Complete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
