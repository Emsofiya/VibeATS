'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Upload, Loader2, FileText, AlertCircle } from 'lucide-react'

export default function JobForm() {
  const router    = useRouter()
  const fileRef   = useRef<HTMLInputElement>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [jdFile, setJdFile]         = useState<File | null>(null)
  const [ndpa, setNdpa]             = useState(false)
  const [form, setForm] = useState({
    title:       '',
    client_name: '',
    status:      'Active',
  })

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function extractTextFromFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'pdf') {
      const { default: pdfjsLib } = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      const ab  = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise
      let text  = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }
      return text
    }

    if (ext === 'docx' || ext === 'doc') {
      const mammoth = (await import('mammoth')).default
      const ab      = await file.arrayBuffer()
      const result  = await mammoth.extractRawText({ arrayBuffer: ab })
      return result.value
    }

    return ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!ndpa) {
      setError('You must confirm NDPA consent before activating this job.')
      return
    }
    if (!form.title.trim() || !form.client_name.trim()) {
      setError('Title and client name are required.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Session expired. Please log in again.'); setLoading(false); return }

    let jd_file_url: string | null = null
    let jd_text: string | null     = null

    // Upload JD file if provided
    if (jdFile) {
      const path = `${user.id}/${Date.now()}-${jdFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('jd-files')
        .upload(path, jdFile)

      if (uploadError) {
        setError(`File upload failed: ${uploadError.message}`)
        setLoading(false)
        return
      }

      const { data: urlData } = supabase.storage.from('jd-files').getPublicUrl(path)
      jd_file_url = urlData.publicUrl
      jd_text = await extractTextFromFile(jdFile)
    }

    const { data: job, error: insertError } = await supabase
      .from('jobs')
      .insert({
        title:        form.title.trim(),
        client_name:  form.client_name.trim(),
        status:       form.status,
        ndpa_consent: ndpa,
        jd_file_url,
        jd_text,
        created_by:   user.id,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Log the creation
    await supabase.from('audit_logs').insert({
      action:       'job_created',
      entity_type:  'job',
      entity_id:    job.id,
      job_id:       job.id,
      performed_by: user.id,
      metadata:     { title: job.title, client: job.client_name },
    })

    router.push(`/jobs/${job.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {/* Job title */}
      <div>
        <label className="label">Job Title *</label>
        <input
          className="input"
          placeholder="e.g. Senior Marketing Manager"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          required
        />
      </div>

      {/* Client name */}
      <div>
        <label className="label">Client Name *</label>
        <input
          className="input"
          placeholder="e.g. Acme Corp"
          value={form.client_name}
          onChange={(e) => set('client_name', e.target.value)}
          required
        />
      </div>

      {/* Status */}
      <div>
        <label className="label">Status</label>
        <select
          className="input"
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {/* JD file upload */}
      <div>
        <label className="label">Job Description (PDF or Word)</label>
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center hover:border-brand-400 hover:bg-brand-50 transition-colors"
        >
          {jdFile ? (
            <>
              <FileText className="h-8 w-8 text-brand-500 mb-2" />
              <p className="text-sm font-medium text-gray-800">{jdFile.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(jdFile.size / 1024).toFixed(0)} KB — click to replace
              </p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-600">Click to upload JD</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF or Word (.docx)</p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* NDPA consent checkbox */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ndpa}
            onChange={(e) => setNdpa(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-amber-900">
            <strong>NDPA Consent:</strong> I confirm that the agency has a lawful basis under the Nigeria
            Data Protection Act to process candidate personal data for this role, and that candidates
            will be informed their CV may be assessed using automated tools.
          </span>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Creating…' : 'Create Job'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
