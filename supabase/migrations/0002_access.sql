-- Access rules (PRD "System access" table + 25 Oct 2026 sharing decision).
-- Reads go through row-level security. All writes go through the RPC functions in 0003,
-- so table-level insert/update/delete is revoked from client roles.

-- ── Helpers ───────────────────────────────────────────────
create or replace function me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where auth_user_id = auth.uid()
$$;

create or replace function has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select r = any(roles) from people where auth_user_id = auth.uid()), false)
$$;

create or replace function cohort_segment(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.segment_id from cohorts co join programs p on p.id = co.program_id where co.id = c
$$;

create or replace function classroom_cohort(cl uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select cohort_id from classrooms where id = cl
$$;

create or replace function owns_segment(seg text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select 'segment_owner' = any(roles) and seg = any(owned_segments)
                   from people where auth_user_id = auth.uid()), false)
$$;

create or replace function owns_cohort(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_segment(cohort_segment(c))
$$;

-- Segments a person belongs to: home segment plus every segment they have taught in.
create or replace function person_segments(p uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array(
    select home_segment from people where id = p and home_segment is not null
    union
    select pr.segment_id from classroom_staff cs
      join classrooms cl on cl.id = cs.classroom_id
      join cohorts co on co.id = cl.cohort_id
      join programs pr on pr.id = co.program_id
    where cs.person_id = p
  )
$$;

create or replace function owns_person(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people m
    where m.auth_user_id = auth.uid() and 'segment_owner' = any(m.roles)
      and m.owned_segments && person_segments(p)
  )
$$;

create or replace function oversees_cohort(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cohort_roles where cohort_id = c and person_id = me() and role = 'overseer')
$$;

create or replace function senior_on_cohort(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cohort_roles where cohort_id = c and person_id = me() and role = 'senior_instructor')
$$;

-- Senior Instructor sees "assigned educators": people who teach in cohorts they are assigned to.
create or replace function senior_assigned(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cohort_roles cr
      join classrooms cl on cl.cohort_id = cr.cohort_id
      join classroom_staff cs on cs.classroom_id = cl.id
    where cr.person_id = me() and cr.role = 'senior_instructor' and cs.person_id = p
  )
$$;

-- Lead Instructor sees their TAs. A full-timer Lead Instructor also sees the
-- instructors of the cohorts they lead in (decided 25 Oct 2026, scope still open).
create or replace function leads_person(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classroom_staff mine
      join classroom_staff other on other.classroom_id = mine.classroom_id
    where mine.person_id = me() and mine.role = 'instructor'
      and (mine.is_lead or has_role('lead_instructor'))
      and other.person_id = p and other.role = 'ta'
  ) or exists (
    select 1 from people m
      join classroom_staff mine on mine.person_id = m.id and mine.is_lead
      join classrooms c1 on c1.id = mine.classroom_id
      join classrooms c2 on c2.cohort_id = c1.cohort_id
      join classroom_staff other on other.classroom_id = c2.id
    where m.auth_user_id = auth.uid() and m.is_full_timer and other.person_id = p
  )
$$;

-- Who may see a person's composite, tier and score breakdown.
-- Operations is deliberately excluded (never sees educator scores).
create or replace function can_see_scores(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = me()
      or has_role('education_principal') or has_role('hr') or has_role('gm') or has_role('system_owner')
      or owns_person(p)
      or senior_assigned(p)
      or leads_person(p)
$$;

-- Classroom-level operational data (CODED App records, rooms).
create or replace function can_see_classroom(cl uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classroom_staff where classroom_id = cl and person_id = me())
      or oversees_cohort(classroom_cohort(cl))
      or senior_on_cohort(classroom_cohort(cl))
      or owns_cohort(classroom_cohort(cl))
      or has_role('education_principal') or has_role('system_owner')
$$;

-- ── Lock down writes ──────────────────────────────────────
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── Directory-style data: every signed-in user can read ───
create policy read_all on segments          for select to authenticated using (true);
create policy read_all on people            for select to authenticated using (true);
create policy read_all on programs          for select to authenticated using (true);
create policy read_all on cohorts           for select to authenticated using (true);
create policy read_all on classrooms        for select to authenticated using (true);
create policy read_all on classroom_staff   for select to authenticated using (true);
create policy read_all on cohort_roles      for select to authenticated using (true);
create policy read_all on qa_templates      for select to authenticated using (true);
create policy read_all on scoring_templates for select to authenticated using (true);
create policy read_all on settings          for select to authenticated using (true);
create policy read_all on jd_items          for select to authenticated using (true);
create policy read_all on erp_availability  for select to authenticated using (true);
create policy read_all on sync_runs         for select to authenticated using (true);

-- ── Contracts and rates: own, segment owner (own segment), HR ──
create policy contracts on erp_contracts for select to authenticated using (
  person_id = me() or owns_segment(segment_id) or has_role('hr')
);

-- ── Approvals queues ──────────────────────────────────────
create policy content_read on content_items for select to authenticated using (
  creator_id = me()
  or has_role('education_principal') or has_role('senior_instructor') or has_role('operations')
  or has_role('gm') or has_role('system_owner')
  or owns_segment((select segment_id from programs where id = program_id))
);
create policy content_versions_read on content_versions for select to authenticated using (
  exists (select 1 from content_items ci where ci.id = content_id)   -- inherits content_items policy
);

create policy pipelines_read on pipelines for select to authenticated using (
  person_id = me() or owns_segment(segment_id)
  or has_role('education_principal') or has_role('senior_instructor') or has_role('operations')
  or has_role('hr') or has_role('gm') or has_role('system_owner')
);
create policy pipeline_steps_read on pipeline_steps for select to authenticated using (
  exists (select 1 from pipelines pl where pl.id = pipeline_id)
);
create policy mock_results_read on mock_results for select to authenticated using (
  person_id = me() or assessor_id = me() or owns_person(person_id)
  or has_role('education_principal') or has_role('senior_instructor') or has_role('hr')
);

-- ── Visits ────────────────────────────────────────────────
-- Educators never see visits about them in advance (education QA is unannounced).
-- Operations sees visit slots for cohorts it oversees.
create policy visits_read on visits for select to authenticated using (
  assignee_id = me() or created_by = me()
  or has_role('education_principal') or has_role('system_owner')
  or owns_cohort(cohort_id)
  or senior_on_cohort(cohort_id)
  or (has_role('operations') and oversees_cohort(cohort_id))
);

-- Security-definer check so the subject can see released scores without seeing the visit row itself.
create or replace function visit_score_visible(vid uuid, subj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from visits v where v.id = vid and (
      v.assignee_id = me()
      or has_role('education_principal')
      or owns_cohort(v.cohort_id)
      or senior_on_cohort(v.cohort_id)
      or (v.release_status = 'released' and (subj = me() or leads_person(subj)))
      or (v.qa_type = 'operations' and has_role('operations') and oversees_cohort(v.cohort_id))
    )
  )
$$;

create or replace function is_overseen_ops_visit(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits v where v.id = vid and v.qa_type = 'operations' and oversees_cohort(v.cohort_id))
$$;

create policy visit_scores_read on visit_scores for select to authenticated using (
  visit_score_visible(visit_id, subject_person_id)
);

-- ── Feedback: private notes vs what was released ──────────
-- Private notes: the author, the segment owner, the Education Principal. Never HR, never the subject.
create policy feedback_read on feedback for select to authenticated using (
  author_id = me() or has_role('education_principal') or owns_person(subject_id)
);

-- Released feedback: the educator, their lead/senior/owner, Education Principal.
-- Operations sees released operations QA results only.
create policy released_read on released_feedback for select to authenticated using (
  subject_id = me() or leads_person(subject_id) or senior_assigned(subject_id)
  or owns_person(subject_id) or has_role('education_principal')
  or (has_role('operations') and is_overseen_ops_visit(visit_id))
);

-- ── 360: reviewers see only their own reviews; others get aggregates via review_aggregate() ──
create policy reviews_own on reviews_360 for select to authenticated using (reviewer_id = me());

-- ── Scores, plans, checklists, surveys ────────────────────
create policy composites_read on composites for select to authenticated using (can_see_scores(person_id));
create policy plans_read on plans for select to authenticated using (can_see_scores(person_id));
create policy jd_ticks_read on jd_ticks for select to authenticated using (can_see_scores(person_id));
create policy acc_read on accountability_entries for select to authenticated using (can_see_scores(person_id));
create policy surveys_read on survey_results for select to authenticated using (
  subject_id = me() or leads_person(subject_id) or senior_assigned(subject_id)
  or owns_person(subject_id) or has_role('education_principal') or has_role('hr')
);

-- ── CODED App mirror ──────────────────────────────────────
create policy app_read on app_trainees    for select to authenticated using (can_see_classroom(classroom_id));
create policy app_read on app_sessions    for select to authenticated using (can_see_classroom(classroom_id));
create policy app_read on app_tasks       for select to authenticated using (can_see_classroom(classroom_id));
create policy app_read on app_chat_replies for select to authenticated using (can_see_classroom(classroom_id));
create policy app_read on app_attendance  for select to authenticated using (
  exists (select 1 from app_sessions s where s.id = session_id)
);
create policy app_read on app_submissions for select to authenticated using (
  exists (select 1 from app_tasks t where t.id = task_id)
);
-- Pulse results name an instructor: hide from Operations unless it is their classroom staff view.
create policy app_read on app_pulse for select to authenticated using (
  instructor_id = me() or can_see_scores(instructor_id)
  or (can_see_classroom(classroom_id) and not has_role('operations'))
);

-- ── Platform ──────────────────────────────────────────────
create policy own on notifications for select to authenticated using (person_id = me());
create policy audit_read on audit_log for select to authenticated using (
  has_role('system_owner') or has_role('gm') or has_role('education_principal')
);

-- Helper functions are callable by signed-in users only.
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
