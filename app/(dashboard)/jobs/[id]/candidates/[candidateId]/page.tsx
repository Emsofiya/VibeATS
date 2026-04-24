'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ScoreBreakdown from '@/components/candidates/ScoreBreakdown'
import AuditLog from '@/components/audit/AuditLog'
import { statusColor, scoreColor, formatDateTime, interpolateTemplate } from '@/lib/utils'
import {
  ChevronLeft, FileText, ExternalLink, Mail, Loader2,
  Save, Trash2, AlertCircle, X
} from 'lucide-react'
import type { Candidate, AuditLog as AuditLogType, RejectionTemplate, CandidateStatus } from '@/types'

interface Props { params: { id: string; candidateId: string } }

const STATUS_OPTIONS: Array<CandidateStatus | 'Pending'> = [
  'Second Review', 'Potential Fit', 'Rejected', 'Pending'
]

export default function CandidateDetailPage({ params }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [candidate, setCandidate]     = useState<Candidate | null>(null)
  const [logs, setLogs]               = useState<AuditLogType[]>([])
  const [templates, setTemplates]     = useState<RejectionTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [notes, setNotes]             = useState('')
  const [status, setStatus]           = useState<string>('Pending')
  const [showReject, setShowReject]   = useState(false)
  const [selTemplate, setSelTemplate] = useState<RejectionTemplate | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody]     = useState('')

  const fetchData = useCallback(async () => {
    const [{ data: c }, { data: l }, { data: t }] = await Promise.all([
      supabase.from('candidates')
        .select('*, profiles(full_name, email), jobs(title, client_name, jd_text)')
        .eq('id', params.candidateId)
        .single(),
      supabase.from('audit_logs')
        .select('*, profiles(email, full_name)')
        .eq('candidate_id', params.candidateId)
        .order('created_at', { ascending: false }),
      supabase.from('rejection_templates').select('*').order('template_type'),
    ])

    if (c) {
      setCandidate(c as Candidate)
      setNotes(c.notes ?? '')
      setStatus(c.manual_status ?? c.ai_status ?? 'Pending')
    }
    setLogs((l ?? []) as AuditLogType[])
    setTemplates((t ?? []) as RejectionTemplate[])
    setLoading(false)

    // Log view
    const { data: { user } } = await supabase.auth.getUser()
    if (user && c) {
      await supabase.from('audit_logs').insert({
        action: 'candidate_viewed', entity_type: 'candidate',
        entity_id: c.id, job_id: c.job_id, candidate_id: c.id,
        performed_by: user.id,
      })
    }
  }, [params.candidateId])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveChanges() {
    if (!candidate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const changed: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (notes !== (candidate.notes ?? '')) changed.notes = notes
    if (status !== (candidate.manual_status ?? candidate.ai_status ?? 'Pending')) {
      changed.manual_status = status
    }

    await supabase.from('candidates').update(changed).eq('id', candidate.id)

    if (changed.manual_status) {
      await supabase.from('audit_logs').insert({
        action: 'status_changed', entity_type: 'candidate',
        entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
        performed_by: user?.id,
        metadata: { from: candidate.manual_status ?? candidate.ai_status, to: status },
      })
    }
    if (changed.notes !== undefined) {
      await supabase.from('audit_logs').insert({
        action: 'notes_updated', entity_type: 'candidate',
        entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
        performed_by: user?.id,
      })
    }

    setSaving(false)
    fetchData()
  }

  function openRejectModal(template?: RejectionTemplate) {
    if (!candidate) return
    const t = template ?? templates[0]
    if (!t) return
    setSelTemplate(t)
    const job = (candidate as Candidate & { jobs?: { title: string; client_name: string } }).jobs
    const vars = {
      candidate_name: candidate.name,
      job_title:      job?.title ?? '',
      client_name:    job?.client_name ?? '',
      agency_name:    'VibeATS',
    }
    setEmailSubject(interpolateTemplate(t.subject, vars))
    setEmailBody(interpolateTemplate(t.body, vars))
    setShowReject(true)
  }

  async function sendRejectionEmail() {
    if (!candidate) return
    const { data: { user } } = await supabase.auth.getUser()
    const mailto = `mailto:${candidate.email ?? ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    window.location.href = mailto

    await supabase.from('audit_logs').insert({
      action: 'rejection_email', entity_type: 'candidate',
      entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
      performed_by: user?.id,
      metadata: { template: selTemplate?.name, email: candidate.email },
    })
    setShowReject(false)
    fetchData()
  }

  async function deleteCandidate() {
    if (!candidate) return
    if (!confirm(`Delete ${candidate.name}? This cannot be undone.`)) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      action: 'candidate_deleted', entity_type: 'candidate',
      entity_id: candidate.id, job_id: candidate.job_id, candidate_id: candidate.id,
      performed_by: user?.id, metadata: { name: candidate.name },
    })
    await supabase.from('candidates').delete().eq('id', candidate.id)
    router.push(`/jobs/${params.id}`)
  }

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

  const currentStatus = status as CandidateStatus | 'Pending'
  const job = (candidate as Candidate & { jobs?: { title: string; client_name: string } }).jobs

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

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {candidate.email && <span className="text-sm text-gray-500">{candidate.email}</span>}
              <span className={`badge ${statusColor(currentStatus)}`}>{currentStatus}</span>
              {candidate.ai_score != null && (
                <span className={`text-sm ${scoreColor(candidate.ai_score)}`}>
                  Score: {candidate.ai_score}/100
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {candidate.cv_file_url && (
              <a href={candidate.cv_file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
                <FileText className="h-4 w-4" />
                View CV
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            )}
            {candidate.email && templates.length > 0 && (
              <button onClick={() => openRejectModal()} className="btn-secondary text-sm">
                <Mail className="h-4 w-4" />
                Send Rejection Email
              </button>
            )}
            <button onClick={deleteCandidate} className="btn-danger text-sm">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Report — 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">AI Screening Report</h2>
            {candidate.ai_report ? (
              <ScoreBreakdown report={candidate.ai_report} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                No AI report yet. Upload this CV again from the job page to trigger screening.
              </p>
            )}
          </div>

          {/* Audit log */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Activity Log</h2>
            <AuditLog logs={logs} />
          </div>
        </div>

        {/* Status + Notes — 1/3 */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Status & Notes</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="input resize-none"
                  placeholder="Add notes about this candidate…"
                />
              </div>

              <button onClick={saveChanges} disabled={saving} className="btn-primary w-full justify-center">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Quick meta */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Uploaded by</dt>
                <dd className="text-gray-800 truncate max-w-[120px]">
                  {(candidate as Candidate & { profiles?: { email: string } }).profiles?.email ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Uploaded at</dt>
                <dd className="text-gray-800">{formatDateTime(candidate.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">AI Status</dt>
                <dd>
                  <span className={`badge text-xs ${statusColor(candidate.ai_status)}`}>
                    {candidate.ai_status ?? '—'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Rejection email modal */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Send Rejection Email</h2>
              <button onClick={() => setShowReject(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Template selector */}
            <div>
              <label className="label">Template</label>
              <div className="flex gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openRejectModal(t)}
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

            <div>
              <label className="label">To</label>
              <input
                className="input"
                value={candidate.email ?? ''}
                readOnly
              />
            </div>

            <div>
              <label className="label">Subject</label>
              <input
                className="input"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Body</label>
              <textarea
                className="input resize-none"
                rows={8}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </div>

            <p className="text-xs text-gray-400">
              Clicking &quot;Open in Mail&quot; will open your default email client with this template pre-filled.
              The action will be logged automatically.
            </p>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowReject(false)} className="btn-secondary">Cancel</button>
              <button onClick={sendRejectionEmail} className="btn-primary">
                <Mail className="h-4 w-4" />
                Open in Mail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
