-- CODED Education Quality and Approvals System — core tables
-- Mirrors of ERPNext and the CODED App are prefixed erp_ / app_ and are written only by sync jobs.

create extension if not exists pgcrypto;

-- ── Reference ──────────────────────────────────────────────
create table segments (
  id text primary key,                 -- kids | youth | pro
  name text not null,
  sort int not null default 0
);

create table people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  arabic_name text,
  email text unique,
  phone text,
  roles text[] not null default '{}',
  home_segment text references segments(id),
  owned_segments text[] not null default '{}',
  is_full_timer boolean not null default false,
  -- ERPNext Supplier mirror (read only for this system)
  erp_supplier_id text unique,
  erp_service_category text,
  erp_instructor_level text,
  erp_contractor_status text check (erp_contractor_status in ('Potential','Active','Inactive','Blacklisted','Duplicate')),
  -- Quality-system side (never written into ERPNext except the write-back fields below)
  qs_instructor_level text,           -- filled here when ERPNext is missing it
  approval_status text not null default 'not_started'
    check (approval_status in ('not_started','in_pipeline','cleared','not_approved')),
  cctp_rank text,
  cctp_cert text check (cctp_cert in ('CCT','CCTA')),
  created_at timestamptz not null default now()
);

create table erp_contracts (
  id text primary key,
  person_id uuid not null references people(id),
  segment_id text references segments(id),
  role text not null,
  program_id uuid,
  cohort_id uuid,
  status text not null check (status in ('Draft','Pending Approval','Approved','Active','Completed','Cancelled')),
  start_date date, end_date date,
  rate_type text check (rate_type in ('hourly','daily','fixed')),
  rate numeric,
  signed_at date
);

create table erp_availability (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  from_date date not null, to_date date not null,
  note text
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('erpnext','coded_app','surveys')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok','warning','failed')),
  records int not null default 0,
  message text
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product text,
  segment_id text not null references segments(id),
  program_type text not null check (program_type in ('short','long','bootcamp')),
  duration_weeks int not null default 1,
  sessions_per_week int not null default 5
);

-- ── A. Content approval ───────────────────────────────────
create table content_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  title text not null,
  kind text not null default 'new' check (kind in ('new','update')),
  audience text, outcomes text, deadline date,
  budget jsonb,                        -- {hours, rate, total}
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','approved')),
  creator_id uuid not null references people(id),
  approved_version int, approved_by uuid references people(id), approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(id) on delete cascade,
  version int not null,
  summary text, link text,
  submitted_by uuid references people(id), submitted_at timestamptz not null default now(),
  decision text not null default 'pending' check (decision in ('pending','approved','changes_requested')),
  decided_by uuid references people(id), decided_at timestamptz, comments text,
  unique (content_id, version)
);

-- ── Cohorts and classrooms (C) ────────────────────────────
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  name text not null,
  start_date date not null, end_date date not null,
  status text not null default 'setup' check (status in ('setup','live','closed')),
  content_id uuid references content_items(id),
  content_version int,
  backup_instructor_id uuid references people(id),
  qa_plan jsonb,
  went_live_at timestamptz,
  final_report text, final_report_at timestamptz
);

create table classrooms (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  name text not null,
  room text,
  ready boolean not null default false
);

create table classroom_staff (
  classroom_id uuid not null references classrooms(id) on delete cascade,
  person_id uuid not null references people(id),
  role text not null check (role in ('instructor','ta')),
  is_lead boolean not null default false,
  primary key (classroom_id, person_id)
);

create table cohort_roles (
  cohort_id uuid not null references cohorts(id) on delete cascade,
  person_id uuid not null references people(id),
  role text not null check (role in ('overseer','senior_instructor')),
  primary key (cohort_id, person_id, role)
);

-- ── B. People approvals ───────────────────────────────────
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  target_role text not null check (target_role in ('instructor','ta')),
  segment_id text not null references segments(id),
  program_id uuid references programs(id),
  status text not null default 'in_pipeline' check (status in ('in_pipeline','cleared','not_approved')),
  rate_type text, rate numeric,
  created_by uuid references people(id),
  created_at timestamptz not null default now()
);

create table pipeline_steps (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  step text not null,
  ord int not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  data jsonb not null default '{}',
  notes text,
  done_by uuid references people(id), done_at timestamptz,
  opened_at timestamptz,
  unique (pipeline_id, step)
);

create table mock_results (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  pipeline_id uuid references pipelines(id),
  context text not null check (context in ('mock1','mock2','cctp')),
  scores jsonb not null,
  critical_failures text[] not null default '{}',
  total int not null,
  result text not null check (result in ('CCT','CCTA','not_yet')),
  feedback text,
  assessor_id uuid references people(id),
  created_at timestamptz not null default now()
);

-- ── D/E. Templates and visits ─────────────────────────────
create table qa_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  kind text not null check (kind in ('education_qa','operations_qa','shadowing')),
  focus text,
  subjects text[] not null default '{}',     -- instructor | ta | class
  rubric jsonb not null,
  version int not null default 1,
  status text not null default 'draft_review' check (status in ('draft_review','active','retired')),
  is_special boolean not null default false,  -- master class / challenge
  created_by uuid references people(id),
  created_at timestamptz not null default now(),
  unique (key, version)
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete cascade,
  kind text not null check (kind in ('shadowing','qa')),
  qa_type text check (qa_type in ('education','operations')),
  mode text not null default 'planned' check (mode in ('planned','popup','pulse')),
  focus text not null default 'class',        -- class | instructor | tas | classroom_management | content
  focus_person_id uuid references people(id),
  template_id uuid references qa_templates(id),
  assignee_id uuid references people(id),
  scheduled_for timestamptz,
  week_no int,
  status text not null default 'planned' check (status in ('planned','invited','accepted','completed','cancelled')),
  created_by uuid references people(id),
  created_at timestamptz not null default now(),
  attendance text check (attendance in ('full','partial')),
  unobserved text[] not null default '{}',
  interventions jsonb not null default '[]',
  checklist jsonb,
  action_points text,
  flags text[] not null default '{}',
  summary text,
  one_thing text,
  submitted_at timestamptz,
  release_status text not null default 'none' check (release_status in ('none','pending','released','kept_private')),
  released_at timestamptz,
  constraint qa_has_type check ((kind = 'qa') = (qa_type is not null))
);

create table visit_scores (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  subject_person_id uuid references people(id),
  subject_role text not null check (subject_role in ('instructor','ta','class')),
  scores jsonb not null,
  total numeric not null,
  max numeric not null,
  pct numeric not null
);

-- ── Feedback (FB) ─────────────────────────────────────────
create table feedback (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references people(id),
  cohort_id uuid references cohorts(id),
  classroom_id uuid references classrooms(id),
  visit_id uuid references visits(id),
  author_id uuid not null references people(id),
  type text not null check (type in ('praise','concern','coaching','incident')),
  severity text not null default 'minor' check (severity in ('positive','minor','serious','red_flag')),
  red_flag_reason text,
  body text not null,
  attachment_url text,
  status text not null default 'private' check (status in ('private','released','kept_private','merged')),
  merged_into uuid references feedback(id),
  reviewed_by uuid references people(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What the educator actually receives (a copy, so private wording never leaks)
create table released_feedback (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references people(id),
  feedback_id uuid references feedback(id),
  visit_id uuid references visits(id),
  cohort_id uuid references cohorts(id),
  kind text not null check (kind in ('note','visit')),
  title text not null,
  body text not null,
  one_thing text,
  action_points text,
  channel text check (channel in ('email','call_email','face_email')),
  released_by uuid references people(id),
  released_at timestamptz not null default now(),
  ack_at timestamptz,
  reply text
);

-- ── 360, JD checklist, accountability ─────────────────────
create table reviews_360 (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id),
  classroom_id uuid references classrooms(id),
  reviewer_id uuid not null references people(id),
  subject_id uuid not null references people(id),
  reviewer_role text not null,
  subject_role text not null,
  items jsonb not null,           -- {item_key: 1..5}
  comment text,
  submitted_at timestamptz not null default now(),
  unique (cohort_id, reviewer_id, subject_id),
  check (reviewer_id <> subject_id)
);

create table jd_items (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('instructor','ta','senior_instructor','operations')),
  key text not null,
  label text not null,
  evidence text not null check (evidence in ('app_grading','app_attendance','app_chat','feedback_ack','visit','lead')),
  ord int not null default 0,
  status text not null default 'draft_review',
  unique (role, key)
);

create table jd_ticks (
  person_id uuid not null references people(id),
  cohort_id uuid not null references cohorts(id),
  item_id uuid not null references jd_items(id),
  done boolean not null default false,
  source text not null default 'lead' check (source in ('auto','lead')),
  confirmed_by uuid references people(id),
  confirmed_at timestamptz,
  primary key (person_id, cohort_id, item_id)
);

create table accountability_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  cohort_id uuid references cohorts(id),
  label text not null,
  score numeric not null check (score between 0 and 100),
  entered_by uuid references people(id),
  created_at timestamptz not null default now()
);

-- ── CODED App mirror (read only) ──────────────────────────
create table app_trainees (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  name text not null
);

create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  starts_at timestamptz not null,
  topic text,
  attendance_logged_at timestamptz,
  logged_by uuid references people(id)
);

create table app_attendance (
  session_id uuid not null references app_sessions(id) on delete cascade,
  trainee_id uuid not null references app_trainees(id) on delete cascade,
  present boolean not null,
  primary key (session_id, trainee_id)
);

create table app_tasks (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  week_no int
);

create table app_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references app_tasks(id) on delete cascade,
  trainee_id uuid not null references app_trainees(id) on delete cascade,
  status text not null check (status in ('pending','submitted','completed','needs_changes','missed')),
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid references people(id)
);

create table app_chat_replies (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  asked_at timestamptz not null,
  replied_at timestamptz,
  replied_by uuid references people(id)
);

create table app_pulse (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  instructor_id uuid references people(id),
  taken_at timestamptz not null,
  instructor_item numeric,
  too_fast_pct numeric,
  responses int, enrolled int
);

-- Trainee survey results (stay in the ERP; read for display only)
create table survey_results (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id),
  subject_id uuid not null references people(id),
  survey text not null check (survey in ('pulse','final')),
  area text not null,
  avg numeric not null,
  responses int not null,
  enrolled int not null,
  screened_comments text[] not null default '{}'
);

-- ── F. Scoring ────────────────────────────────────────────
create table scoring_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_type text not null check (scope_type in ('default','segment','product','program')),
  scope_id text,
  weights jsonb not null,     -- {qa, ops, r360, acc}
  gates jsonb not null,       -- {min_edu_qa, min_360_reviewers, min_ops_qa}
  version int not null default 1,
  active boolean not null default true,
  status text not null default 'decided',
  created_by uuid references people(id),
  created_at timestamptz not null default now()
);

create table composites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  period text not null,                 -- e.g. 2026-Q4
  segment_id text references segments(id),
  role text,
  template_id uuid references scoring_templates(id),
  components jsonb not null,
  total numeric,
  tier int,
  provisional boolean not null default false,
  gate_failures text[] not null default '{}',
  computed_at timestamptz not null default now(),
  computed_by uuid references people(id),
  unique (person_id, period)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  kind text not null check (kind in ('coaching','improvement')),
  composite_id uuid references composites(id),
  opened_at timestamptz not null default now(),
  due date not null,
  goals jsonb not null default '[]',
  status text not null default 'open' check (status in ('open','closed')),
  opened_by uuid references people(id)
);

-- ── Platform ──────────────────────────────────────────────
create table notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  title text not null,
  body text,
  link text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (person_id, dedupe_key)
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references people(id),
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  at timestamptz not null default now()
);

create table settings (
  key text primary key,
  label text not null,
  value jsonb not null,
  status text not null default 'decided' check (status in ('from_notion','decided','default','draft_review')),
  note text,
  updated_by uuid references people(id),
  updated_at timestamptz not null default now()
);

create index on classroom_staff (person_id);
create index on visits (cohort_id);
create index on visits (assignee_id);
create index on visit_scores (subject_person_id);
create index on feedback (subject_id);
create index on released_feedback (subject_id);
create index on app_sessions (classroom_id);
create index on app_submissions (task_id);
create index on notifications (person_id, read_at);
