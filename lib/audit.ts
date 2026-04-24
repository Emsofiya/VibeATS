import { createClient } from './supabase/server'

interface LogParams {
  action: string
  entity_type: 'job' | 'candidate' | 'user' | 'template' | 'system'
  entity_id?: string | null
  job_id?: string | null
  candidate_id?: string | null
  metadata?: Record<string, unknown>
}

// Server-side audit logger — call from Route Handlers and Server Actions.
export async function logAction(params: LogParams) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('audit_logs').insert({
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      job_id: params.job_id ?? null,
      candidate_id: params.candidate_id ?? null,
      performed_by: user?.id ?? null,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    // Audit failures must never crash the main operation
    console.error('Audit log failed:', err)
  }
}
