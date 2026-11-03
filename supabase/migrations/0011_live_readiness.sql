-- 0011 · Ready for live use without Portal v2: programs, contracts, availability and timetable come in by hand or CSV,
-- and the daily jobs no longer record a pretend ERPNext / CODED App pull. Run once after 0010 (safe to run again).

insert into settings (key, label, value, status, note) values
('schema_version', 'Database migration level', '{"v":11}', 'decided', 'Written by migration 0011.')
on conflict (key) do update set value = excluded.value;

-- ══ 1. The daily jobs stop writing simulated sync runs; imports record their own ══
create or replace function run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; o uuid; n_att int := 0; n_esc int := 0; n_grade int := 0; n_appr int := 0; n_visit int := 0; n_pulse int := 0; n_jd int := 0;
  v_days int := coalesce((_setting('approval_turnaround')->>'working_days')::int, 3);
begin
  -- session_user is 'authenticator' for app calls; the scheduler (pg_cron) connects directly.
  perform _require(session_user <> 'authenticator' or has_role('system_owner') or has_role('operations') or has_role('segment_owner') or has_role('education_principal'),
                   'Not allowed to run the daily jobs');

  -- 1. No live pull yet: ERPNext and CODED App records arrive by CSV import (System page), which records its own sync run.

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

-- ══ 2. Programs: created and edited in the system ══
create or replace function program_save(p_id uuid, p_name text, p_product text, p_segment text, p_type text,
  p_weeks int default 1, p_sessions int default 5) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_old programs;
begin
  perform _require(has_role('system_owner') or owns_segment(p_segment), 'Only the system owner or the segment owner manages programs');
  perform _require(length(trim(coalesce(p_name,''))) > 1, 'Write the program name');
  perform _require(exists (select 1 from segments where id = p_segment), 'Pick the segment');
  perform _require(p_type in ('short','long','bootcamp'), 'Pick short, long or bootcamp');
  perform _require(coalesce(p_weeks,1) between 1 and 104 and coalesce(p_sessions,5) between 1 and 14, 'Weeks 1–104 and sessions per week 1–14');
  if v_id is null then
    insert into programs (name, product, segment_id, program_type, duration_weeks, sessions_per_week)
    values (trim(p_name), nullif(trim(coalesce(p_product,'')),''), p_segment, p_type, coalesce(p_weeks,1), coalesce(p_sessions,5)) returning id into v_id;
  else
    select * into v_old from programs where id = v_id;
    perform _require(v_old.id is not null, 'Program not found');
    perform _require(has_role('system_owner') or owns_segment(v_old.segment_id), 'Only the system owner or the segment owner manages programs');
    update programs set name = trim(p_name), product = nullif(trim(coalesce(p_product,'')),''), segment_id = p_segment, program_type = p_type,
      duration_weeks = coalesce(p_weeks,1), sessions_per_week = coalesce(p_sessions,5) where id = v_id;
  end if;
  perform _log(case when p_id is null then 'program.create' else 'program.update' end, 'program', v_id::text, jsonb_build_object('segment', p_segment, 'type', p_type));
  return v_id;
end $$;

-- ══ 3. Imports (system owner): contracts, availability, and a timetable that names the cohort and classroom ══
create or replace function _person_by_supplier(p_supplier text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where erp_supplier_id = p_supplier
$$;

create or replace function import_contracts(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_person uuid; v_prog uuid; v_cohort uuid; n_new int := 0; n_upd int := 0;
begin
  perform _require(has_role('system_owner'), 'Only the system owner imports records');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000, 'Send between 1 and 5,000 rows');
  for r in select * from jsonb_array_elements(p_rows) loop
    perform _require(coalesce(r->>'contract_id','') <> '' and coalesce(r->>'erp_supplier_id','') <> '' and coalesce(r->>'role','') <> '' and coalesce(r->>'status','') <> '',
                     'Every row needs contract_id, erp_supplier_id, role and status');
    v_person := _person_by_supplier(r->>'erp_supplier_id');
    perform _require(v_person is not null, 'No contractor with supplier ID ' || (r->>'erp_supplier_id') || ' — import the contractors first');
    perform _require(r->>'status' in ('Draft','Pending Approval','Pending Verification','Pending COO Signature','COO Signed','Sent to Contractor',
                     'Contractor Signed','Active','Approved','Completed','Cancelled'), 'Unknown contract status on ' || (r->>'contract_id'));
    perform _require(coalesce(r->>'segment','') = '' or exists (select 1 from segments where id = r->>'segment'), 'Unknown segment on ' || (r->>'contract_id'));
    v_prog := null; v_cohort := null;
    if coalesce(r->>'program','') <> '' then
      select id into v_prog from programs where lower(name) = lower(r->>'program');
      perform _require(v_prog is not null, 'Unknown program "' || (r->>'program') || '" on ' || (r->>'contract_id'));
    end if;
    if coalesce(r->>'cohort','') <> '' then
      select id into v_cohort from cohorts where lower(name) = lower(r->>'cohort');
      perform _require(v_cohort is not null, 'Unknown cohort "' || (r->>'cohort') || '" on ' || (r->>'contract_id'));
    end if;
    if exists (select 1 from erp_contracts where id = r->>'contract_id') then n_upd := n_upd + 1; else n_new := n_new + 1; end if;
    insert into erp_contracts (id, person_id, segment_id, role, program_id, cohort_id, status, start_date, end_date, rate_type, rate, signed_at)
    values (r->>'contract_id', v_person, nullif(r->>'segment',''), r->>'role', v_prog, v_cohort, r->>'status',
            nullif(r->>'start_date','')::date, nullif(r->>'end_date','')::date, nullif(lower(r->>'rate_type'),''), nullif(r->>'rate','')::numeric, nullif(r->>'signed_at','')::date)
    on conflict (id) do update set person_id = excluded.person_id, segment_id = excluded.segment_id, role = excluded.role, program_id = excluded.program_id,
      cohort_id = excluded.cohort_id, status = excluded.status, start_date = excluded.start_date, end_date = excluded.end_date,
      rate_type = excluded.rate_type, rate = excluded.rate, signed_at = excluded.signed_at;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('erpnext', now(), 'ok', n_new + n_upd, 'Contracts imported from a CSV');
  perform _log('import.contracts', 'erp_contracts', null, jsonb_build_object('new', n_new, 'updated', n_upd));
  return jsonb_build_object('new', n_new, 'updated', n_upd);
end $$;

create or replace function import_availability(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_person uuid; n int := 0; s int := 0;
begin
  perform _require(has_role('system_owner'), 'Only the system owner imports records');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000, 'Send between 1 and 5,000 rows');
  for r in select * from jsonb_array_elements(p_rows) loop
    v_person := _person_by_supplier(r->>'erp_supplier_id');
    perform _require(v_person is not null, 'No contractor with supplier ID ' || coalesce(r->>'erp_supplier_id',''));
    perform _require((r->>'from_date')::date <= (r->>'to_date')::date, 'from_date is after to_date for ' || (r->>'erp_supplier_id'));
    if exists (select 1 from erp_availability where person_id = v_person and from_date = (r->>'from_date')::date and to_date = (r->>'to_date')::date) then s := s + 1;
    else
      insert into erp_availability (person_id, from_date, to_date, note) values (v_person, (r->>'from_date')::date, (r->>'to_date')::date, nullif(r->>'note',''));
      n := n + 1;
    end if;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('erpnext', now(), 'ok', n, 'Unavailable dates imported from a CSV');
  perform _log('import.availability', 'erp_availability', null, jsonb_build_object('new', n, 'skipped', s));
  return jsonb_build_object('new', n, 'skipped', s);
end $$;

-- The timetable can name the cohort and the classroom instead of the classroom's internal id.
create or replace function import_sessions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; s int := 0; v_cl uuid;
begin
  perform _require(has_role('system_owner'), 'Only the system owner imports records');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000, 'Send between 1 and 5,000 rows');
  for r in select * from jsonb_array_elements(p_rows) loop
    v_cl := null;
    if coalesce(r->>'classroom_id','') <> '' then
      select id into v_cl from classrooms where id::text = r->>'classroom_id';
    else
      select cl.id into v_cl from classrooms cl join cohorts co on co.id = cl.cohort_id
      where lower(co.name) = lower(coalesce(r->>'cohort','')) and lower(cl.name) = lower(coalesce(r->>'classroom',''));
    end if;
    perform _require(v_cl is not null, 'Unknown classroom: ' || coalesce(nullif(r->>'classroom_id',''), coalesce(r->>'cohort','?') || ' / ' || coalesce(r->>'classroom','?')));
    perform _require(coalesce(r->>'starts_at','') <> '', 'Every row needs starts_at (for example 2026-11-08T09:00:00+03:00)');
    if exists (select 1 from app_sessions where classroom_id = v_cl and starts_at = (r->>'starts_at')::timestamptz) then
      s := s + 1;
    else
      insert into app_sessions (classroom_id, starts_at, topic, attendance_logged_at)
      values (v_cl, (r->>'starts_at')::timestamptz, nullif(r->>'topic',''), nullif(r->>'attendance_logged_at','')::timestamptz);
      n := n + 1;
    end if;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('coded_app', now(), 'ok', n, 'Timetable imported from a CSV');
  perform _log('import.sessions', 'app_sessions', null, jsonb_build_object('new', n, 'skipped', s));
  return jsonb_build_object('new', n, 'skipped', s);
end $$;

-- Contractors CODED has already approved can be brought in as cleared (column cleared_to_teach = yes). Logged per import.
create or replace function import_contractors(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n_new int := 0; n_upd int := 0; n_clr int := 0; v_id uuid;
begin
  perform _require(has_role('system_owner'), 'Only the system owner imports records');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 2000, 'Send between 1 and 2,000 rows');
  for r in select * from jsonb_array_elements(p_rows) loop
    perform _require(coalesce(r->>'erp_supplier_id','') <> '' and coalesce(r->>'full_name','') <> '', 'Every row needs erp_supplier_id and full_name');
    perform _require(coalesce(r->>'contractor_status','Active') in ('Potential','Active','Inactive','Blacklisted','Duplicate'), 'Unknown contractor status in ' || (r->>'erp_supplier_id'));
    select id into v_id from people where erp_supplier_id = r->>'erp_supplier_id';
    if v_id is null and coalesce(r->>'email','') <> '' then
      select id into v_id from people where lower(email) = lower(r->>'email');
      perform _require(v_id is null or (select erp_supplier_id is null from people where id = v_id),
                       'The email on ' || (r->>'erp_supplier_id') || ' already belongs to a record with another supplier ID');
      update people set erp_supplier_id = r->>'erp_supplier_id' where id = v_id;
    end if;
    if v_id is null then
      insert into people (full_name, arabic_name, email, roles, home_segment, erp_supplier_id, erp_service_category, erp_instructor_level, erp_contractor_status, approval_status)
      values (r->>'full_name', r->>'arabic_name', nullif(lower(r->>'email'),''),
              case when lower(coalesce(r->>'role','')) = 'ta' then array['ta'] else array['instructor'] end, nullif(r->>'home_segment',''),
              r->>'erp_supplier_id', r->>'service_category', r->>'instructor_level', coalesce(r->>'contractor_status','Active'),
              case when lower(coalesce(r->>'cleared_to_teach','')) in ('yes','true','1') then 'cleared' else 'not_started' end);
      if lower(coalesce(r->>'cleared_to_teach','')) in ('yes','true','1') then n_clr := n_clr + 1; end if;
      n_new := n_new + 1;
    else
      update people set full_name = r->>'full_name', arabic_name = coalesce(r->>'arabic_name', arabic_name),
        erp_service_category = coalesce(r->>'service_category', erp_service_category), erp_instructor_level = coalesce(r->>'instructor_level', erp_instructor_level),
        erp_contractor_status = coalesce(r->>'contractor_status', erp_contractor_status),
        approval_status = case when lower(coalesce(r->>'cleared_to_teach','')) in ('yes','true','1') and approval_status = 'not_started' then 'cleared' else approval_status end
        where id = v_id;
      if lower(coalesce(r->>'cleared_to_teach','')) in ('yes','true','1') then n_clr := n_clr + 1; end if;
      n_upd := n_upd + 1;
    end if;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('erpnext', now(), 'ok', n_new + n_upd, 'Contractors imported from a CSV');
  perform _log('import.contractors', 'people', null, jsonb_build_object('new', n_new, 'updated', n_upd, 'cleared', n_clr));
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'cleared', n_clr);
end $$;

-- ══ 4. Privileges (as at the end of 0010) ══
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions(), _unscored_items(jsonb, text, jsonb, text[]), _next_assignee(uuid), _staffing_changed(), _qa_plan_changed(),
  _qa_visits_changed(), _person_by_supplier(text) from authenticated;
