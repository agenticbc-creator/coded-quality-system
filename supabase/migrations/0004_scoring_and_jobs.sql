-- Composite engine (F1–F7), live CODED App signals (W5) and daily jobs (N1, reminders, escalation).

-- ── Composite for one person and one quarter ──────────────
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
  where vs.subject_person_id = p_person and v.kind = 'qa' and v.qa_type = 'education' and v.submitted_at::date between b.d_from and b.d_to;
  select avg(vs.pct), count(*) into ops, ops_n from visit_scores vs join visits v on v.id = vs.visit_id
  where vs.subject_person_id = p_person and v.kind = 'qa' and v.qa_type = 'operations' and v.submitted_at::date between b.d_from and b.d_to;

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

create or replace function composites_compute(p_period text, p_segment text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b record; p uuid; n int := 0; v_started timestamptz := clock_timestamp();
begin
  perform _require(owns_segment(p_segment) or has_role('education_principal') or has_role('system_owner'),
                   'Only the segment owner, the Education Principal or the system owner can compute scores');
  select * into b from period_bounds(p_period);
  for p in
    select distinct cs.person_id from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id
      join cohorts co on co.id = cl.cohort_id join programs pr on pr.id = co.program_id
    where pr.segment_id = p_segment and co.start_date <= b.d_to and co.end_date >= b.d_from
  loop
    perform _compute_one(p, p_period, p_segment);
    n := n + 1;
  end loop;
  perform _log('composites.compute', 'segment', p_segment, jsonb_build_object('period', p_period, 'people', n));
  return jsonb_build_object('people', n, 'ms', round(extract(epoch from clock_timestamp() - v_started) * 1000));
end $$;

-- ── Live CODED App signals for one classroom (W5) ─────────
create or replace function live_signals(p_classroom uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ops_only boolean := has_role('operations') and not (has_role('segment_owner') or has_role('education_principal'))
                        and not exists (select 1 from classroom_staff where classroom_id = p_classroom and person_id = me());
  att_pct numeric; late jsonb; grd_hours numeric; grd_pct numeric; backlog int; backlog_list jsonb;
  comp_this numeric; comp_last numeric; missed_pct numeric; repeat_missers jsonb; trainee_att numeric; absent2 jsonb; pulse jsonb;
begin
  if not can_see_classroom(p_classroom) then return null; end if;

  select round(avg(case when attendance_logged_at is not null and attendance_logged_at <= starts_at + interval '24 hours' then 100 else 0 end), 0)
    into att_pct from app_sessions where classroom_id = p_classroom and starts_at < now() - interval '24 hours';
  select coalesce(jsonb_agg(jsonb_build_object('session', id, 'starts_at', starts_at, 'topic', topic,
           'hours_late', round(extract(epoch from (coalesce(attendance_logged_at, now()) - starts_at)) / 3600)) order by starts_at desc), '[]')
    into late from app_sessions
   where classroom_id = p_classroom and starts_at < now() - interval '24 hours'
     and (attendance_logged_at is null) ;

  select round(avg(extract(epoch from (graded_at - submitted_at)) / 3600), 1),
         round(avg(case when graded_at <= submitted_at + interval '72 hours' then 100 else 0 end), 0)
    into grd_hours, grd_pct
  from app_submissions s join app_tasks t on t.id = s.task_id
  where t.classroom_id = p_classroom and s.graded_at is not null;

  select count(*), coalesce(jsonb_agg(jsonb_build_object('task', t.title, 'trainee', tr.name,
           'hours', round(extract(epoch from (now() - s.submitted_at)) / 3600)) order by s.submitted_at), '[]')
    into backlog, backlog_list
  from app_submissions s join app_tasks t on t.id = s.task_id join app_trainees tr on tr.id = s.trainee_id
  where t.classroom_id = p_classroom and s.status = 'submitted' and s.submitted_at < now() - interval '72 hours';

  if v_ops_only then
    -- Operations sees record gaps only.
    return jsonb_build_object('ops_view', true, 'attendance_on_time', att_pct, 'late_attendance', late,
                              'ungraded_backlog', backlog, 'backlog', backlog_list);
  end if;

  select round(avg(case when s.status = 'completed' then 100 else 0 end), 0) into comp_this
  from app_submissions s join app_tasks t on t.id = s.task_id
  where t.classroom_id = p_classroom and t.due_at between now() - interval '7 days' and now();
  select round(avg(case when s.status = 'completed' then 100 else 0 end), 0) into comp_last
  from app_submissions s join app_tasks t on t.id = s.task_id
  where t.classroom_id = p_classroom and t.due_at between now() - interval '14 days' and now() - interval '7 days';

  select round(avg(case when s.status = 'missed' then 100 else 0 end), 0) into missed_pct
  from app_submissions s join app_tasks t on t.id = s.task_id where t.classroom_id = p_classroom and t.due_at < now();
  select coalesce(jsonb_agg(jsonb_build_object('trainee', name, 'missed', n)), '[]') into repeat_missers from (
    select tr.name, count(*) n from app_submissions s join app_tasks t on t.id = s.task_id join app_trainees tr on tr.id = s.trainee_id
    where t.classroom_id = p_classroom and s.status = 'missed' group by tr.name having count(*) >= 2) x;

  select round(avg(case when a.present then 100 else 0 end), 0) into trainee_att
  from app_attendance a join app_sessions s on s.id = a.session_id where s.classroom_id = p_classroom;
  select coalesce(jsonb_agg(distinct jsonb_build_object('trainee', name)), '[]') into absent2 from (
    select tr.name, a.present, lag(a.present) over (partition by a.trainee_id order by s.starts_at) prev_present,
           row_number() over (partition by a.trainee_id order by s.starts_at desc) rn
    from app_attendance a join app_sessions s on s.id = a.session_id join app_trainees tr on tr.id = a.trainee_id
    where s.classroom_id = p_classroom) x where rn = 1 and not present and prev_present = false;

  select to_jsonb(x) into pulse from (select taken_at, instructor_item, too_fast_pct, responses, enrolled from app_pulse
    where classroom_id = p_classroom order by taken_at desc limit 1) x;

  return jsonb_build_object('ops_view', false,
    'attendance_on_time', att_pct, 'late_attendance', late,
    'grading_hours', grd_hours, 'grading_on_time', grd_pct, 'ungraded_backlog', backlog, 'backlog', backlog_list,
    'completion_this_week', comp_this, 'completion_last_week', comp_last,
    'missed_pct', missed_pct, 'repeat_missers', repeat_missers,
    'trainee_attendance', trainee_att, 'absent_twice', absent2,
    'pulse', pulse,
    'alerts', jsonb_build_object(
      'attendance', jsonb_array_length(late) > 0,
      'grading', backlog > 0,
      'completion', comp_this is not null and comp_last is not null and comp_last - comp_this >= 15,
      'missed', jsonb_array_length(repeat_missers) > 0,
      'trainee_attendance', jsonb_array_length(absent2) > 0,
      'pulse', pulse is not null and ((pulse->>'too_fast_pct')::numeric > 30 or (pulse->>'instructor_item')::numeric < 3.5)));
end $$;

-- ── JD checklist ticks from evidence ──────────────────────
create or replace function _jd_autotick(p_cohort uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_rate numeric; n int := 0; v_thr numeric := coalesce((_setting('jd_auto_threshold')->>'pct')::numeric, 90);
begin
  for r in
    select cs.person_id, cs.role, cs.classroom_id, ji.id item_id, ji.evidence
    from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id
      join jd_items ji on ji.role = cs.role and ji.evidence <> 'lead' and ji.evidence <> 'visit'
    where cl.cohort_id = p_cohort
  loop
    v_rate := case r.evidence
      when 'app_attendance' then (select avg(case when attendance_logged_at <= starts_at + interval '24 hours' then 100 else 0 end)
                                  from app_sessions where classroom_id = r.classroom_id and starts_at < now() - interval '24 hours'
                                    and (r.role = 'instructor' or logged_by = r.person_id))
      when 'app_grading' then (select avg(case when s.graded_at <= s.submitted_at + interval '72 hours' then 100 else 0 end)
                               from app_submissions s join app_tasks t on t.id = s.task_id
                               where t.classroom_id = r.classroom_id and s.submitted_at < now() - interval '72 hours'
                                 and (r.role = 'instructor' or s.graded_by = r.person_id))
      when 'app_chat' then (select avg(case when replied_at <= asked_at + interval '24 hours' then 100 else 0 end)
                            from app_chat_replies where classroom_id = r.classroom_id and asked_at < now() - interval '24 hours'
                              and (r.role = 'instructor' or replied_by = r.person_id))
      when 'feedback_ack' then (select avg(case when ack_at <= released_at + interval '48 hours' then 100 else 0 end)
                                from released_feedback where subject_id = r.person_id and cohort_id = p_cohort and released_at < now() - interval '48 hours')
    end;
    if v_rate is not null then
      insert into jd_ticks (person_id, cohort_id, item_id, done, source)
      values (r.person_id, p_cohort, r.item_id, v_rate >= v_thr, 'auto')
      on conflict (person_id, cohort_id, item_id) do update set done = excluded.done where jd_ticks.source = 'auto';
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ── Daily jobs: sync, reminders, escalation (N1, W5) ──────
create or replace function run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; o uuid; n_att int := 0; n_esc int := 0; n_grade int := 0; n_appr int := 0; n_visit int := 0; n_pulse int := 0; n_jd int := 0;
  v_days int := coalesce((_setting('approval_turnaround')->>'working_days')::int, 3);
begin
  perform _require(has_role('system_owner') or has_role('operations') or has_role('segment_owner') or has_role('education_principal'),
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

-- Pre-visit context (E1): who, when, topic, recent sessions, class-level comments.
-- Never returns the observed instructor's earlier QA scores (bias rule, 25 Oct 2026).
-- Returns only the previous "One Thing" text so the QAer can score follow-through.
create or replace function visit_context(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v visits; r jsonb;
begin
  select * into v from visits where id = p_visit;
  perform _require(v.assignee_id = me() or owns_cohort(v.cohort_id) or has_role('education_principal'), 'Not your visit');
  select jsonb_build_object(
    'cohort', (select jsonb_build_object('name', co.name, 'program', pr.name, 'start', co.start_date, 'end', co.end_date,
                 'week', greatest(1, ((coalesce(v.scheduled_for, now())::date - co.start_date) / 7) + 1))
               from cohorts co join programs pr on pr.id = co.program_id where co.id = v.cohort_id),
    'classroom', (select jsonb_build_object('name', name, 'room', room) from classrooms where id = v.classroom_id),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', cs.role, 'lead', cs.is_lead) order by cs.role, p.full_name), '[]')
             from classroom_staff cs join people p on p.id = cs.person_id where cs.classroom_id = v.classroom_id),
    'recent_sessions', (select coalesce(jsonb_agg(jsonb_build_object('at', starts_at, 'topic', topic) order by starts_at desc), '[]')
             from (select starts_at, topic from app_sessions where classroom_id = v.classroom_id and starts_at < coalesce(v.scheduled_for, now())
                   order by starts_at desc limit 3) s),
    'class_comments', (select coalesce(jsonb_agg(jsonb_build_object('at', vv.submitted_at, 'kind', vv.kind, 'action_points', vv.action_points) order by vv.submitted_at desc), '[]')
             from visits vv where vv.classroom_id = v.classroom_id and vv.id <> v.id and vv.kind = 'shadowing' and vv.submitted_at is not null),
    'previous_one_thing', (select coalesce(jsonb_agg(jsonb_build_object('person', rf.subject_id, 'one_thing', rf.one_thing, 'at', rf.released_at) order by rf.released_at desc), '[]')
             from released_feedback rf where rf.one_thing is not null
               and rf.subject_id in (select person_id from classroom_staff where classroom_id = v.classroom_id)
               and rf.released_at = (select max(released_at) from released_feedback x where x.subject_id = rf.subject_id and x.one_thing is not null))
  ) into r;
  return r;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid) from authenticated;
