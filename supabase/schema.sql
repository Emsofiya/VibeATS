-- ============================================================
-- VibeATS — Supabase Database Schema
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension (already on by default in Supabase)
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES  (mirrors auth.users, one row per user)
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text,
  role        text not null default 'user'
                check (role in ('super_admin', 'user')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2. JOBS
-- ─────────────────────────────────────────────────────────────
create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  client_name   text not null,
  jd_file_url   text,
  jd_text       text,
  status        text not null default 'Active'
                  check (status in ('Active', 'Closed', 'On Hold')),
  ndpa_consent  boolean not null default false,
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. CANDIDATES
-- ─────────────────────────────────────────────────────────────
create table if not exists candidates (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs(id) on delete cascade,
  name           text not null,
  email          text,
  cv_file_url    text,
  cv_text        text,
  ai_score       integer check (ai_score between 0 and 100),
  ai_status      text check (ai_status in ('Second Review', 'Potential Fit', 'Rejected')),
  ai_report      jsonb,
  manual_status  text default 'Pending'
                   check (manual_status in ('Second Review', 'Potential Fit', 'Rejected', 'Pending')),
  notes          text,
  uploaded_by    uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. AUDIT LOGS  (append-only — no delete/update RLS)
-- ─────────────────────────────────────────────────────────────
create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  action        text not null,
  entity_type   text not null
                  check (entity_type in ('job','candidate','user','template','system')),
  entity_id     uuid,
  job_id        uuid references jobs(id) on delete set null,
  candidate_id  uuid references candidates(id) on delete set null,
  performed_by  uuid references profiles(id) on delete set null,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. REJECTION TEMPLATES
-- ─────────────────────────────────────────────────────────────
create table if not exists rejection_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  template_type  text not null check (template_type in ('weak_cv', 'role_closed')),
  subject        text not null,
  body           text not null,
  created_by     uuid references profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- Seed the two default templates
insert into rejection_templates (name, template_type, subject, body) values
(
  'Weak CV — Standard',
  'weak_cv',
  'Your application for {{job_title}} at {{client_name}}',
  'Dear {{candidate_name}},

Thank you for taking the time to apply for the {{job_title}} position with {{client_name}}.

After careful review of your application, we regret to inform you that we will not be progressing with your candidacy at this stage. The role requires a specific set of skills and experience that more closely aligns with other applicants we are considering.

We appreciate your interest and encourage you to apply for future opportunities that may be a better fit.

Kind regards,
{{agency_name}}'
),
(
  'Strong CV — Role Closed',
  'role_closed',
  'Your application for {{job_title}} at {{client_name}}',
  'Dear {{candidate_name}},

Thank you for applying for the {{job_title}} position with {{client_name}}.

Your profile is impressive and we were pleased to review your application. Unfortunately, this particular role has been filled and we are no longer accepting applications.

We would very much like to keep your details on file for future opportunities that match your experience. Please do not hesitate to reach out directly if you wish to discuss other openings.

Kind regards,
{{agency_name}}'
);

-- ─────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

-- Helper: check if calling user is super_admin
create or replace function is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin' and is_active = true
  );
$$;

-- Helper: check if calling user is active
create or replace function is_active_user()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active = true
  );
$$;

-- PROFILES
alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (id = auth.uid());

create policy "Super admin can read all profiles"
  on profiles for select using (is_super_admin());

create policy "Super admin can update profiles"
  on profiles for update using (is_super_admin());

-- JOBS
alter table jobs enable row level security;

create policy "Active users can read all jobs"
  on jobs for select using (is_active_user());

create policy "Active users can create jobs"
  on jobs for insert with check (is_active_user());

create policy "Creator or super admin can update jobs"
  on jobs for update using (created_by = auth.uid() or is_super_admin());

create policy "Super admin can delete jobs"
  on jobs for delete using (is_super_admin());

-- CANDIDATES
alter table candidates enable row level security;

create policy "Active users can read all candidates"
  on candidates for select using (is_active_user());

create policy "Active users can insert candidates"
  on candidates for insert with check (is_active_user());

create policy "Uploader or super admin can update candidates"
  on candidates for update using (uploaded_by = auth.uid() or is_super_admin());

create policy "Super admin can delete candidates"
  on candidates for delete using (is_super_admin());

-- AUDIT LOGS
alter table audit_logs enable row level security;

create policy "Active users can insert audit logs"
  on audit_logs for insert with check (is_active_user());

create policy "Active users can read audit logs"
  on audit_logs for select using (is_active_user());

-- REJECTION TEMPLATES
alter table rejection_templates enable row level security;

create policy "Active users can read templates"
  on rejection_templates for select using (is_active_user());

create policy "Super admin can manage templates"
  on rejection_templates for all using (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 7. STORAGE BUCKETS
-- Run these separately in Supabase → Storage → Create bucket
-- or via the Supabase dashboard UI.
-- ─────────────────────────────────────────────────────────────
-- Bucket: "jd-files"   (private, for job descriptions)
-- Bucket: "cv-files"   (private, for candidate CVs)
--
-- Storage policies for jd-files:
--   INSERT: authenticated users
--   SELECT: authenticated users
--
-- Storage policies for cv-files:
--   INSERT: authenticated users
--   SELECT: authenticated users
