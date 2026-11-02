-- 0009 · Fixes from the 2 Nov 2026 audits: security, the release rule, the education flow, coordinator roles.
-- Safe to run once on top of 0001–0008. Every function keeps its signature except visit_release (one new optional argument).
-- After it runs, the screens switch on per-person feedback by themselves (settings.schema_version = 9).

-- ══ 0. Migration level, read by the screens ═════════════════
insert into settings (key, label, value, status, note) values
('schema_version', 'Database migration level', '{"v":9}', 'decided', 'Written by migration 0009. The screens use it to switch on per-person feedback.')
on conflict (key) do update set value = excluded.value;

-- ══ 1. Coordinators ══════════════════════════════════════════
-- A program coordinator counts as operations everywhere (same rule as has() in lib/session.ts).
create or replace function has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select r = any(roles) or (r = 'operations' and 'program_coordinator' = any(roles)) from people where auth_user_id = auth.uid()), false)
$$;

-- Education coordinators read visits (status only; visit_scores stay closed to them) in their home segment.
create policy visits_read_coordinator on visits for select to authenticated using (
  has_role('education_coordinator') and cohort_segment(cohort_id) = (select home_segment from people where auth_user_id = auth.uid())
);

-- ══ 2. Only people with a record read the shared tables (sign-up alone is no longer enough) ══

drop policy if exists read_all on segments;
create policy read_all on segments for select to authenticated using (me() is not null);
drop policy if exists read_all on people;
create policy read_all on people for select to authenticated using (me() is not null);
drop policy if exists read_all on programs;
create policy read_all on programs for select to authenticated using (me() is not null);
drop policy if exists read_all on cohorts;
create policy read_all on cohorts for select to authenticated using (me() is not null);
drop policy if exists read_all on classrooms;
create policy read_all on classrooms for select to authenticated using (me() is not null);
drop policy if exists read_all on classroom_staff;
create policy read_all on classroom_staff for select to authenticated using (me() is not null);
drop policy if exists read_all on cohort_roles;
create policy read_all on cohort_roles for select to authenticated using (me() is not null);
drop policy if exists read_all on qa_templates;
create policy read_all on qa_templates for select to authenticated using (me() is not null);
drop policy if exists read_all on scoring_templates;
create policy read_all on scoring_templates for select to authenticated using (me() is not null);
drop policy if exists read_all on settings;
create policy read_all on settings for select to authenticated using (me() is not null);
drop policy if exists read_all on jd_items;
create policy read_all on jd_items for select to authenticated using (me() is not null);
drop policy if exists read_all on erp_availability;
create policy read_all on erp_availability for select to authenticated using (me() is not null);
drop policy if exists read_all on sync_runs;
create policy read_all on sync_runs for select to authenticated using (me() is not null);

-- ══ 3. plan_save: check the plan's own person, so an owner edits only plans in their segment ══
create or replace function plan_save(p_plan uuid, p_person uuid, p_kind text, p_due date, p_goals jsonb, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_plan;
begin
  perform _require(case when p_plan is not null then owns_person((select person_id from plans where id = p_plan)) else owns_person(p_person) end, 'Only the segment owner manages plans');
  if v_id is null then
    insert into plans (person_id, kind, due, goals, opened_by) values (p_person, p_kind, p_due, coalesce(p_goals,'[]'), me()) returning id into v_id;
    perform _notify(p_person, case when p_kind = 'coaching' then 'Coaching Plan opened' else 'Formal Improvement Plan opened' end, 'Goals and due date are on your dashboard.', '/me', 'plan:' || v_id);
  else
    update plans set due = coalesce(p_due, due), goals = coalesce(p_goals, goals), status = coalesce(p_status, status), kind = coalesce(p_kind, kind) where id = v_id;
  end if;
  perform _log('plan.save', 'plan', v_id::text, jsonb_build_object('status', p_status, 'goals', p_goals));
  return v_id;
end $$;

-- ══ 4. feedback_edit: never copy private note text into the audit log ══
create or replace function feedback_edit(p_id uuid, p_body text, p_type text, p_severity text) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  select * into f from feedback where id = p_id;
  perform _require(f.author_id = me(), 'Only the author can edit');
  perform _require(f.status = 'private' and f.reviewed_at is null, 'It has already been reviewed');
  update feedback set body = p_body, type = coalesce(p_type, type), severity = coalesce(p_severity, severity), updated_at = now() where id = p_id;
  perform _log('feedback.edit', 'feedback', p_id::text, jsonb_build_object('changed', true, 'length_before', length(f.body)));
end $$;

-- ══ 5. Provisional scores never unlock Tier 1 privileges or drive Tier 4 / CCTP alerts ══
create or replace function master_class_schedule(p_cohort uuid, p_classroom uuid, p_kind text, p_title text, p_instructor uuid, p_when timestamptz, p_assignee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tier int; v_prov boolean; v_id uuid; v_visit uuid;
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal'), 'Only the segment owner or the Education Principal schedules master classes');
  select tier, provisional into v_tier, v_prov from composites where person_id = p_instructor order by period desc limit 1;
  perform _require(p_kind = 'challenge' or v_tier = 1, 'Master class assignments go to Tier 1 instructors only');
  perform _require(p_kind = 'challenge' or not coalesce(v_prov, true), 'Tier 1 must be a final score, not a provisional one');
  v_visit := visit_schedule(null, p_cohort, p_classroom, 'qa', 'education', 'planned', 'instructor', p_instructor,
                            (select id from qa_templates where key = 'edu_masterclass' and status <> 'retired' order by version desc limit 1), p_assignee, p_when);
  insert into master_classes (cohort_id, classroom_id, kind, title, instructor_id, scheduled_for, visit_id, created_by)
  values (p_cohort, p_classroom, p_kind, p_title, p_instructor, p_when, v_visit, me()) returning id into v_id;
  perform _notify(p_instructor, case when p_kind = 'master_class' then 'You are leading a master class' else 'You are running a challenge session' end, p_title, '/me', 'mc:' || v_id);
  perform _log('master_class.schedule', 'cohort', p_cohort::text, jsonb_build_object('title', p_title, 'instructor', p_instructor));
  return v_id;
end $$;
create or replace function _level_suggestions() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_level text;
begin
  for r in
    select p.id, p.full_name, p.cctp_cert, coalesce(p.erp_instructor_level, p.qs_instructor_level) lvl, p.roles,
           (select array_agg(tier order by period desc) from (select tier, period from composites c where c.person_id = p.id and not provisional order by period desc limit 2) x) tiers,
           (select tier from composites c where c.person_id = p.id and not provisional order by period desc limit 1) last_tier,
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

-- ══ 6. Staffing and reminders are scoped ══
create or replace function _can_staff(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_cohort(p_cohort) or (has_role('operations') and oversees_cohort(p_cohort))
$$;
create or replace function remind_person(p_person uuid, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(owns_person(p_person) or ((has_role('operations') or has_role('senior_instructor')) and exists (
    select 1 from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id
    where cs.person_id = p_person and (oversees_cohort(cl.cohort_id) or senior_on_cohort(cl.cohort_id)))), 'You can remind only people in cohorts you oversee');
  perform _require(p_link is null or p_link like '/%', 'Reminders link only to pages inside the system');
  perform _notify(p_person, p_title, p_body, p_link, null);
  perform _log('remind', 'person', p_person::text, jsonb_build_object('title', p_title));
end $$;

-- ══ 7. Educators and leads see a visit's score only once it is released ══
create or replace function erp_writeback(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (can_see_scores(p_person) or has_role('hr')) then null else jsonb_build_object(
    'approval_status', (select approval_status from people where id = p_person),
    'composite', (select jsonb_build_object('total', total, 'tier', tier, 'period', period, 'provisional', provisional) from composites where person_id = p_person order by period desc limit 1),
    'last_qa', (select jsonb_build_object('date', v.submitted_at, 'score', vs.pct) from visit_scores vs join visits v on v.id = vs.visit_id
                where vs.subject_person_id = p_person and v.qa_type = 'education'
                  and (v.release_status = 'released' or owns_person(p_person) or has_role('hr') or has_role('education_principal') or has_role('system_owner'))
                order by v.submitted_at desc limit 1),
    'open_plan', (select jsonb_build_object('kind', kind, 'due', due) from plans where person_id = p_person and status = 'open' order by opened_at desc limit 1),
    'cctp', (select jsonb_build_object('rank', cctp_rank, 'cert', cctp_cert) from people where id = p_person)) end
$$;
create or replace function _compute_one(p_person uuid, p_period text, p_seg text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b record; v_role text; v_tpl scoring_templates; w jsonb; g jsonb; t jsonb := _setting('tiers');
  v_programs text[]; v_products text[];
  qa numeric; qa_n int; ops numeric; ops_n int; r_avg numeric; r_n int; r_score numeric;
  att numeric; grd numeric; ack numeric; jd numeric; ent numeric; acc numeric;
  v_min360 int := coalesce((_setting('review_360_min_reviewers')->>'n')::int, 3);
  comps jsonb; tot numeric; wsum numeric := 0; num numeric := 0; fails text[] := '{}'; v_tier int; v_id uuid; v_prov boolean;
begin
  select * into b from period_bounds(p_period);

  with mine as (
    select cs.role, co.program_id, pr.product from classroom_staff cs
      join classrooms cl on cl.id = cs.classroom_id join cohorts co on co.id = cl.cohort_id join programs pr on pr.id = co.program_id
    where cs.person_id = p_person and co.start_date <= b.d_to and co.end_date >= b.d_from)
  select case when bool_or(role = 'instructor') then 'instructor' else 'ta' end,
         array_agg(distinct program_id::text), array_agg(distinct product)
    into v_role, v_programs, v_products from mine;

  -- Scoring template: program, then product, then segment, then default.
  select * into v_tpl from scoring_templates
  where active and ((scope_type = 'program' and scope_id = any(v_programs)) or (scope_type = 'product' and scope_id = any(v_products))
        or (scope_type = 'segment' and scope_id = p_seg) or scope_type = 'default')
  order by case scope_type when 'program' then 1 when 'product' then 2 when 'segment' then 3 else 4 end, version desc limit 1;
  w := v_tpl.weights; g := v_tpl.gates;

  -- QA observation (education QA) and operations QA, in the quarter
  select avg(vs.pct), count(*) into qa, qa_n from visit_scores vs join visits v on v.id = vs.visit_id
  where vs.subject_person_id = p_person and v.kind = 'qa' and v.qa_type = 'education' and v.release_status = 'released' and v.submitted_at::date between b.d_from and b.d_to;
  select avg(vs.pct), count(*) into ops, ops_n from visit_scores vs join visits v on v.id = vs.visit_id
  where vs.subject_person_id = p_person and v.kind = 'qa' and v.qa_type = 'operations' and v.release_status = 'released' and v.submitted_at::date between b.d_from and b.d_to;

  -- Classroom 360 (aggregate, valid at the minimum number of reviewers)
  select count(distinct r.reviewer_id), avg((select avg(value::numeric) from jsonb_each_text(r.items))) into r_n, r_avg
  from reviews_360 r join cohorts c on c.id = r.cohort_id
  where r.subject_id = p_person and c.end_date between b.d_from and b.d_to;
  r_score := case when r_n >= v_min360 then round(r_avg / 5 * 100, 1) end;

  -- Accountability parts (draft formula: mean of the parts that have data)
  select avg(case when s.attendance_logged_at is not null and s.attendance_logged_at <= s.starts_at + interval '24 hours' then 100 else 0 end) into att
  from app_sessions s join classroom_staff cs on cs.classroom_id = s.classroom_id and cs.person_id = p_person
  where s.starts_at::date between b.d_from and b.d_to and s.starts_at < now() - interval '24 hours'
    and (cs.role = 'instructor' or s.logged_by = p_person);

  select avg(case when sub.graded_at is not null and sub.graded_at <= sub.submitted_at + interval '72 hours' then 100 else 0 end) into grd
  from app_submissions sub join app_tasks tk on tk.id = sub.task_id
    join classroom_staff cs on cs.classroom_id = tk.classroom_id and cs.person_id = p_person
  where sub.submitted_at::date between b.d_from and b.d_to and sub.submitted_at < now() - interval '72 hours'
    and (cs.role = 'instructor' or sub.graded_by = p_person);

  select avg(case when ack_at is not null and ack_at <= released_at + interval '48 hours' then 100 else 0 end) into ack
  from released_feedback where subject_id = p_person and released_at::date between b.d_from and b.d_to and released_at < now() - interval '48 hours';

  select avg(case when jt.done then 100 else 0 end) into jd
  from jd_ticks jt join cohorts co on co.id = jt.cohort_id
  where jt.person_id = p_person and co.start_date <= b.d_to and co.end_date >= b.d_from;

  select avg(score) into ent from accountability_entries where person_id = p_person and created_at::date between b.d_from and b.d_to;

  select avg(x) into acc from unnest(array[att, grd, ack, jd, ent]) x;

  comps := jsonb_build_object(
    'qa',   jsonb_build_object('score', round(qa,1), 'n', qa_n, 'weight', (w->>'qa')::numeric),
    'ops',  jsonb_build_object('score', round(ops,1), 'n', ops_n, 'weight', (w->>'ops')::numeric),
    'r360', jsonb_build_object('score', r_score, 'n', r_n, 'weight', (w->>'r360')::numeric),
    'acc',  jsonb_build_object('score', round(acc,1), 'weight', (w->>'acc')::numeric, 'parts', jsonb_build_object(
              'attendance_24h', round(att,1), 'grading_72h', round(grd,1), 'ack_48h', round(ack,1),
              'jd_checklist', round(jd,1), 'coordinator', round(ent,1))));

  -- Weighted total over the components that have data (missing ones are re-weighted — draft rule)
  if qa is not null then num := num + qa * (w->>'qa')::numeric; wsum := wsum + (w->>'qa')::numeric; end if;
  if ops is not null then num := num + ops * (w->>'ops')::numeric; wsum := wsum + (w->>'ops')::numeric; end if;
  if r_score is not null then num := num + r_score * (w->>'r360')::numeric; wsum := wsum + (w->>'r360')::numeric; end if;
  if acc is not null then num := num + acc * (w->>'acc')::numeric; wsum := wsum + (w->>'acc')::numeric; end if;
  tot := case when wsum > 0 then round(num / wsum, 1) end;

  -- Validity gates (F6): a failed gate marks the score provisional
  if qa_n < coalesce((g->>'min_edu_qa')::int, 1) then fails := fails || 'No education QA visit this quarter'::text; end if;
  if r_n < coalesce((g->>'min_360_reviewers')::int, v_min360) then fails := fails || ('360° has ' || r_n || ' reviewer(s); needs ' || coalesce((g->>'min_360_reviewers')::int, v_min360)); end if;
  if ops_n < coalesce((g->>'min_ops_qa')::int, 0) then fails := fails || 'No operations QA visit this quarter'::text; end if;
  if acc is null then fails := fails || 'No accountability data yet'::text; end if;
  v_prov := coalesce(array_length(fails,1),0) > 0;

  v_tier := case when tot is null then null
                 when tot >= coalesce((t->>'tier1')::numeric, 90) then 1
                 when tot >= coalesce((t->>'tier2')::numeric, 85) then 2
                 when tot >= coalesce((t->>'tier3')::numeric, 75) then 3 else 4 end;

  insert into composites (person_id, period, segment_id, role, template_id, components, total, tier, provisional, gate_failures, computed_at, computed_by)
  values (p_person, p_period, p_seg, v_role, v_tpl.id, comps, tot, v_tier, v_prov, fails, now(), me())
  on conflict (person_id, period) do update set segment_id = excluded.segment_id, role = excluded.role, template_id = excluded.template_id,
    components = excluded.components, total = excluded.total, tier = excluded.tier, provisional = excluded.provisional,
    gate_failures = excluded.gate_failures, computed_at = now(), computed_by = me()
  returning id into v_id;

  -- Mandatory tier actions, only on a final (non-provisional) score
  if not v_prov and v_tier in (3, 4) and not exists (select 1 from plans where person_id = p_person and status = 'open') then
    insert into plans (person_id, kind, composite_id, due, goals, opened_by)
    values (p_person, case when v_tier = 3 then 'coaching' else 'improvement' end, v_id,
            current_date + case when v_tier = 3 then 14 else 30 end,
            jsonb_build_array(jsonb_build_object('goal', 'Agree goals with the segment owner', 'done', false)), me());
    perform _notify(p_person, case when v_tier = 3 then 'Coaching Plan opened' else 'Formal Improvement Plan opened' end,
                    'Your segment owner will meet you to agree the goals.', '/me', 'plan:' || v_id);
  end if;
  return v_id;
end $$;

-- ══ 8. Visit reports: per-person One Thing and action points; no blanks; only staff in the room; on time ══
alter table visit_scores add column if not exists one_thing text;
alter table visit_scores add column if not exists action_points text;

-- Items left blank in sections that were observed.
create or replace function _unscored_items(p_rubric jsonb, p_role text, p_scores jsonb, p_unobserved text[]) returns int
language sql immutable as $$
  select count(*)::int from jsonb_array_elements(p_rubric->p_role->'sections') sec, jsonb_array_elements(sec->'items') it
  where not ((sec->>'key') = any(coalesce(p_unobserved,'{}'))) and (p_scores->>(it->>'key')) is null
$$;
revoke execute on function _unscored_items(jsonb, text, jsonb, text[]) from public, anon, authenticated;

create or replace function visit_submit(p_visit uuid, p_attendance text, p_unobserved text[], p_interventions jsonb,
  p_checklist jsonb, p_scores jsonb, p_action_points text, p_flags text[], p_summary text, p_one_thing text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; t qa_templates; s jsonb; r record; o uuid; v_low boolean := false; v_seg text; v_name text; v_out jsonb := '[]';
begin
  select * into v from visits where id = p_visit;
  perform _require(v.id is not null, 'Visit not found');
  perform _require(v.assignee_id = me(), 'Only the assigned observer can submit this visit');
  perform _require(v.submitted_at is null, 'This visit was already submitted');
  perform _require(v.status <> 'cancelled', 'This visit was cancelled');
  perform _require(v.status = 'accepted', 'Accept the invite before filing the report');
  perform _require(now() >= v.scheduled_for - interval '15 minutes', 'The report opens 15 minutes before the session starts');
  perform _require(p_attendance in ('full','partial'), 'Say whether you attended the full session or part of it');
  perform _require(p_attendance = 'full' or coalesce(array_length(p_unobserved,1),0) > 0, 'For partial attendance, mark the areas you did not observe');
  select * into t from qa_templates where id = v.template_id;
  v_seg := cohort_segment(v.cohort_id);

  if v.kind = 'qa' then
    perform _require(jsonb_array_length(coalesce(p_scores,'[]')) > 0, 'Score at least one subject');
    for s in select * from jsonb_array_elements(p_scores) loop
      perform _require((s->>'subject_role') = any(t.subjects), 'This template does not score ' || (s->>'subject_role'));
      perform _require((s->>'subject_role') = 'class' or exists (select 1 from classroom_staff cs where cs.classroom_id = v.classroom_id
        and cs.person_id = nullif(s->>'subject_person_id','')::uuid and cs.role = (s->>'subject_role')), 'Score only people staffed on this classroom, in their role');
      perform _require(_unscored_items(t.rubric, s->>'subject_role', s->'scores', p_unobserved) = 0, 'Score every item, or mark the whole area as not observed');
      select * into r from _score_subject(t.rubric, s->>'subject_role', s->'scores', p_unobserved);
      insert into visit_scores (visit_id, subject_person_id, subject_role, scores, total, max, pct, one_thing, action_points)
      values (p_visit, nullif(s->>'subject_person_id','')::uuid, s->>'subject_role', s->'scores', r.total, r.max, r.pct,
              nullif(s->>'one_thing',''), nullif(s->>'action_points',''));
      v_out := v_out || jsonb_build_object('subject', s->>'subject_person_id', 'role', s->>'subject_role', 'pct', r.pct);
      if v.qa_type = 'education' and (s->>'subject_role') in ('instructor','ta') and r.pct < 75 then
        v_low := true;
        select full_name into v_name from people where id = nullif(s->>'subject_person_id','')::uuid;
        for o in select _segment_owners(v_seg) loop
          perform _notify(o, 'Red flag: observation under 75', coalesce(v_name,'') || ' scored ' || r.pct || '. They must shadow a Tier 1 instructor before the next cohort.',
            '/visits/' || p_visit, 'low:' || p_visit || ':' || coalesce(s->>'subject_person_id',''));
        end loop;
      end if;
    end loop;
  end if;

  update visits set attendance = p_attendance, unobserved = coalesce(p_unobserved,'{}'), interventions = coalesce(p_interventions,'[]'),
    checklist = p_checklist, action_points = p_action_points,
    flags = coalesce(p_flags,'{}') || case when v_low then array['remediation_shadow_tier1'] else '{}'::text[] end,
    summary = p_summary, one_thing = p_one_thing, submitted_at = now(), status = 'completed', release_status = 'pending'
  where id = p_visit;

  if coalesce(array_length(p_flags,1),0) > 0 then
    for o in select _segment_owners(v_seg) loop
      perform _notify(o, 'Red flag from a visit', array_to_string(p_flags, ', '), '/visits/' || p_visit, 'flag:' || p_visit);
    end loop;
  end if;
  for o in select _segment_owners(v_seg) loop
    perform _notify(o, 'Visit report ready to release', 'Report filed — review and release within 24 hours.', '/feedback/release', 'release:' || p_visit);
  end loop;
  perform _log('visit.submit', 'visit', p_visit::text, jsonb_build_object('attendance', p_attendance, 'scores', v_out, 'interventions', jsonb_array_length(coalesce(p_interventions,'[]'))));
  return v_out;
end $$;

-- visit_release gains p_people: [{person, one_thing, action_points, channel}] so each person gets their own text.
drop function if exists visit_release(uuid, text, text, text, text, text);
create or replace function visit_release(p_visit uuid, p_decision text, p_summary text, p_one_thing text, p_action_points text, p_channel text, p_people jsonb default null) returns int
language plpgsql security definer set search_path = public as $$
declare v visits; p uuid; n int := 0; v_title text;
begin
  select * into v from visits where id = p_visit;
  perform _require(owns_cohort(v.cohort_id), 'Only the segment owner releases feedback');
  perform _require(v.release_status = 'pending', 'This report is not waiting for release');
  if p_decision = 'keep_private' then
    update visits set release_status = 'kept_private' where id = p_visit;
    perform _log('visit.keep_private', 'visit', p_visit::text, null);
    return 0;
  end if;
  perform _require(p_decision in ('approve','edit'), 'Unknown decision');
  perform _require(p_channel in ('email','call_email','face_email'), 'Record how the feedback is delivered');
  v_title := case when v.kind = 'shadowing' then 'Shadowing visit' else initcap(v.qa_type) || ' QA visit' end
             || coalesce(' — week ' || v.week_no, '');
  for p in
    select subject_person_id from visit_scores where visit_id = p_visit and subject_person_id is not null
    union select v.focus_person_id where v.focus_person_id is not null
    union select cs.person_id from classroom_staff cs where cs.classroom_id = v.classroom_id
      and v.kind = 'shadowing' and v.focus_person_id is null
  loop
    insert into released_feedback (subject_id, visit_id, cohort_id, kind, title, body, one_thing, action_points, channel, released_by)
    values (p, p_visit, v.cohort_id, 'visit', v_title,
            coalesce(case when p_decision = 'edit' then p_summary end, v.summary, ''),
            coalesce(nullif((select x->>'one_thing' from jsonb_array_elements(coalesce(p_people,'[]')) x where x->>'person' = p::text limit 1), ''),
                     (select vs.one_thing from visit_scores vs where vs.visit_id = p_visit and vs.subject_person_id = p limit 1),
                     case when p_decision = 'edit' then p_one_thing end, v.one_thing),
            coalesce(nullif((select x->>'action_points' from jsonb_array_elements(coalesce(p_people,'[]')) x where x->>'person' = p::text limit 1), ''),
                     (select vs.action_points from visit_scores vs where vs.visit_id = p_visit and vs.subject_person_id = p limit 1),
                     case when p_decision = 'edit' then p_action_points end, v.action_points),
            coalesce(nullif((select x->>'channel' from jsonb_array_elements(coalesce(p_people,'[]')) x where x->>'person' = p::text limit 1), ''), p_channel), me());
    perform _notify(p, 'New feedback on your dashboard', v_title, '/me', 'rel:' || p_visit || ':' || p);
    n := n + 1;
  end loop;
  update visits set release_status = 'released', released_at = now(),
    summary = case when p_decision = 'edit' then coalesce(p_summary, summary) else summary end where id = p_visit;
  perform _log('visit.release', 'visit', p_visit::text, jsonb_build_object('decision', p_decision, 'channel', p_channel, 'people', n));
  return n;
end $$;

-- ══ 9. Booking: education coordinators book; QAers do not book themselves ══
create or replace function visit_schedule(p_visit uuid, p_cohort uuid, p_classroom uuid, p_kind text, p_qa_type text, p_mode text,
  p_focus text, p_focus_person uuid, p_template uuid, p_assignee uuid, p_when timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_visit; v_seg text := cohort_segment(p_cohort); v_old visits;
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal') or senior_on_cohort(p_cohort)
                   or (has_role('education_coordinator') and v_seg = (select home_segment from people where id = me()))
                   or (has_role('operations') and oversees_cohort(p_cohort) and (p_kind = 'shadowing' or p_qa_type = 'operations')),
                   'You cannot schedule this kind of visit for this cohort');
  perform _require(p_kind in ('shadowing','qa'), 'Unknown visit kind');
  perform _require(p_kind = 'shadowing' or p_qa_type in ('education','operations'), 'Pick education or operations QA');
  perform _require(p_assignee is not null, 'Pick who will do the visit');
  perform _require(not (p_kind = 'qa' and p_qa_type = 'education' and p_assignee = me() and not owns_cohort(p_cohort)),
                   'Ask the coordinator or the segment owner to book a visit you will observe yourself');
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

-- ══ 10. Daily jobs run on a schedule; overdue plans get reminders ══
create or replace function run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; o uuid; n_att int := 0; n_esc int := 0; n_grade int := 0; n_appr int := 0; n_visit int := 0; n_pulse int := 0; n_jd int := 0;
  v_days int := coalesce((_setting('approval_turnaround')->>'working_days')::int, 3);
begin
  -- session_user is 'authenticator' for app calls; the scheduler (pg_cron) connects directly.
  perform _require(session_user <> 'authenticator' or has_role('system_owner') or has_role('operations') or has_role('segment_owner') or has_role('education_principal'),
                   'Not allowed to run the daily jobs');

  -- 1. Daily pull (simulated in this standalone build; Portal v2 sync replaces this)
  insert into sync_runs (source, finished_at, status, records, message) values
    ('erpnext', now(), 'ok', (select count(*) from people where erp_supplier_id is not null), 'Contractor records and contracts read'),
    ('coded_app', now(), 'ok', (select count(*) from app_sessions where starts_at > now() - interval '1 day'), 'Attendance, submissions, roster, chat'),
    ('surveys', now(), 'ok', (select count(*) from survey_results), 'Pulse and final survey results read');

  -- 2. Attendance not logged within 24h → remind instructor; after another 24h → escalate
  for r in select s.id, s.starts_at, s.topic, cl.id classroom_id, cl.cohort_id, cl.name classroom
           from app_sessions s join classrooms cl on cl.id = s.classroom_id join cohorts co on co.id = cl.cohort_id
           where co.status = 'live' and s.attendance_logged_at is null and s.starts_at < now() - interval '24 hours' loop
    for o in select person_id from classroom_staff where classroom_id = r.classroom_id and role = 'instructor' loop
      perform _notify(o, 'Attendance not logged', r.classroom || ' — ' || to_char(r.starts_at at time zone 'Asia/Kuwait', 'Dy DD Mon'), '/me', 'att:' || r.id);
      n_att := n_att + 1;
    end loop;
    if r.starts_at < now() - interval '48 hours' then
      for o in select person_id from cohort_roles where cohort_id = r.cohort_id and role = 'senior_instructor'
               union select id from people where 'education_principal' = any(roles) loop
        perform _notify(o, 'Escalation: attendance still not logged', r.classroom || ' — ' || to_char(r.starts_at at time zone 'Asia/Kuwait', 'Dy DD Mon'),
                        '/cohorts/' || r.cohort_id, 'attesc:' || r.id);
        n_esc := n_esc + 1;
      end loop;
    end if;
  end loop;

  -- 3. Grading over 72h → remind instructor; over 96h → escalate
  for r in select cl.id classroom_id, cl.cohort_id, cl.name classroom, count(*) n, min(s.submitted_at) oldest
           from app_submissions s join app_tasks t on t.id = s.task_id join classrooms cl on cl.id = t.classroom_id join cohorts co on co.id = cl.cohort_id
           where co.status = 'live' and s.status = 'submitted' and s.submitted_at < now() - interval '72 hours'
           group by cl.id, cl.cohort_id, cl.name loop
    for o in select person_id from classroom_staff where classroom_id = r.classroom_id and role = 'instructor' loop
      perform _notify(o, 'Grading over 72 hours', r.n || ' submission(s) waiting in ' || r.classroom, '/me', 'grd:' || r.classroom_id || ':' || current_date);
      n_grade := n_grade + 1;
    end loop;
    if r.oldest < now() - interval '96 hours' then
      for o in select person_id from cohort_roles where cohort_id = r.cohort_id and role = 'senior_instructor' loop
        perform _notify(o, 'Escalation: grading backlog', r.n || ' submission(s) in ' || r.classroom, '/cohorts/' || r.cohort_id, 'grdesc:' || r.classroom_id || ':' || current_date);
        n_esc := n_esc + 1;
      end loop;
    end if;
  end loop;

  -- 4. Approvals waiting longer than the turnaround → reminder to the approver
  for r in select cv.id, ci.title, ci.id content_id, cv.submitted_at from content_versions cv join content_items ci on ci.id = cv.content_id
           where cv.decision = 'pending' and working_days_between(cv.submitted_at, now()) >= v_days loop
    for o in select _people_with_role(coalesce(_setting('content_approver_role')->>'role','education_principal')) loop
      perform _notify(o, 'Reminder: content approval overdue', r.title, '/approvals/content/' || r.content_id, 'contrem:' || r.id || ':' || current_date);
      n_appr := n_appr + 1;
    end loop;
  end loop;
  for r in select st.id, st.step, pl.id pipeline_id, pl.segment_id, p.full_name from pipeline_steps st
             join pipelines pl on pl.id = st.pipeline_id join people p on p.id = pl.person_id
           where pl.status = 'in_pipeline' and st.status = 'pending' and st.opened_at is not null
             and working_days_between(st.opened_at, now()) >= v_days loop
    for o in select id from people where
      (r.step in ('selection_rate','cleared') and 'segment_owner' = any(roles) and r.segment_id = any(owned_segments))
      or (r.step = 'contract' and 'hr' = any(roles))
      or (r.step in ('criteria','vetting','onboarding','mock1','mock2') and 'senior_instructor' = any(roles)) loop
      perform _notify(o, 'Reminder: approval step overdue', r.full_name || ' — ' || replace(r.step, '_', ' '), '/approvals/people/' || r.pipeline_id, 'piprem:' || r.id || ':' || current_date);
      n_appr := n_appr + 1;
    end loop;
  end loop;

  -- 5. Visit reminders: tomorrow's visits
  for r in select id, assignee_id, scheduled_for, kind, qa_type from visits
           where status in ('invited','accepted') and assignee_id is not null
             and scheduled_for between now() and now() + interval '36 hours' loop
    perform _notify(r.assignee_id, 'Reminder: visit tomorrow',
      case when r.kind = 'shadowing' then 'Shadowing' else initcap(r.qa_type) || ' QA' end || ' — ' || to_char(r.scheduled_for at time zone 'Asia/Kuwait', 'Dy DD Mon HH24:MI'),
      '/visits/' || r.id, 'vrem:' || r.id);
    n_visit := n_visit + 1;
  end loop;

  -- 6. Pulse triggers → the segment owner meets the instructor before the next class
  for r in select pu.id, pu.instructor_id, cl.cohort_id, p.full_name from app_pulse pu join classrooms cl on cl.id = pu.classroom_id
             join people p on p.id = pu.instructor_id
           where pu.taken_at > now() - interval '14 days' and (pu.too_fast_pct > 30 or pu.instructor_item < 3.5) loop
    for o in select _segment_owners(cohort_segment(r.cohort_id)) loop
      perform _notify(o, 'Pulse trigger: meet the instructor before the next class', r.full_name, '/cohorts/' || r.cohort_id, 'pulse:' || r.id);
      n_pulse := n_pulse + 1;
    end loop;
  end loop;

  -- 7. JD checklist ticks from evidence for live cohorts
  for r in select id from cohorts where status = 'live' loop
    n_jd := n_jd + _jd_autotick(r.id);
  end loop;

  perform _log('jobs.daily', 'system', null, jsonb_build_object('attendance', n_att, 'grading', n_grade, 'escalations', n_esc,
                 'approvals', n_appr, 'visits', n_visit, 'pulse', n_pulse, 'jd', n_jd));
  return jsonb_build_object('attendance_reminders', n_att, 'grading_reminders', n_grade, 'escalations', n_esc,
                            'approval_reminders', n_appr, 'visit_reminders', n_visit, 'pulse_triggers', n_pulse, 'jd_ticks', n_jd);
end $$;
create or replace function run_daily_jobs_ext() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; pl record; o uuid; n_plans int := 0;
begin
  r := run_daily_jobs();
  -- Open plans past their due date: remind the educator and the segment owners, once a day.
  for pl in select p.id, p.person_id, p.kind, p.due, pe.full_name, cohort_segment((select cl.cohort_id from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id where cs.person_id = p.person_id order by cl.cohort_id desc limit 1)) seg
            from plans p join people pe on pe.id = p.person_id where p.status = 'open' and p.due < current_date loop
    perform _notify(pl.person_id, 'Plan review overdue', 'Your ' || case when pl.kind = 'coaching' then 'Coaching' else 'Improvement' end || ' Plan was due ' || to_char(pl.due, 'DD Mon') || '. Ask your segment owner to book the review.', '/me', 'planrem:' || pl.id || ':' || current_date);
    for o in select _segment_owners(pl.seg) loop
      perform _notify(o, 'Plan review overdue: ' || pl.full_name, 'Due ' || to_char(pl.due, 'DD Mon') || '. Review it and record the outcome.', '/people/' || pl.person_id, 'planrem-o:' || pl.id || ':' || current_date);
    end loop;
    n_plans := n_plans + 1;
  end loop;
  r := r || jsonb_build_object('plan_reminders', n_plans);
  return r || jsonb_build_object('level_suggestions', _level_suggestions());
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'qs-daily-jobs';
  perform cron.schedule('qs-daily-jobs', '0 3 * * *', 'select public.run_daily_jobs_ext()');  -- 03:00 UTC = 06:00 Kuwait
exception when others then
  raise notice 'pg_cron is not available (%). Turn it on under Database > Extensions and run this block again.', sqlerrm;
end $$;

-- ══ 11. Privileges (as at the end of 0008) ═════════════════
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions(), _unscored_items(jsonb, text, jsonb, text[]) from authenticated;
