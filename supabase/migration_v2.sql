-- ============================================================
-- VibeATS — Migration v2
-- Run this entire file in Supabase → SQL Editor → New Query
-- Safe to run on an existing database — uses IF NOT EXISTS
-- and preserves all existing data.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. UPDATE candidates TABLE
-- ─────────────────────────────────────────────────────────────

-- Add stage column (pipeline position)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'CV Review'
    CHECK (stage IN (
      'CV Review','Interview','Technical Assessment','Culture Assessment',
      'Background & Reference Check','Offer','Hired','Onboarding'
    ));

-- Add outcome column (what happened at this stage)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'Pending'
    CHECK (outcome IN (
      'Pending','Second Review','Potential Fit','Progressed',
      'Dropped','Voluntary Exit','Role Filled Internally',
      'Role Closed','Downgraded','On Hold','Hired'
    ));

-- Add start_date for probation tracking
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS start_date date;

-- Migrate existing candidates: map old ai_status/manual_status → new outcome
UPDATE candidates SET
  stage   = 'CV Review',
  outcome = CASE
    WHEN COALESCE(manual_status, ai_status) = 'Second Review' THEN 'Second Review'
    WHEN COALESCE(manual_status, ai_status) = 'Potential Fit'  THEN 'Potential Fit'
    WHEN COALESCE(manual_status, ai_status) = 'Rejected'       THEN 'Dropped'
    ELSE 'Pending'
  END
WHERE outcome = 'Pending';

-- ─────────────────────────────────────────────────────────────
-- 2. UPDATE jobs TABLE — add Filled status
-- ─────────────────────────────────────────────────────────────

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('Active','Filled','Closed','On Hold'));

-- ─────────────────────────────────────────────────────────────
-- 3. CREATE probation_checkins TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS probation_checkins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  day_number    integer NOT NULL,
  label         text NOT NULL,
  due_date      date NOT NULL,
  status        text NOT NULL DEFAULT 'Upcoming'
                  CHECK (status IN ('Upcoming','Due Today','Overdue','Completed')),
  notes         text,
  completed_at  timestamptz,
  completed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE probation_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Active users can read probation checkins"
  ON probation_checkins FOR SELECT USING (is_active_user());

CREATE POLICY IF NOT EXISTS "Active users can insert probation checkins"
  ON probation_checkins FOR INSERT WITH CHECK (is_active_user());

CREATE POLICY IF NOT EXISTS "Active users can update probation checkins"
  ON probation_checkins FOR UPDATE USING (is_active_user());

-- ─────────────────────────────────────────────────────────────
-- 4. CREATE talent_pool TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_pool (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  original_job_id  uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ai_score         integer,
  date_added       timestamptz NOT NULL DEFAULT now(),
  added_by         uuid NOT NULL REFERENCES profiles(id),
  skills_tags      text[] NOT NULL DEFAULT '{}',
  notes            text,
  pool_status      text NOT NULL DEFAULT 'Available'
                     CHECK (pool_status IN ('Available','In Process','Placed')),
  UNIQUE (candidate_id)
);

ALTER TABLE talent_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Active users can read talent pool"
  ON talent_pool FOR SELECT USING (is_active_user());

CREATE POLICY IF NOT EXISTS "Active users can insert talent pool"
  ON talent_pool FOR INSERT WITH CHECK (is_active_user());

CREATE POLICY IF NOT EXISTS "Active users can update talent pool"
  ON talent_pool FOR UPDATE USING (is_active_user());

CREATE POLICY IF NOT EXISTS "Super admin can delete from talent pool"
  ON talent_pool FOR DELETE USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 5. ADD audit event types
-- ─────────────────────────────────────────────────────────────
-- The audit_logs entity_type check already uses 'candidate'/'job' etc.
-- Stage/outcome changes are logged with action = 'stage_changed' or
-- 'outcome_changed' under entity_type = 'candidate' — no schema change needed.

-- ─────────────────────────────────────────────────────────────
-- 6. HELPER: auto-refresh probation checkin statuses
-- ─────────────────────────────────────────────────────────────
-- Call this function daily (e.g. via a Supabase cron or on page load)
-- to keep Due Today / Overdue statuses accurate.
CREATE OR REPLACE FUNCTION refresh_probation_statuses()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE probation_checkins SET status = CASE
    WHEN due_date = CURRENT_DATE THEN 'Due Today'
    WHEN due_date < CURRENT_DATE  THEN 'Overdue'
    ELSE 'Upcoming'
  END
  WHERE status != 'Completed';
END;
$$;
