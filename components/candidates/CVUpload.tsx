'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Upload, Loader2, FileText, AlertCircle, CheckCircle } from 'lucide-react'

interface Props {
  jobId:   string
  jdText:  string | null
}

type Stage = 'idle' | 'parsing' | 'screening' | 'saving' | 'done' | 'error'

export default function CVUpload({ jobId, jdText }: Props) {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const [files, setFiles]   = useState<File[]>([])
  const [stage, setStage]   = useState<Stage>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError]   = useState('')

  const stageLabel: Record<Stage, string> = {
    idle:      '',
    parsing:   'Parsing document…',
    screening: 'AI screening in progress…',
    saving:    'Saving results…',
    done:      'All done!',
    error:     'An error occurred',
  }

  async function extractText(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
      const { default: pdfjsLib } = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      const ab  = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise
      let text  = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item: { str?: string }) => item.str ?? '').join(' ') + '\n'
      }
      return text.trim()
    }
    if (ext === 'docx' || ext === 'doc') {
      const mammoth = (await import('mammoth')).default
      const ab      = await file.arrayBuffer()
      const result  = await mammoth.extractRawText({ arrayBuffer: ab })
      return result.value.trim()
    }
    return ''
  }

  async function processFile(file: File) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // 1. Upload file to storage
    const path = `${user.id}/${jobId}/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage.from('cv-files').upload(path, file)
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)
    const { data: urlData } = supabase.storage.from('cv-files').getPublicUrl(path)

    // 2. Parse text client-side
    setStage('parsing')
    const cv_text = await extractText(file)
    if (!cv_text) throw new Error('Could not extract text from this file. Is it a scanned image PDF?')

    // 3. Create a placeholder candidate row
    const { data: candidate, error: insertErr } = await supabase
      .from('candidates')
      .insert({
        job_id:      jobId,
        name:        file.name.replace(/\.[^.]+$/, ''),
        cv_file_url: urlData.publicUrl,
        cv_text,
        uploaded_by: user.id,
      })
      .select()
      .single()
    if (insertErr) throw new Error(insertErr.message)

    // Log upload
    await supabase.from('audit_logs').insert({
      action: 'cv_uploaded', entity_type: 'candidate',
      entity_id: candidate.id, job_id: jobId, candidate_id: candidate.id,
      performed_by: user.id, metadata: { file_name: file.name },
    })

    // 4. AI screening
    setStage('screening')
    if (!jdText?.trim()) throw new Error('This job has no job description text. Please edit the job and re-upload the JD.')

    const res  = await fetch('/api/screen-cv', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jd_text: jdText, cv_text, job_id: jobId, candidate_id: candidate.id }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error ?? 'Screening API failed')
    }

    setStage('saving')
    // The API route already persists the report; just wait for response
    await res.json()
  }

  async function handleUpload() {
    if (!files.length) return
    setError('')
    setProgress({ current: 0, total: files.length })

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length })
      setStage('parsing')
      try {
        await processFile(files[i])
      } catch (err) {
        setError(`Error on "${files[i].name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
        setStage('error')
        return
      }
    }

    setStage('done')
    setFiles([])
    setTimeout(() => {
      setStage('idle')
      router.refresh()
    }, 1200)
  }

  const busy = ['parsing', 'screening', 'saving'].includes(stage)

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => !busy && fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          busy
            ? 'pointer-events-none border-gray-200 bg-gray-50'
            : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50'
        }`}
      >
        {files.length > 0 ? (
          <>
            <FileText className="h-8 w-8 text-brand-500 mb-2" />
            <p className="text-sm font-medium text-gray-800">
              {files.length === 1 ? files[0].name : `${files.length} files selected`}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Click to change</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-600">Click to upload CVs</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF or Word — select multiple for batch upload</p>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx"
        multiple
        className="hidden"
        onChange={(e) => {
          setFiles(Array.from(e.target.files ?? []))
          setStage('idle')
          setError('')
        }}
      />

      {/* Progress */}
      {busy && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-50 border border-brand-100 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-800">{stageLabel[stage]}</p>
            {progress.total > 1 && (
              <p className="text-xs text-brand-600 mt-0.5">
                File {progress.current} of {progress.total}
              </p>
            )}
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-4 py-3">
          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">Screening complete — refreshing…</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && !busy && stage !== 'done' && (
        <button onClick={handleUpload} className="btn-primary w-full justify-center">
          Screen {files.length === 1 ? '1 CV' : `${files.length} CVs`} with AI
        </button>
      )}
    </div>
  )
}
