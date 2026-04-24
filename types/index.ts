// ─── Database models ──────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: 'super_admin' | 'user'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Job {
  id: string
  title: string
  client_name: string
  jd_file_url: string | null
  jd_text: string | null
  status: 'Active' | 'Closed' | 'On Hold'
  ndpa_consent: boolean
  created_by: string
  created_at: string
  updated_at: string
  profiles?: Profile
  candidates?: Candidate[]
  _count?: { candidates: number }
}

export interface Candidate {
  id: string
  job_id: string
  name: string
  email: string | null
  cv_file_url: string | null
  cv_text: string | null
  ai_score: number | null
  ai_status: CandidateStatus | null
  ai_report: AIReport | null
  manual_status: CandidateStatus | 'Pending' | null
  notes: string | null
  uploaded_by: string
  created_at: string
  updated_at: string
  profiles?: Profile
  jobs?: Job
}

export type CandidateStatus = 'Second Review' | 'Potential Fit' | 'Rejected'

export interface AIReport {
  candidate_name: string
  candidate_email: string | null
  scores: {
    experience_fit: number       // 0–20
    skills_competencies: number  // 0–25
    jd_context_fit: number       // 0–20
    achievements_impact: number  // 0–25
    values_mindset: number       // 0–10
  }
  total_score: number            // 0–100
  rationale: {
    experience_fit: string
    skills_competencies: string
    jd_context_fit: string
    achievements_impact: string
    values_mindset: string
  }
  red_flags: string[]
  overall_recommendation: string
  candidate_facing_rationale: string
  internal_notes: string
}

export interface AuditLog {
  id: string
  action: string
  entity_type: 'job' | 'candidate' | 'user' | 'template' | 'system'
  entity_id: string | null
  job_id: string | null
  candidate_id: string | null
  performed_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  profiles?: Profile
  jobs?: Pick<Job, 'id' | 'title'>
  candidates?: Pick<Candidate, 'id' | 'name'>
}

export interface RejectionTemplate {
  id: string
  name: string
  template_type: 'weak_cv' | 'role_closed'
  subject: string
  body: string
  created_by: string | null
  updated_at: string
}

// ─── API payloads ────────────────────────────────────────────────────────────

export interface ScreenCVRequest {
  jd_text: string
  cv_text: string
  job_id: string
  candidate_id?: string
}

export interface ScreenCVResponse {
  report: AIReport
  status: CandidateStatus
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

export type StatusFilter = CandidateStatus | 'Pending' | 'All'
