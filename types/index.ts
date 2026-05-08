// ─── Stage & Outcome ─────────────────────────────────────────────────────────

export const CANDIDATE_STAGES = [
  'CV Review',
  'Interview',
  'Technical Assessment',
  'Culture Assessment',
  'Background & Reference Check',
  'Offer',
  'Hired',
  'Onboarding',
] as const

export type CandidateStage = typeof CANDIDATE_STAGES[number]

export const CANDIDATE_OUTCOMES = [
  'Pending',
  'Second Review',
  'Potential Fit',
  'Progressed',
  'Dropped',
  'Voluntary Exit',
  'Role Filled Internally',
  'Role Closed',
  'Downgraded',
  'On Hold',
  'Hired',
] as const

export type CandidateOutcome = typeof CANDIDATE_OUTCOMES[number]

// Outcomes that mean the candidate is no longer active in the pipeline
export const TERMINAL_OUTCOMES: CandidateOutcome[] = [
  'Dropped', 'Voluntary Exit', 'Role Filled Internally', 'Role Closed', 'Hired',
]

export type JobStatus = 'Active' | 'Filled' | 'Closed' | 'On Hold'

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
  status: JobStatus
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
  ai_report: AIReport | null
  stage: CandidateStage
  outcome: CandidateOutcome
  start_date: string | null
  notes: string | null
  uploaded_by: string
  created_at: string
  updated_at: string
  profiles?: Profile
  jobs?: Job
}

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
  skills_tags: string[]          // auto-extracted key skills for talent pool
}

export interface ProbationCheckin {
  id: string
  candidate_id: string
  day_number: number
  label: string
  due_date: string
  status: 'Upcoming' | 'Due Today' | 'Overdue' | 'Completed'
  notes: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  profiles?: Profile
}

export interface TalentPoolEntry {
  id: string
  candidate_id: string
  original_job_id: string | null
  ai_score: number | null
  date_added: string
  added_by: string
  skills_tags: string[]
  notes: string | null
  pool_status: 'Available' | 'In Process' | 'Placed'
  candidates?: Candidate
  jobs?: Pick<Job, 'id' | 'title' | 'client_name'>
  profiles?: Profile
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
  outcome: CandidateOutcome
  stage: CandidateStage
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

export type StatusFilter = CandidateOutcome | 'All'
