'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PipelineProgress from '@/components/candidates/PipelineProgress'
import ScoreBreakdown from '@/components/candidates/ScoreBreakdown'
import ProbationTab from '@/components/candidates/ProbationTab'
import AuditLog from '@/components/audit/AuditLog'
import {
  stageColor, outcomeColor, scoreColor,
  formatDate, formatDateTime,
  isTerminalOutcome, nextStage, interpolateTemplate,
} from '@/lib/utils'
import { CANDIDATE_STAGES, CANDIDATE_OUTCOMES } from '@/types'
import type {
  Candidate, CandidateStage, CandidateOutcome,
  AuditLog as AuditLogType, RejectionTemplate, TalentPoolEntry,
} from '@/types'
import {
  ChevronLeft, FileText, ExternalLink, Mail, Loader2, Save,
  Trash2, AlertCircle, X, UserPlus, Check, Star,
} from 'lucide-react'

interface Props { params: { id: string; candidateId: string } }

// ─── Rejection email modal ────────────────────────────────────────────────────
interface RejectModalProps {
  candidate: Candidate
  templates: RejectionTemplate[]
  onClose: () => void
  onSent: () => void
}

function RejectionModal({ candidate, templates, onClose, onSent }: RejectModalProps) {
  const supabase = createClient()
  const job = candidate.jobs

  const buildVars = (t: RejectionTemplate) => ({
    candidate_name: candidate.name,
    job_title:      job?.title ?? '',
    client_name:    job?.client_name ?? '',
    agency_name:    'VibeATS',
  })

  const [selTemplate, setSelTemplate] = useState<RejectionTemplate>(templates[0])
  const [subject, setSubject]         = useState(() =>
    interpolateTemplate(templates[0]?.subject ?? '', buildVars(templates[0])))
  const [body, setBody]               = useState(() =>
    interpolateTemplate(templates[0]?.body ?? '', buildVars(templates[0])))

  function selectTemplate(t: RejectionTemplate) {
    setSelTemplate(t)
    setSubject(interpolateTemplate(t.subject, buildVars(t)))
    setBody(interpolateTemplate(t.body, buildVars(t)))
  }

  async function handleSend() {
    const { data: { user } } = await supabase.auth.getUser()
    const mailto = `mailto:${candidate.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
    await supabase.from('audit_logs').insert({
      action: 'rejection_email', entity_type: 'candidate',
      entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
      performed_by: user?.id ?? null,
      metadata: { template: selTemplate?.name, email: candidate.email },
    })
    onSent()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Send Rejection Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Template selector */}
        {templates.length > 1 && (
          <div>
            <label className="label">Template</label>
            <div className="flex gap-2 flex-wrap">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    selTemplate?.id === t.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">To</label>
          <input className="input" value={candidate.email ?? ''} readOnly />
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Body</label>
          <textarea
            className="input resize-none"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <p className="text-xs text-gray-400">
          Clicking &quot;Open in Mail&quot; opens your default email client with this template pre-filled.
          The action will be logged automatically.
        </p>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSend} className="btn-primary">
            <Mail className="h-4 w-4" />
            Open in Mail
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CandidateDetailPage({ params }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [candidate, setCandidate]         = useState<Candidate | null>(null)
  const [logs, setLogs]                   = useState<AuditLogType[]>([])
  const [templates, setTemplates]         = useState<RejectionTemplate[]>([])
  const [poolEntry, setPoolEntry]         = useState<TalentPoolEntry | null>(null)
  const [loading, setLoading]             = useState(true)

  // ── Editing state ────────────────────────────────────────────────────────────
  const [stage, setStage]                 = useState<CandidateStage>('CV Review')
  const [outcome, setOutcome]             = useState<CandidateOutcome>('Pending')
  const [notes, setNotes]                 = useState('')
  const [startDate, setStartDate]         = useState('')
  const [stageMessage, setStageMessage]   = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [savingNotes, setSavingNotes]     = useState(false)
  const [savingStartDate, setSavingStartDate] = useState(false)

  // ── Modals/actions ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState<'ai_report' | 'probation'>('ai_report')
  const [showReject, setShowReject]       = useState(false)
  const [addingToPool, setAddingToPool]   = useState(false)
  const [inPool, setInPool]               = useState(false)

  // ── Delete confirm dialog ────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  // ── Fetch all data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [
      { data: c },
      { data: l },
      { data: t },
      { data: pool },
    ] = await Promise.all([
      supabase
        .from('candidates')
        .select('*, profiles(full_name, email), jobs(id, title, client_name, status)')
        .eq('id', params.candidateId)
        .single(),
      supabase
        .from('audit_logs')
        .select('*, profiles(email, full_name)')
        .eq('candidate_id', params.candidateId)
        .order('created_at', { ascending: false }),
      supabase
        .from('rejection_templates')
        .select('*')
        .order('template_type'),
      supabase
        .from('talent_pool')
        .select('*')
        .eq('candidate_id', params.candidateId)
        .maybeSingle(),
    ])

    if (c) {
      const cand = c as Candidate
      setCandidate(cand)
      setStage(cand.stage)
      setOutcome(cand.outcome)
      setNotes(cand.notes ?? '')
      setStartDate(cand.start_date ?? '')
    }
    setLogs((l ?? []) as AuditLogType[])
    setTemplates((t ?? []) as RejectionTemplate[])
    if (pool) { setPoolEntry(pool as TalentPoolEntry); setInPool(true) }
    setLoading(false)

    // Log view (fire-and-forget)
    const { data: { user } } = await supabase.auth.getUser()
    if (user && c) {
      supabase.from('audit_logs').insert({
        action: 'candidate_viewed', entity_type: 'candidate',
        entity_id: c.id, job_id: c.job_id, candidate_id: c.id,
        performed_by: user.id,
      })
    }
  }, [params.candidateId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Handle outcome change ────────────────────────────────────────────────────
  function handleOutcomeChange(newOutcome: CandidateOutcome) {
    setOutcome(newOutcome)
    setStageMessage(null)

    if (newOutcome === 'Progressed') {
      const next = nextStage(stage)
      if (next) {
        setStage(next)
        setStageMessage(`Stage will advance to "${next}" on save.`)
      }
    }
  }

  // ── Save stage + outcome ────────────────────────────────────────────────────
  async function saveStageOutcome() {
    if (!candidate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const auditInserts: Promise<unknown>[] = []

    if (stage !== candidate.stage) {
      updates.stage = stage
      auditInserts.push(supabase.from('audit_logs').insert({
        action: 'stage_changed', entity_type: 'candidate',
        entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
        performed_by: user?.id ?? null,
        metadata: { from: candidate.stage, to: stage },
      }))
    }
    if (outcome !== candidate.outcome) {
      updates.outcome = outcome
      auditInserts.push(supabase.from('audit_logs').insert({
        action: 'outcome_changed', entity_type: 'candidate',
        entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
        performed_by: user?.id ?? null,
        metadata: { from: candidate.outcome, to: outcome },
      }))
    }

    // If outcome is Hired and start date provided, save it too
    if (outcome === 'Hired' && startDate) {
      updates.start_date = startDate
    }

    await supabase.from('candidates').update(updates).eq('id', candidate.id)
    await Promise.all(auditInserts)

    setSaving(false)
    setStageMessage(null)
    fetchData()
  }

  // ── Save notes ───────────────────────────────────────────────────────────────
  async function saveNotes() {
    if (!candidate) return
    setSavingNotes(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('candidates').update({
      notes, updated_at: new Date().toISOString(),
    }).eq('id', candidate.id)
    if (notes !== (candidate.notes ?? '')) {
      await supabase.from('audit_logs').insert({
        action: 'notes_updated', entity_type: 'candidate',
        entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
        performed_by: user?.id ?? null,
      })
    }
    setSavingNotes(false)
    fetchData()
  }

  // ── Save start date (from right column) ──────────────────────────────────────
  async function saveStartDate() {
    if (!candidate || !startDate) return
    setSavingStartDate(true)
    await supabase.from('candidates').update({
      start_date: startDate, updated_at: new Date().toISOString(),
    }).eq('id', candidate.id)
    setSavingStartDate(false)
    fetchData()
  }

  // ── Add to talent pool ────────────────────────────────────────────────────────
  async function addToTalentPool() {
    if (!candidate) return
    setAddingToPool(true)
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('talent_pool').insert({
      candidate_id:    candidate.id,
      original_job_id: candidate.job_id,
      ai_score:        candidate.ai_score,
      added_by:        user?.id ?? '',
      skills_tags:     candidate.ai_report?.skills_tags ?? [],
      notes:           null,
      pool_status:     'Available',
    })

    await supabase.from('audit_logs').insert({
      action: 'talent_pool_added', entity_type: 'candidate',
      entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
      performed_by: user?.id ?? null,
      metadata: { name: candidate.name },
    })

    setInPool(true)
    setAddingToPool(false)
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!candidate) return
    setDeleting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      action: 'candidate_deleted', entity_type: 'candidate',
      entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
      performed_by: user?.id ?? null,
      metadata: { name: candidate.name },
    })
    await supabase.from('candidates').delete().eq('id', candidate.id)
    router.push(`/jobs/${params.id}`)
  }

  // ── Loading / not found ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="flex items-center gap-2 py-20 text-center justify-center text-gray-500">
        <AlertCircle className="h-5 w-5" />
        Candidate not found.
      </div>
    )
  }

  const job               = candidate.jobs
  const canAddToPool      = !inPool && (candidate.ai_score ?? 0) >= 60
  const showProbationTab  = candidate.outcome === 'Hired'
  const startDateFromDb   = candidate.start_date

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/jobs/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to {job?.title ?? 'Job'}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {candidate.email && (
                <span className="text-sm text-gray-500">{candidate.email}</span>
              )}
              <span className={`badge ${stageColor(candidate.stage)}`}>{candidate.stage}</span>
              <span className={`badge ${outcomeColor(candidate.outcome)}`}>{candidate.outcome}</span>
              {candidate.ai_score != null && (
                <span className={`text-sm font-semibold ${scoreColor(candidate.ai_score)}`}>
                  {candidate.ai_score}/100
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {candidate.cv_file_url && (
              <a
                href={candidate.cv_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <FileText className="h-4 w-4" />
                View CV
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            )}
            {inPool ? (
              <button disabled className="btn-secondary text-sm opacity-60 cursor-not-allowed">
                <Check className="h-4 w-4 text-green-600" />
                In Talent Pool
              </button>
            ) : canAddToPool ? (
              <button
                onClick={addToTalentPool}
                disabled={addingToPool}
                className="btn-secondary text-sm"
              >
                {addingToPool
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <UserPlus className="h-4 w-4" />
                }
                Add to Talent Pool
              </button>
            ) : null}
            {candidate.email && templates.length > 0 && (
              <button
                onClick={() => setShowReject(true)}
                className="btn-secondary text-sm"
              >
                <Mail className="h-4 w-4" />
                Send Rejection Email
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline progress */}
      <div className="card px-5 py-4">
        <PipelineProgress stage={candidate.stage} outcome={candidate.outcome} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* LEFT — tabs + audit log */}
        <div className="lg:col-span-2 space-y-5">

          {/* Tab bar */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('ai_report')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'ai_report'
                    ? 'border-b-2 border-brand-500 text-brand-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" />
                  AI Report
                </div>
              </button>
              {showProbationTab && (
                <button
                  onClick={() => setActiveTab('probation')}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'probation'
                      ? 'border-b-2 border-brand-500 text-brand-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Probation
                </button>
              )}
            </div>

            <div className="p-6">
              {activeTab === 'ai_report' && (
                candidate.ai_report ? (
                  <ScoreBreakdown report={candidate.ai_report} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-10">
                    No AI report yet. Upload this CV again from the job page to trigger screening.
                  </p>
                )
              )}
              {activeTab === 'probation' && showProbationTab && (
                <ProbationTab
                  candidateId={candidate.id}
                  startDate={startDateFromDb}
                />
              )}
            </div>
          </div>

          {/* Audit log */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Activity Log</h2>
            <AuditLog logs={logs} />
          </div>
        </div>

        {/* RIGHT — Stage/Outcome, Notes, Details, Start Date */}
        <div className="space-y-5">

          {/* Stage & Outcome card */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Stage & Outcome</h2>

            <div>
              <label className="label">Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as CandidateStage)}
                className="input"
              >
                {CANDIDATE_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => handleOutcomeChange(e.target.value as CandidateOutcome)}
                className="input"
              >
                {CANDIDATE_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {stageMessage && (
              <p className="text-xs text-brand-600 bg-brand-50 rounded-lg px-3 py-2">
                {stageMessage}
              </p>
            )}

            {/* Confirmed start date — required when outcome = Hired */}
            {outcome === 'Hired' && (
              <div>
                <label className="label">
                  Confirmed Start Date
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">Required to activate probation tracking.</p>
              </div>
            )}

            <button
              onClick={saveStageOutcome}
              disabled={saving || (outcome === 'Hired' && !startDate)}
              className="btn-primary w-full justify-center"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Notes card */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Internal Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="input resize-none"
              placeholder="Add notes about this candidate…"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="btn-primary w-full justify-center"
            >
              {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingNotes ? 'Saving…' : 'Save Notes'}
            </button>
          </div>

          {/* Details card */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Uploaded by</dt>
                <dd className="text-gray-800 truncate text-right">
                  {candidate.profiles?.email ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">Uploaded at</dt>
                <dd className="text-gray-800 text-right">{formatDateTime(candidate.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 shrink-0">AI Score</dt>
                <dd>
                  {candidate.ai_score != null ? (
                    <span className={`font-semibold ${scoreColor(candidate.ai_score)}`}>
                      {candidate.ai_score}/100
                    </span>
                  ) : (
                    <span className="text-gray-400">Not screened</span>
                  )}
                </dd>
              </div>
              {candidate.start_date && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Start Date</dt>
                  <dd className="text-gray-800">{formatDate(candidate.start_date)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Start Date card — only if Hired */}
          {candidate.outcome === 'Hired' && (
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Start Date</h3>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
              <button
                onClick={saveStartDate}
                disabled={savingStartDate || !startDate}
                className="btn-secondary w-full justify-center text-sm"
              >
                {savingStartDate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingStartDate ? 'Saving…' : 'Update Start Date'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rejection email modal */}
      {showReject && templates.length > 0 && (
        <RejectionModal
          candidate={candidate}
          templates={templates}
          onClose={() => setShowReject(false)}
          onSent={fetchData}
        />
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Delete Candidate</h2>
                <p className="text-sm text-gray-500">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{candidate.name}</strong>?
              All audit logs, CV data, and probation check-ins for this candidate will be removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
