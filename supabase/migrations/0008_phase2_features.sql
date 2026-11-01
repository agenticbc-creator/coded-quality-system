-- Phase 2/3 features: CCTP, report cards, plan editing, level changes and readiness,
-- QAer onboarding, master classes, staged content review, segment-aware templates, X1 pre-check.

-- ══ H. CCTP ═══════════════════════════════════════════════
create table cctp_enrolments (
  person_id uuid primary key references people(id),
  source text not null check (source in ('alumni','contractor','staff')),
  lessons_completed int not null default 0 check (lessons_completed between 0 and 100),
  status text not null default 'learning' check (status in ('learning','ready','booked','certified','not_yet')),
  enrolled_by uuid references people(id),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cctp_bookings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  scheduled_for timestamptz not null,
  assessor_id uuid references people(id),
  status text not null default 'booked' check (status in ('booked','completed','cancelled')),
  mock_result_id uuid references mock_results(id),
  recording_url text,
  created_at timestamptz not null default now()
);

create or replace function cctp_rank(lessons int) returns text language sql immutable set search_path = public as $$
  select case when lessons >= 100 then 'Path Complete' when lessons >= 93 then 'Lead Trainer' when lessons >= 68 then 'Senior Trainer'
              when lessons >= 34 then 'Trainer' when lessons >= 19 then 'Junior Trainer' else 'Newcomer' end
$$;

create or replace function cctp_enrol(p_person uuid, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(has_role('education_principal') or has_role('senior_instructor'), 'Only Education can enrol CCTP candidates');
  insert into cctp_enrolments (person_id, source, enrolled_by) values (p_person, p_source, me())
  on conflict (person_id) do nothing;
  update people set cctp_rank = coalesce(cctp_rank, 'Newcomer'), roles = case when 'cctp_candidate' = any(roles) or cctp_cert is not null then roles else roles || 'cctp_candidate'::text end where id = p_person;
  perform _notify(p_person, 'Welcome to the CODED Certified Trainer Program', '100 lessons, 6 ranks, one live mock class.', '/cctp', 'cctp:' || p_person);
  perform _log('cctp.enrol', 'person', p_person::text, jsonb_build_object('source', p_source));
end $$;

-- Progress from the Trainer Learning Path hub (entered here until the hub has an API).
create or replace function cctp_progress(p_person uuid, p_lessons int) returns text
language plpgsql security definer set search_path = public as $$
declare v_rank text := cctp_rank(p_lessons); v_old text;
begin
  perform _require(has_role('education_principal') or has_role('senior_instructor') or has_role('system_owner'), 'Only Education can update CCTP progress');
  select cctp_rank into v_old from people where id = p_person;
  update cctp_enrolments set lessons_completed = p_lessons, updated_at = now(),
    status = case when status in ('certified','booked') then status when p_lessons >= 100 then 'ready' else 'learning' end
  where person_id = p_person;
  update people set cctp_rank = v_rank where id = p_person;
  if v_old is distinct from v_rank then
    perform _notify(p_person, 'New CCTP rank: ' || v_rank, case when p_lessons >= 100 then 'You can now book your live mock-class evaluation.' else 'Keep going.' end, '/cctp', 'rank:' || p_person || ':' || v_rank);
  end if;
  perform _log('cctp.progress', 'person', p_person::text, jsonb_build_object('lessons', p_lessons, 'rank', v_rank));
  return v_rank;
end $$;

create or replace function cctp_book(p_when timestamptz, p_person uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_p uuid := coalesce(p_person, me()); e cctp_enrolments; v_id uuid; a uuid;
begin
  perform _require(v_p = me() or has_role('education_principal') or has_role('senior_instructor'), 'You can only book your own mock class');
  select * into e from cctp_enrolments where person_id = v_p;
  perform _require(e.person_id is not null, 'Not enrolled in CCTP');
  perform _require(e.lessons_completed >= 100, 'The mock class can be booked once the path is complete (100 lessons)');
  perform _require(not exists (select 1 from cctp_bookings where person_id = v_p and status = 'booked'), 'A mock class is already booked');
  perform _require(p_when > now(), 'Pick a future date');
  insert into cctp_bookings (person_id, scheduled_for) values (v_p, p_when) returning id into v_id;
  update cctp_enrolments set status = 'booked', updated_at = now() where person_id = v_p;
  for a in select _people_with_role('education_principal') loop
    perform _notify(a, 'CCTP mock class booked', (select full_name from people where id = v_p) || ' · ' || to_char(p_when at time zone 'Asia/Kuwait', 'Dy DD Mon HH24:MI'), '/cctp', 'cctpbook:' || v_id);
  end loop;
  perform _log('cctp.book', 'person', v_p::text, jsonb_build_object('when', p_when));
  return v_id;
end $$;

create or replace function cctp_record(p_booking uuid, p_scores jsonb, p_critical text[], p_feedback text, p_recording text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b cctp_bookings; v_total int; v_result text; v_id uuid;
begin
  perform _require(has_role('education_principal') or has_role('senior_instructor'), 'Only Education can score the mock class');
  select * into b from cctp_bookings where id = p_booking;
  perform _require(b.id is not null and b.status = 'booked', 'This booking is not open');
  perform _require(length(trim(coalesce(p_feedback,''))) > 0, 'Written feedback is required');
  select total, result into v_total, v_result from _score_mock(p_scores, coalesce(p_critical,'{}'));
  insert into mock_results (person_id, context, scores, critical_failures, total, result, feedback, assessor_id)
  values (b.person_id, 'cctp', p_scores, coalesce(p_critical,'{}'), v_total, v_result, p_feedback, me()) returning id into v_id;
  update cctp_bookings set status = 'completed', mock_result_id = v_id, assessor_id = me(), recording_url = nullif(trim(coalesce(p_recording,'')),'') where id = p_booking;
  update cctp_enrolments set status = case when v_result = 'not_yet' then 'not_yet' else 'certified' end, updated_at = now() where person_id = b.person_id;
  if v_result <> 'not_yet' then
    update people set cctp_cert = v_result, cctp_rank = 'Path Complete', roles = array_remove(roles, 'cctp_candidate') where id = b.person_id;
  end if;
  perform _notify(b.person_id, case when v_result = 'not_yet' then 'Mock class result: Not Yet — book a retake' else 'Certified: ' || v_result end,
                  'Score ' || v_total || '/100', '/cctp', 'cctpres:' || v_id);
  perform _log('cctp.result', 'person', b.person_id::text, jsonb_build_object('total', v_total, 'result', v_result));
  return jsonb_build_object('total', v_total, 'result', v_result);
end $$;

-- ══ G4. Report cards ══════════════════════════════════════
create table report_cards (
  person_id uuid not null references people(id),
  period text not null,
  acknowledged_at timestamptz,
  comment text,
  primary key (person_id, period)
);

create or replace function report_card_ack(p_period text, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(exists (select 1 from composites where person_id = me() and period = p_period), 'No report card for this quarter');
  insert into report_cards (person_id, period, acknowledged_at, comment) values (me(), p_period, now(), nullif(trim(coalesce(p_comment,'')),''))
  on conflict (person_id, period) do update set acknowledged_at = now(), comment = excluded.comment;
  perform _log('report_card.ack', 'person', me()::text, jsonb_build_object('period', p_period));
end $$;

-- ══ G5. Plans ═════════════════════════════════════════════
create or replace function plan_save(p_plan uuid, p_person uuid, p_kind text, p_due date, p_goals jsonb, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_plan;
begin
  perform _require(owns_person(coalesce(p_person, (select person_id from plans where id = p_plan))), 'Only the segment owner manages plans');
  if v_id is null then
    insert into plans (person_id, kind, due, goals, opened_by) values (p_person, p_kind, p_due, coalesce(p_goals,'[]'), me()) returning id into v_id;
    perform _notify(p_person, case when p_kind = 'coaching' then 'Coaching Plan opened' else 'Formal Improvement Plan opened' end, 'Goals and due date are on your dashboard.', '/me', 'plan:' || v_id);
  else
    update plans set due = coalesce(p_due, due), goals = coalesce(p_goals, goals), status = coalesce(p_status, status), kind = coalesce(p_kind, kind) where id = v_id;
  end if;
  perform _log('plan.save', 'plan', v_id::text, jsonb_build_object('status', p_status, 'goals', p_goals));
  return v_id;
end $$;

-- ══ B7 / P4. Level changes and readiness ══════════════════
create table level_changes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  kind text not null check (kind in ('promotion','review','readiness')),
  from_level text, to_level text,
  reason text not null,
  status text not null default 'suggested' check (status in ('suggested','approved','rejected')),
  owner_by uuid references people(id), owner_at timestamptz,
  hrgm_by uuid references people(id), hrgm_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index on level_changes (person_id, kind, to_level) where status = 'suggested';

-- System suggestions (B7, P4, H6): run at quarter close and by the daily job.
create or replace function _level_suggestions() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_level text;
begin
  for r in
    select p.id, p.full_name, p.cctp_cert, coalesce(p.erp_instructor_level, p.qs_instructor_level) lvl, p.roles,
           (select array_agg(tier order by period desc) from (select tier, period from composites c where c.person_id = p.id and not provisional order by period desc limit 2) x) tiers,
           (select tier from composites c where c.person_id = p.id order by period desc limit 1) last_tier,
           exists (select 1 from feedback f where f.subject_id = p.id and f.severity = 'red_flag' and f.created_at > now() - interval '90 days') red
    from people p where p.erp_supplier_id is not null
  loop
    -- Promotion: CCT plus Tier 1 for two quarters
    if r.cctp_cert = 'CCT' and r.tiers = array[1,1] and r.lvl in ('Instructor','Lead Instructor') then
      insert into level_changes (person_id, kind, from_level, to_level, reason) values (r.id, 'promotion', r.lvl, 'Senior Instructor', 'CCT certified and Tier 1 for two quarters') on conflict do nothing;
      n := n + 1;
    end if;
    -- Readiness (P4): TA with two Tier 1 quarters and CCT/CCTA → instructor
    if 'ta' = any(r.roles) and r.cctp_cert in ('CCT','CCTA') and coalesce(r.tiers,'{}') @> array[1] then
      insert into level_changes (person_id, kind, from_level, to_level, reason) values (r.id, 'readiness', 'TA', 'Instructor', 'CCTA/CCT and Tier 1 results — ready to move from TA to instructor') on conflict do nothing;
      n := n + 1;
    end if;
    -- Review after a red flag or Tier 4
    if r.red or r.last_tier = 4 then
      insert into level_changes (person_id, kind, from_level, to_level, reason) values (r.id, 'review', r.lvl, r.lvl, case when r.red then 'Red flag in the last 90 days' else 'Tier 4 this quarter' end) on conflict do nothing;
      n := n + 1;
    end if;
    -- H6: certification upkeep
    if r.cctp_cert is not null and r.last_tier in (3,4) then
      perform _notify(x, 'CCTP status at risk: ' || r.full_name, 'Certified trainers keep their status while the composite stays 85 or above.', '/people/' || r.id, 'cctprisk:' || r.id || ':' || current_date)
      from (select id x from people where 'education_principal' = any(roles)) e;
    end if;
  end loop;
  return n;
end $$;

create or replace function level_suggestions_run() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _require(has_role('system_owner') or has_role('segment_owner') or has_role('hr') or has_role('education_principal'), 'Not allowed');
  return _level_suggestions();
end $$;

create or replace function level_change_decide(p_id uuid, p_decision text) returns text
language plpgsql security definer set search_path = public as $$
declare lc level_changes;
begin
  select * into lc from level_changes where id = p_id;
  perform _require(lc.status = 'suggested', 'Already decided');
  perform _require(p_decision in ('approve','reject'), 'Unknown decision');
  if p_decision = 'reject' then
    perform _require(owns_person(lc.person_id) or has_role('hr') or has_role('gm'), 'Not allowed');
    update level_changes set status = 'rejected' where id = p_id;
  elsif owns_person(lc.person_id) then
    update level_changes set owner_by = me(), owner_at = now() where id = p_id;
  elsif has_role('hr') or has_role('gm') then
    update level_changes set hrgm_by = me(), hrgm_at = now() where id = p_id;
  else
    perform _require(false, 'Level changes need the segment owner plus HR or the GM');
  end if;
  select * into lc from level_changes where id = p_id;
  if lc.owner_at is not null and lc.hrgm_at is not null and lc.status = 'suggested' then
    update level_changes set status = 'approved' where id = p_id;
    if lc.kind <> 'review' then
      update people set qs_instructor_level = lc.to_level where id = lc.person_id;   -- quality-system side; ERPNext is updated by HR
    end if;
    perform _notify(x, 'Level change approved — update ERPNext', (select full_name from people where id = lc.person_id) || ': ' || coalesce(lc.from_level,'') || ' → ' || lc.to_level, '/levels', 'lvl:' || p_id)
    from (select id x from people where 'hr' = any(roles)) h;
  end if;
  perform _log('level.' || p_decision, 'person', lc.person_id::text, jsonb_build_object('change', p_id, 'to', lc.to_level));
  select status into lc.status from level_changes where id = p_id;
  return lc.status;
end $$;

-- ══ E7. QAer onboarding ═══════════════════════════════════
create table qaer_onboarding (
  person_id uuid not null references people(id),
  template_key text not null,
  completed_at timestamptz not null default now(),
  primary key (person_id, template_key)
);

create or replace function qaer_onboarding_complete(p_template_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into qaer_onboarding (person_id, template_key) values (me(), p_template_key) on conflict do nothing;
  perform _log('qaer.onboarded', 'person', me()::text, jsonb_build_object('template', p_template_key));
end $$;

-- ══ C5 / D7. Master classes and challenges ════════════════
create table master_classes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id),
  classroom_id uuid references classrooms(id),
  kind text not null check (kind in ('master_class','challenge')),
  title text not null,
  instructor_id uuid not null references people(id),
  scheduled_for timestamptz not null,
  visit_id uuid references visits(id),
  created_by uuid references people(id),
  created_at timestamptz not null default now()
);

create or replace function master_class_schedule(p_cohort uuid, p_classroom uuid, p_kind text, p_title text, p_instructor uuid, p_when timestamptz, p_assignee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tier int; v_prov boolean; v_id uuid; v_visit uuid;
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal'), 'Only the segment owner or the Education Principal schedules master classes');
  select tier, provisional into v_tier, v_prov from composites where person_id = p_instructor order by period desc limit 1;
  perform _require(p_kind = 'challenge' or v_tier = 1, 'Master class assignments go to Tier 1 instructors only');
  v_visit := visit_schedule(null, p_cohort, p_classroom, 'qa', 'education', 'planned', 'instructor', p_instructor,
                            (select id from qa_templates where key = 'edu_masterclass' and status <> 'retired' order by version desc limit 1), p_assignee, p_when);
  insert into master_classes (cohort_id, classroom_id, kind, title, instructor_id, scheduled_for, visit_id, created_by)
  values (p_cohort, p_classroom, p_kind, p_title, p_instructor, p_when, v_visit, me()) returning id into v_id;
  perform _notify(p_instructor, case when p_kind = 'master_class' then 'You are leading a master class' else 'You are running a challenge session' end, p_title, '/me', 'mc:' || v_id);
  perform _log('master_class.schedule', 'cohort', p_cohort::text, jsonb_build_object('title', p_title, 'instructor', p_instructor));
  return v_id;
end $$;

-- ══ A6 / A7. Staged content review ════════════════════════
alter table content_items add column staged boolean not null default false;
alter table content_versions add column precheck jsonb;

create table content_stages (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(id) on delete cascade,
  stage text not null,
  ord int not null,
  approver_role text not null,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  comments text,
  decided_by uuid references people(id), decided_at timestamptz,
  unique (content_id, stage)
);

create or replace function content_enable_stages(p_content uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i content_items;
begin
  select * into i from content_items where id = p_content;
  perform _require(i.creator_id = me() or has_role('education_principal'), 'Only the creator or the Education Principal can turn on staged review');
  update content_items set staged = true where id = p_content;
  insert into content_stages (content_id, stage, ord, approver_role) values
    (p_content, 'outline', 1, 'senior_instructor'), (p_content, 'detailed_outline', 2, 'senior_instructor'),
    (p_content, 'lesson_plan', 3, 'senior_instructor'), (p_content, 'final_briefing', 4, 'education_principal'),
    (p_content, 'alpha', 5, 'senior_instructor'), (p_content, 'beta', 6, 'education_principal')
  on conflict do nothing;
  perform _log('content.stages_on', 'content', p_content::text, null);
end $$;

create or replace function content_stage_decide(p_stage uuid, p_decision text, p_comments text) returns void
language plpgsql security definer set search_path = public as $$
declare s content_stages; i content_items;
begin
  select * into s from content_stages where id = p_stage;
  select * into i from content_items where id = s.content_id;
  perform _require(has_role(s.approver_role) or has_role('education_principal'), 'This stage is approved by the ' || replace(s.approver_role,'_',' '));
  perform _require(i.creator_id <> me(), 'You cannot approve your own content');
  perform _require(not exists (select 1 from content_stages where content_id = s.content_id and ord < s.ord and status <> 'approved'), 'Earlier stages must be approved first');
  perform _require(p_decision in ('approved','changes_requested'), 'Unknown decision');
  perform _require(p_decision = 'approved' or length(trim(coalesce(p_comments,''))) > 0, 'Add comments so the creator knows what to change');
  update content_stages set status = p_decision, comments = p_comments, decided_by = me(), decided_at = now() where id = p_stage;
  perform _notify(i.creator_id, case when p_decision = 'approved' then 'Stage approved: ' else 'Changes requested: ' end || replace(s.stage,'_',' '), i.title, '/approvals/content/' || i.id, null);
  perform _log('content.stage.' || p_decision, 'content', i.id::text, jsonb_build_object('stage', s.stage, 'comments', p_comments));
end $$;

-- Final approval waits for every stage when staged review is on.
create or replace function content_decide(p_version uuid, p_decision text, p_comments text) returns void
language plpgsql security definer set search_path = public as $$
declare v content_versions; v_item content_items; v_approver text := coalesce(_setting('content_approver_role')->>'role','education_principal');
begin
  select * into v from content_versions where id = p_version;
  perform _require(v.id is not null, 'Version not found');
  perform _require(has_role(v_approver), 'Only the content approver can decide');
  perform _require(v.decision = 'pending', 'This version already has a decision');
  perform _require(p_decision in ('approved','changes_requested'), 'Unknown decision');
  perform _require(p_decision = 'approved' or length(trim(coalesce(p_comments,''))) > 0, 'Add comments so the creator knows what to change');
  select * into v_item from content_items where id = v.content_id;
  perform _require(v_item.creator_id <> me(), 'You cannot approve your own content');
  perform _require(p_decision <> 'approved' or not v_item.staged or not exists (select 1 from content_stages where content_id = v_item.id and status <> 'approved'),
                   'Staged review is on: every stage must be approved before the final approval');
  update content_versions set decision = p_decision, decided_by = me(), decided_at = now(), comments = p_comments where id = p_version;
  if p_decision = 'approved' then
    update content_items set status = 'approved', approved_version = v.version, approved_by = me(), approved_at = now() where id = v.content_id;
  else
    update content_items set status = 'changes_requested' where id = v.content_id;
  end if;
  perform _notify(v_item.creator_id, case when p_decision = 'approved' then 'Content approved' else 'Changes requested' end,
    v_item.title || ' — version ' || v.version, '/approvals/content/' || v.content_id, null);
  perform _log('content.' || p_decision, 'content', v.content_id::text, jsonb_build_object('version', v.version, 'comments', p_comments));
end $$;

-- X1: submit with the creator's pre-check (70/30, the Arc, productive struggle)
drop function content_submit(uuid, text, text);
create or replace function content_submit(p_content uuid, p_summary text, p_link text, p_precheck jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_item content_items; v_ver int; v_id uuid; v_approver text := coalesce(_setting('content_approver_role')->>'role','education_principal'); a uuid;
begin
  select * into v_item from content_items where id = p_content;
  perform _require(v_item.id is not null, 'Content not found');
  perform _require(v_item.creator_id = me(), 'Only the creator can submit this content');
  perform _require(v_item.status in ('draft','changes_requested','approved'), 'This content is already waiting for a decision');
  select coalesce(max(version),0) + 1 into v_ver from content_versions where content_id = p_content;
  insert into content_versions (content_id, version, summary, link, submitted_by, precheck)
  values (p_content, v_ver, p_summary, p_link, me(), p_precheck) returning id into v_id;
  update content_items set status = 'submitted' where id = p_content;
  for a in select _people_with_role(v_approver) loop
    perform _notify(a, 'Content waiting for approval', v_item.title || ' — version ' || v_ver, '/approvals/content/' || p_content, 'content:' || v_id);
  end loop;
  perform _log('content.submit', 'content', p_content::text, jsonb_build_object('version', v_ver, 'precheck', p_precheck));
  return v_id;
end $$;

-- ══ P3. Segment-aware templates ═══════════════════════════
alter table qa_templates add column segment_id text references segments(id);
drop function _template_for(text, text);
create or replace function _template_for(p_kind text, p_qa_type text, p_seg text default null) returns uuid
language sql stable security definer set search_path = public as $$
  select id from qa_templates
  where status <> 'retired' and not is_special
    and kind = case when p_kind = 'shadowing' then 'shadowing' when p_qa_type = 'operations' then 'operations_qa' else 'education_qa' end
    and (segment_id is null or segment_id = p_seg)
  order by (segment_id is not distinct from p_seg and p_seg is not null) desc, (focus = 'class') desc, version desc limit 1
$$;

-- Plan generator and scheduler now pick the segment's rubric variant when one exists.
create or replace function qa_plan_generate(p_cohort uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare co cohorts; pr programs; cl record; d jsonb; w int; n int := 0; v_weeks int; v_start timestamptz;
  v_edu int[]; v_ops int[]; v_shadow int[];
begin
  perform _require(owns_cohort(p_cohort) or (has_role('operations') and oversees_cohort(p_cohort)), 'Only the segment owner or the overseer can generate the QA plan');
  select * into co from cohorts where id = p_cohort;
  select * into pr from programs where id = co.program_id;
  d := _setting('qa_plan_defaults')->pr.program_type;
  v_weeks := greatest(1, ceil(((co.end_date - co.start_date) + 1) / 7.0)::int);
  if pr.program_type = 'bootcamp' then
    v_edu := array(select jsonb_array_elements_text(d->'education_weeks')::int);
    v_ops := array(select jsonb_array_elements_text(d->'operations_weeks')::int);
    v_shadow := array(select generate_series(1, v_weeks));
  elsif pr.program_type = 'long' then
    v_edu := array(select generate_series((d->>'education_every')::int, v_weeks, (d->>'education_every')::int));
    if coalesce(array_length(v_edu,1),0) < (d->>'education_min')::int then v_edu := array[greatest(1, v_weeks/2), v_weeks]; end if;
    v_ops := array(select generate_series(least((d->>'operations_every')::int, v_weeks), v_weeks, (d->>'operations_every')::int));
    v_shadow := array(select generate_series(1, v_weeks, (d->>'shadowing_every')::int));
  else
    v_edu := array[1]; v_ops := array[1]; v_shadow := array[1];
  end if;
  delete from visits where cohort_id = p_cohort and mode = 'planned' and status = 'planned' and submitted_at is null;
  for cl in select id from classrooms where cohort_id = p_cohort order by name loop
    foreach w in array v_shadow loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 2)::timestamp + interval '7 hours';
        insert into visits (cohort_id, classroom_id, kind, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'shadowing', 'planned', 'class', _template_for('shadowing', null, pr.segment_id), _rotate_assignee(p_cohort,'shadowing',null), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
    foreach w in array v_edu loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 1)::timestamp + interval '7 hours';
        insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'qa', 'education', 'planned', 'class', _template_for('qa','education', pr.segment_id), _rotate_assignee(p_cohort,'qa','education'), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
    foreach w in array v_ops loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 3)::timestamp + interval '6 hours';
        insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'qa', 'operations', 'planned', 'class', _template_for('qa','operations', pr.segment_id), _rotate_assignee(p_cohort,'qa','operations'), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
  end loop;
  update cohorts set qa_plan = jsonb_build_object('type', pr.program_type, 'weeks', v_weeks, 'education_weeks', to_jsonb(v_edu),
    'operations_weeks', to_jsonb(v_ops), 'shadowing_weeks', to_jsonb(v_shadow), 'generated_at', now()) where id = p_cohort;
  perform _log('qa_plan.generate', 'cohort', p_cohort::text, jsonb_build_object('visits', n));
  return jsonb_build_object('visits', n);
end $$;

-- Kids and Youth rubric variants (age-bracket wording; draft)
insert into qa_templates (key, name, kind, focus, subjects, status, segment_id, rubric)
select 'edu_class_kids', 'Education QA — class visit (Kids 6–13)', 'education_qa', 'class', '{instructor,ta,class}', 'draft_review', 'kids',
  jsonb_set(jsonb_set(rubric, '{class,sections,0,items,0,label}', '"Children are on task; short activities (under 15 minutes each)"'),
            '{instructor,sections,1,items,0,label}', '"Interaction: checks for understanding with every child; play-based hands-on time"')
from qa_templates where key = 'edu_class';
insert into qa_templates (key, name, kind, focus, subjects, status, segment_id, rubric)
select 'edu_class_youth', 'Education QA — class visit (Youth)', 'education_qa', 'class', '{instructor,ta,class}', 'draft_review', 'youth',
  jsonb_set(rubric, '{class,sections,0,items,0,label}', '"Teens on task; peer explanation and project ownership visible"')
from qa_templates where key = 'edu_class';

-- Visit scheduling picks the segment variant when no template is chosen.
create or replace function visit_schedule(p_visit uuid, p_cohort uuid, p_classroom uuid, p_kind text, p_qa_type text, p_mode text,
  p_focus text, p_focus_person uuid, p_template uuid, p_assignee uuid, p_when timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_visit; v_seg text := cohort_segment(p_cohort); v_old visits;
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal') or senior_on_cohort(p_cohort)
                   or (has_role('operations') and oversees_cohort(p_cohort) and (p_kind = 'shadowing' or p_qa_type = 'operations')),
                   'You cannot schedule this kind of visit for this cohort');
  perform _require(p_kind in ('shadowing','qa'), 'Unknown visit kind');
  perform _require(p_kind = 'shadowing' or p_qa_type in ('education','operations'), 'Pick education or operations QA');
  perform _require(p_assignee is not null, 'Pick who will do the visit');
  perform _require(p_kind = 'shadowing' or _can_qa(p_assignee, p_qa_type, v_seg),
                   case when p_qa_type = 'education' then 'Education QA needs a CODED-internal evaluator with an educational background'
                        else 'Operations QA needs an operations QAer' end);
  perform _require(p_when is not null, 'Pick a date and time');
  perform _require(not exists (select 1 from erp_availability where person_id = p_assignee and p_when::date between from_date and to_date),
                   'That person is unavailable on this date (ERPNext availability)');
  if v_id is null then
    insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, focus_person_id, template_id, assignee_id, scheduled_for,
                        week_no, status, created_by)
    values (p_cohort, p_classroom, p_kind, case when p_kind = 'qa' then p_qa_type end, coalesce(p_mode,'planned'), coalesce(p_focus,'class'),
            p_focus_person, coalesce(p_template, _template_for(p_kind, p_qa_type, v_seg)), p_assignee, p_when,
            greatest(1, ((p_when::date - (select start_date from cohorts where id = p_cohort)) / 7) + 1), 'invited', me())
    returning id into v_id;
  else
    select * into v_old from visits where id = v_id;
    perform _require(v_old.submitted_at is null, 'This visit is already completed');
    update visits set classroom_id = p_classroom, kind = p_kind, qa_type = case when p_kind = 'qa' then p_qa_type end,
      mode = coalesce(p_mode, mode), focus = coalesce(p_focus, focus), focus_person_id = p_focus_person,
      template_id = coalesce(p_template, template_id, _template_for(p_kind, p_qa_type, v_seg)), assignee_id = p_assignee,
      scheduled_for = p_when, status = 'invited' where id = v_id;
  end if;
  perform _notify(p_assignee,
    case when p_kind = 'shadowing' then 'Shadowing visit invite' else initcap(p_qa_type) || ' QA visit invite' end,
    to_char(p_when at time zone 'Asia/Kuwait', 'Dy DD Mon, HH24:MI') || ' — reminder will follow', '/visits/' || v_id,
    'invite:' || v_id || ':' || extract(epoch from p_when)::bigint);
  perform _log(case when p_visit is null then 'visit.schedule' else 'visit.reschedule' end, 'visit', v_id::text,
    jsonb_build_object('assignee', p_assignee, 'when', p_when, 'kind', p_kind, 'qa_type', p_qa_type, 'focus', p_focus));
  return v_id;
end $$;

-- ══ ERPNext write-back preview (WB) ═══════════════════════
create or replace function erp_writeback(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (can_see_scores(p_person) or has_role('hr')) then null else jsonb_build_object(
    'approval_status', (select approval_status from people where id = p_person),
    'composite', (select jsonb_build_object('total', total, 'tier', tier, 'period', period, 'provisional', provisional) from composites where person_id = p_person order by period desc limit 1),
    'last_qa', (select jsonb_build_object('date', v.submitted_at, 'score', vs.pct) from visit_scores vs join visits v on v.id = vs.visit_id
                where vs.subject_person_id = p_person and v.qa_type = 'education' order by v.submitted_at desc limit 1),
    'open_plan', (select jsonb_build_object('kind', kind, 'due', due) from plans where person_id = p_person and status = 'open' order by opened_at desc limit 1),
    'cctp', (select jsonb_build_object('rank', cctp_rank, 'cert', cctp_cert) from people where id = p_person)) end
$$;

-- ══ RLS for new tables ════════════════════════════════════
alter table cctp_enrolments enable row level security;
alter table cctp_bookings enable row level security;
alter table report_cards enable row level security;
alter table level_changes enable row level security;
alter table qaer_onboarding enable row level security;
alter table master_classes enable row level security;
alter table content_stages enable row level security;
revoke insert, update, delete, truncate on cctp_enrolments, cctp_bookings, report_cards, level_changes, qaer_onboarding, master_classes, content_stages from anon, authenticated;
revoke all on cctp_enrolments, cctp_bookings, report_cards, level_changes, qaer_onboarding, master_classes, content_stages from anon;
grant select on cctp_enrolments, cctp_bookings, report_cards, level_changes, qaer_onboarding, master_classes, content_stages to authenticated;

create policy cctp_read on cctp_enrolments for select to authenticated using (
  person_id = me() or has_role('education_principal') or has_role('senior_instructor') or has_role('hr') or has_role('gm') or has_role('segment_owner') or has_role('system_owner'));
create policy cctp_read on cctp_bookings for select to authenticated using (
  person_id = me() or assessor_id = me() or has_role('education_principal') or has_role('senior_instructor'));
create policy rc_read on report_cards for select to authenticated using (can_see_scores(person_id));
create policy lc_read on level_changes for select to authenticated using (owns_person(person_id) or has_role('hr') or has_role('gm') or has_role('education_principal') or has_role('system_owner'));
create policy qo_read on qaer_onboarding for select to authenticated using (true);
create policy mc_read on master_classes for select to authenticated using (true);
create policy cs_read on content_stages for select to authenticated using (exists (select 1 from content_items ci where ci.id = content_id));

-- Daily job also refreshes level and readiness suggestions.
create or replace function run_daily_jobs_ext() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := run_daily_jobs();
  return r || jsonb_build_object('level_suggestions', _level_suggestions());
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions() from authenticated;

-- ══ B6. Re-approval warning at the go-live gate ═══════════
create or replace function cohort_readiness(p_cohort uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare co cohorts; b text[] := '{}'; w text[] := '{}'; r record; v_n int; v_seg text := cohort_segment(p_cohort);
begin
  select * into co from cohorts where id = p_cohort;
  if co.content_id is null then b := b || 'No approved content is locked to this cohort'::text;
  elsif not exists (select 1 from content_items where id = co.content_id and approved_version is not null) then b := b || 'The content is not approved'::text; end if;
  select count(*) into v_n from classrooms where cohort_id = p_cohort;
  if v_n = 0 then b := b || 'The cohort has no classrooms'::text; end if;
  for r in select cl.name from classrooms cl where cl.cohort_id = p_cohort
           and not exists (select 1 from classroom_staff cs where cs.classroom_id = cl.id and cs.role = 'instructor') loop
    b := b || (r.name || ' has no instructor');
  end loop;
  for r in select p.full_name from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id join people p on p.id = cs.person_id
           where cl.cohort_id = p_cohort and p.approval_status <> 'cleared' loop
    b := b || (r.full_name || ' is not cleared to teach');
  end loop;
  if not exists (select 1 from cohort_roles where cohort_id = p_cohort and role = 'overseer') then
    b := b || 'No overseer (operations officer or program lead) is named'::text;
  end if;
  if not exists (select 1 from visits where cohort_id = p_cohort and kind = 'qa' and status <> 'cancelled') then
    b := b || 'No QA visits are planned'::text;
  end if;
  if co.backup_instructor_id is null then w := w || 'No backup instructor recorded'::text; end if;
  for r in select name from classrooms where cohort_id = p_cohort and not ready loop
    w := w || (r.name || ' is not confirmed ready by Operations');
  end loop;
  for r in select distinct p.full_name from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id join people p on p.id = cs.person_id
           where cl.cohort_id = p_cohort and p.approval_status = 'cleared'
             and exists (select 1 from pipelines pl where pl.person_id = p.id and pl.status = 'cleared')
             and not exists (select 1 from pipelines pl where pl.person_id = p.id and pl.status = 'cleared' and pl.segment_id = v_seg) loop
    w := w || (r.full_name || ' was approved for a different segment — consider a re-approval (B6)');
  end loop;
  return jsonb_build_object('ok', coalesce(array_length(b,1),0) = 0, 'blockers', to_jsonb(b), 'warnings', to_jsonb(w));
end $$;
