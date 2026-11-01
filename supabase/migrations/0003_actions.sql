-- Every write in the system goes through these functions.
-- Each one checks who is calling, records an audit entry and sends notifications.

-- ── Internal helpers ──────────────────────────────────────
create or replace function _require(ok boolean, msg text) returns void
language plpgsql as $$ begin if not coalesce(ok, false) then raise exception '%', msg using errcode = 'P0001'; end if; end $$;

create or replace function _log(p_action text, p_entity text, p_entity_id text, p_data jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, entity, entity_id, data) values (me(), p_action, p_entity, p_entity_id, p_data)
$$;

create or replace function _notify(p_person uuid, p_title text, p_body text, p_link text, p_dedupe text default null) returns void
language sql security definer set search_path = public as $$
  insert into notifications (person_id, title, body, link, dedupe_key)
  select p_person, p_title, p_body, p_link, p_dedupe where p_person is not null
  on conflict (person_id, dedupe_key) do nothing
$$;

create or replace function _segment_owners(seg text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from people where 'segment_owner' = any(roles) and seg = any(owned_segments)
$$;

create or replace function _people_with_role(r text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from people where r = any(roles)
$$;

create or replace function _setting(k text) returns jsonb
language sql stable security definer set search_path = public as $$ select value from settings where key = k $$;

-- Working days between two moments (Kuwait weekend: Friday and Saturday).
create or replace function working_days_between(a timestamptz, b timestamptz) returns int
language sql immutable as $$
  select count(*)::int from generate_series(a::date + 1, b::date, interval '1 day') d
  where extract(isodow from d) not in (5, 6)
$$;

create or replace function period_bounds(p text, out d_from date, out d_to date)
language sql immutable as $$
  select make_date(split_part(p,'-Q',1)::int, (split_part(p,'-Q',2)::int - 1) * 3 + 1, 1),
         (make_date(split_part(p,'-Q',1)::int, (split_part(p,'-Q',2)::int - 1) * 3 + 1, 1) + interval '3 months' - interval '1 day')::date
$$;

create or replace function period_of(d date) returns text
language sql immutable as $$ select extract(year from d)::int || '-Q' || extract(quarter from d)::int $$;

-- ══ A. Content approval ═══════════════════════════════════
create or replace function content_create(p_program uuid, p_title text, p_kind text, p_audience text,
  p_outcomes text, p_deadline date, p_budget jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require(me() is not null, 'Not signed in');
  perform _require(has_role('content_creator') or has_role('instructor') or has_role('senior_instructor')
                   or has_role('education_principal'), 'Only content creators and educators can start a content request');
  perform _require(length(trim(coalesce(p_title,''))) > 0, 'Give the content a title');
  insert into content_items (program_id, title, kind, audience, outcomes, deadline, budget, creator_id)
  values (p_program, p_title, coalesce(p_kind,'new'), p_audience, p_outcomes, p_deadline, p_budget, me())
  returning id into v_id;
  perform _log('content.create', 'content', v_id::text, jsonb_build_object('title', p_title));
  return v_id;
end $$;

create or replace function content_submit(p_content uuid, p_summary text, p_link text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_item content_items; v_ver int; v_id uuid; v_approver text := coalesce(_setting('content_approver_role')->>'role','education_principal'); a uuid;
begin
  select * into v_item from content_items where id = p_content;
  perform _require(v_item.id is not null, 'Content not found');
  perform _require(v_item.creator_id = me(), 'Only the creator can submit this content');
  perform _require(v_item.status in ('draft','changes_requested','approved'), 'This content is already waiting for a decision');
  select coalesce(max(version),0) + 1 into v_ver from content_versions where content_id = p_content;
  insert into content_versions (content_id, version, summary, link, submitted_by)
  values (p_content, v_ver, p_summary, p_link, me()) returning id into v_id;
  update content_items set status = 'submitted' where id = p_content;
  for a in select _people_with_role(v_approver) loop
    perform _notify(a, 'Content waiting for approval', v_item.title || ' — version ' || v_ver, '/approvals/content/' || p_content, 'content:' || v_id);
  end loop;
  perform _log('content.submit', 'content', p_content::text, jsonb_build_object('version', v_ver));
  return v_id;
end $$;

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
  update content_versions set decision = p_decision, decided_by = me(), decided_at = now(), comments = p_comments where id = p_version;
  if p_decision = 'approved' then
    update content_items set status = 'approved', approved_version = v.version, approved_by = me(), approved_at = now() where id = v.content_id;
  else
    update content_items set status = 'changes_requested' where id = v.content_id;
  end if;
  perform _notify(v_item.creator_id,
    case when p_decision = 'approved' then 'Content approved' else 'Changes requested' end,
    v_item.title || ' — version ' || v.version, '/approvals/content/' || v.content_id, null);
  perform _log('content.' || p_decision, 'content', v.content_id::text, jsonb_build_object('version', v.version, 'comments', p_comments));
end $$;

create or replace function cohort_attach_content(p_cohort uuid, p_content uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_item content_items;
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal'), 'Only the segment owner can attach content to a cohort');
  select * into v_item from content_items where id = p_content;
  perform _require(v_item.status = 'approved' or v_item.approved_version is not null, 'Content must be approved before a cohort can use it');
  update cohorts set content_id = p_content, content_version = v_item.approved_version where id = p_cohort;
  perform _log('cohort.content_locked', 'cohort', p_cohort::text, jsonb_build_object('content', p_content, 'version', v_item.approved_version));
end $$;

-- ══ B. People approvals ═══════════════════════════════════
create or replace function pipeline_start(p_person uuid, p_role text, p_segment text, p_program uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; s text; i int := 0;
  v_steps text[] := array['criteria','vetting','selection_rate','contract','onboarding','mock1','mock2','cleared'];
begin
  perform _require(has_role('education_principal') or has_role('senior_instructor') or owns_segment(p_segment) or has_role('hr'),
                   'Only Education, HR or the segment owner can start an approval');
  perform _require(not exists (select 1 from pipelines where person_id = p_person and target_role = p_role and segment_id = p_segment and status = 'in_pipeline'),
                   'This person already has an open approval for this role and segment');
  insert into pipelines (person_id, target_role, segment_id, program_id, created_by)
  values (p_person, p_role, p_segment, p_program, me()) returning id into v_id;
  foreach s in array v_steps loop
    i := i + 1;
    insert into pipeline_steps (pipeline_id, step, ord, opened_at) values (v_id, s, i, case when i = 1 then now() end);
  end loop;
  update people set approval_status = 'in_pipeline' where id = p_person and approval_status <> 'cleared';
  perform _log('pipeline.start', 'pipeline', v_id::text, jsonb_build_object('person', p_person, 'role', p_role, 'segment', p_segment));
  return v_id;
end $$;

create or replace function _pipeline_step_allowed(p_step text, p_segment text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_step
    when 'criteria'       then has_role('education_principal') or has_role('senior_instructor')
    when 'vetting'        then has_role('education_principal') or has_role('senior_instructor')
    when 'selection_rate' then owns_segment(p_segment)
    when 'contract'       then has_role('hr')
    when 'onboarding'     then has_role('education_principal') or has_role('senior_instructor')
    when 'mock1'          then has_role('education_principal') or has_role('senior_instructor')
    when 'mock2'          then has_role('education_principal') or has_role('senior_instructor')
    when 'cleared'        then owns_segment(p_segment)
    else false end
$$;

create or replace function pipeline_step_complete(p_step uuid, p_status text, p_data jsonb, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare st pipeline_steps; pl pipelines; v_next uuid; v_contract erp_contracts; g uuid; v_cohort_start date;
begin
  select * into st from pipeline_steps where id = p_step;
  perform _require(st.id is not null, 'Step not found');
  select * into pl from pipelines where id = st.pipeline_id;
  perform _require(pl.status = 'in_pipeline', 'This approval is already closed');
  perform _require(_pipeline_step_allowed(st.step, pl.segment_id), 'You are not the owner of this step');
  perform _require(p_status in ('done','failed'), 'Unknown status');
  perform _require(not exists (select 1 from pipeline_steps where pipeline_id = pl.id and ord < st.ord and status <> 'done'),
                   'Earlier steps must be complete first');
  perform _require(st.step not in ('mock1','mock2'), 'Record mock classes with the mock-class scoring form');

  if st.step = 'contract' and p_status = 'done' then
    select * into v_contract from erp_contracts
      where person_id = pl.person_id and status in ('Approved','Active') and signed_at is not null
      order by signed_at desc limit 1;
    perform _require(v_contract.id is not null, 'ERPNext shows no signed, approved contract for this person yet');
    p_data := coalesce(p_data,'{}'::jsonb) || jsonb_build_object('erp_contract', v_contract.id, 'erp_status', v_contract.status, 'signed_at', v_contract.signed_at);
  end if;

  if st.step = 'selection_rate' and p_status = 'done' then
    perform _require((p_data->>'rate') is not null, 'Set the rate before approving the selection');
    update pipelines set rate = (p_data->>'rate')::numeric, rate_type = coalesce(p_data->>'rate_type','hourly') where id = pl.id;
    for g in select _people_with_role('gm') loop
      perform _notify(g, 'Selection approved (for your information)', (select full_name from people where id = pl.person_id) || ' — ' || pl.target_role, '/approvals/people/' || pl.id, 'sel:' || pl.id);
    end loop;
  end if;

  update pipeline_steps set status = p_status, data = coalesce(p_data,'{}'), notes = p_notes, done_by = me(), done_at = now() where id = p_step;

  if p_status = 'done' then
    select id into v_next from pipeline_steps where pipeline_id = pl.id and ord = st.ord + 1;
    update pipeline_steps set opened_at = now() where id = v_next and opened_at is null;
  end if;

  if st.step = 'cleared' and p_status = 'done' then
    update pipelines set status = 'cleared' where id = pl.id;
    update people set approval_status = 'cleared' where id = pl.person_id;
    perform _notify(pl.person_id, 'You are cleared to teach', 'Your approval for ' || pl.target_role || ' is complete.', '/me', null);
  elsif p_status = 'failed' and st.step in ('selection_rate','cleared') then
    update pipelines set status = 'not_approved' where id = pl.id;
    update people set approval_status = 'not_approved' where id = pl.person_id and approval_status <> 'cleared';
  end if;
  perform _log('pipeline.step.' || p_status, 'pipeline', pl.id::text, jsonb_build_object('step', st.step, 'notes', p_notes));
end $$;

-- Mock class on the CCTP 100-point rubric. Critical failures force Not Yet.
create or replace function _score_mock(p_scores jsonb, p_critical text[], out total int, out result text)
language plpgsql stable security definer set search_path = public as $$
declare it jsonb; v numeric;
begin
  total := 0;
  for it in select * from jsonb_array_elements(_setting('cctp_mock_rubric')->'items') loop
    v := least(greatest(coalesce((p_scores->>(it->>'key'))::numeric, 0), 0), (it->>'max')::numeric);
    total := total + v;
  end loop;
  result := case when coalesce(array_length(p_critical,1),0) > 0 then 'not_yet'
                 when total >= 90 then 'CCT' when total >= 80 then 'CCTA' else 'not_yet' end;
end $$;

create or replace function pipeline_record_mock(p_step uuid, p_scores jsonb, p_critical text[], p_feedback text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st pipeline_steps; pl pipelines; v_total int; v_result text; v_pass boolean; v_id uuid;
begin
  select * into st from pipeline_steps where id = p_step;
  select * into pl from pipelines where id = st.pipeline_id;
  perform _require(st.step in ('mock1','mock2'), 'This step is not a mock class');
  perform _require(pl.status = 'in_pipeline', 'This approval is already closed');
  perform _require(_pipeline_step_allowed(st.step, pl.segment_id), 'Only Education can score mock classes');
  perform _require(not exists (select 1 from pipeline_steps where pipeline_id = pl.id and ord < st.ord and status <> 'done'),
                   'Earlier steps must be complete first');
  perform _require(length(trim(coalesce(p_feedback,''))) > 0, 'Written feedback is required');
  select total, result into v_total, v_result from _score_mock(p_scores, coalesce(p_critical,'{}'));
  v_pass := v_result in ('CCT','CCTA');
  insert into mock_results (person_id, pipeline_id, context, scores, critical_failures, total, result, feedback, assessor_id)
  values (pl.person_id, pl.id, st.step, p_scores, coalesce(p_critical,'{}'), v_total, v_result, p_feedback, me()) returning id into v_id;
  update pipeline_steps set status = case when v_pass then 'done' else 'failed' end,
    data = jsonb_build_object('mock_result', v_id, 'total', v_total, 'result', v_result),
    done_by = me(), done_at = now() where id = p_step;
  if v_pass then
    update pipeline_steps set opened_at = now() where pipeline_id = pl.id and ord = st.ord + 1 and opened_at is null;
  end if;
  perform _notify(pl.person_id, 'Mock class feedback', 'Score ' || v_total || '/100', '/me', 'mock:' || v_id);
  perform _log('pipeline.mock', 'pipeline', pl.id::text, jsonb_build_object('step', st.step, 'total', v_total, 'result', v_result));
  return jsonb_build_object('total', v_total, 'result', v_result, 'passed', v_pass);
end $$;

-- ══ C. Cohorts and classrooms ═════════════════════════════
create or replace function _can_staff(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_cohort(p_cohort) or (has_role('operations') and (oversees_cohort(p_cohort) or cohort_segment(p_cohort) is not null))
$$;

create or replace function cohort_create(p_program uuid, p_name text, p_start date, p_end date, p_classrooms int default 1) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_seg text; i int;
begin
  select segment_id into v_seg from programs where id = p_program;
  perform _require(owns_segment(v_seg) or has_role('operations'), 'Only the segment owner or Operations can create a cohort');
  perform _require(p_end >= p_start, 'End date is before start date');
  insert into cohorts (program_id, name, start_date, end_date) values (p_program, p_name, p_start, p_end) returning id into v_id;
  for i in 1 .. greatest(coalesce(p_classrooms,1),1) loop
    insert into classrooms (cohort_id, name) values (v_id, 'Classroom ' || chr(64 + i));
  end loop;
  perform _log('cohort.create', 'cohort', v_id::text, jsonb_build_object('name', p_name, 'classrooms', p_classrooms));
  return v_id;
end $$;

create or replace function classroom_add(p_cohort uuid, p_name text, p_room text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require(_can_staff(p_cohort), 'Only the segment owner or Operations can change classrooms');
  insert into classrooms (cohort_id, name, room) values (p_cohort, p_name, p_room) returning id into v_id;
  perform _log('classroom.add', 'cohort', p_cohort::text, jsonb_build_object('classroom', p_name));
  return v_id;
end $$;

create or replace function classroom_assign(p_classroom uuid, p_person uuid, p_role text, p_is_lead boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid := classroom_cohort(p_classroom); v_seg text; v_person people;
begin
  v_seg := cohort_segment(v_cohort);
  perform _require(_can_staff(v_cohort), 'Only the segment owner or Operations can staff classrooms');
  select * into v_person from people where id = p_person;
  perform _require(v_person.approval_status = 'cleared', v_person.full_name || ' is not cleared to teach yet');
  perform _require(exists (select 1 from erp_contracts where person_id = p_person and status = 'Active'
                            and (cohort_id = v_cohort or (cohort_id is null and (segment_id = v_seg or segment_id is null)))),
                   v_person.full_name || ' has no Active contract in ERPNext for this cohort');
  insert into classroom_staff (classroom_id, person_id, role, is_lead) values (p_classroom, p_person, p_role, coalesce(p_is_lead,false))
  on conflict (classroom_id, person_id) do update set role = excluded.role, is_lead = excluded.is_lead;
  perform _log('classroom.assign', 'cohort', v_cohort::text, jsonb_build_object('classroom', p_classroom, 'person', p_person, 'role', p_role));
end $$;

create or replace function classroom_unassign(p_classroom uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid := classroom_cohort(p_classroom);
begin
  perform _require(_can_staff(v_cohort), 'Only the segment owner or Operations can staff classrooms');
  delete from classroom_staff where classroom_id = p_classroom and person_id = p_person;
  perform _log('classroom.unassign', 'cohort', v_cohort::text, jsonb_build_object('classroom', p_classroom, 'person', p_person));
end $$;

create or replace function classroom_set_ready(p_classroom uuid, p_ready boolean, p_room text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid := classroom_cohort(p_classroom);
begin
  perform _require(_can_staff(v_cohort), 'Only Operations or the segment owner can confirm readiness');
  update classrooms set ready = p_ready, room = coalesce(p_room, room) where id = p_classroom;
  perform _log('classroom.ready', 'cohort', v_cohort::text, jsonb_build_object('classroom', p_classroom, 'ready', p_ready));
end $$;

create or replace function cohort_set_role(p_cohort uuid, p_person uuid, p_role text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal'), 'Only the segment owner can name overseers and senior instructors');
  if p_role = 'senior_instructor' then
    perform _require(exists (select 1 from people where id = p_person and 'senior_instructor' = any(roles)), 'That person is not a Senior Instructor');
  end if;
  if p_on then
    insert into cohort_roles values (p_cohort, p_person, p_role) on conflict do nothing;
  else
    delete from cohort_roles where cohort_id = p_cohort and person_id = p_person and role = p_role;
  end if;
  perform _log('cohort.role', 'cohort', p_cohort::text, jsonb_build_object('person', p_person, 'role', p_role, 'on', p_on));
end $$;

create or replace function cohort_set_backup(p_cohort uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(owns_cohort(p_cohort), 'Only the segment owner can set the backup instructor');
  perform _require(p_person is null or exists (select 1 from people where id = p_person and approval_status = 'cleared'), 'The backup must be cleared to teach');
  update cohorts set backup_instructor_id = p_person where id = p_cohort;
  perform _log('cohort.backup', 'cohort', p_cohort::text, jsonb_build_object('person', p_person));
end $$;

-- Readiness gate (W2 step 5 / C2): content approved, every classroom staffed and cleared, overseer named, QA plan set.
create or replace function cohort_readiness(p_cohort uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare co cohorts; b text[] := '{}'; w text[] := '{}'; r record; v_n int;
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
  return jsonb_build_object('ok', coalesce(array_length(b,1),0) = 0, 'blockers', to_jsonb(b), 'warnings', to_jsonb(w));
end $$;

create or replace function cohort_go_live(p_cohort uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform _require(owns_cohort(p_cohort), 'Only the segment owner can start a cohort');
  r := cohort_readiness(p_cohort);
  if (r->>'ok')::boolean then
    update cohorts set status = 'live', went_live_at = now() where id = p_cohort;
    perform _log('cohort.go_live', 'cohort', p_cohort::text, r);
  end if;
  return r;
end $$;

create or replace function cohort_close(p_cohort uuid, p_final_report text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  perform _require(owns_cohort(p_cohort), 'Only the segment owner can close a cohort');
  update cohorts set status = 'closed', final_report = coalesce(p_final_report, final_report),
    final_report_at = case when p_final_report is not null then now() else final_report_at end where id = p_cohort;
  for p in select distinct cs.person_id from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id where cl.cohort_id = p_cohort
           union select person_id from cohort_roles where cohort_id = p_cohort and role = 'overseer' loop
    perform _notify(p, '360° reviews are open', 'Review your classroom team within 14 days.', '/reviews', '360open:' || p_cohort);
  end loop;
  perform _log('cohort.close', 'cohort', p_cohort::text, null);
end $$;

-- ══ D. Visit scheduling ═══════════════════════════════════
create or replace function _template_for(p_kind text, p_qa_type text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from qa_templates
  where status <> 'retired' and not is_special
    and kind = case when p_kind = 'shadowing' then 'shadowing' when p_qa_type = 'operations' then 'operations_qa' else 'education_qa' end
  order by (focus = 'class') desc, version desc limit 1
$$;

-- Rotation (D5): the eligible person with the fewest visits in this cohort.
create or replace function _rotate_assignee(p_cohort uuid, p_kind text, p_qa_type text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from people p
  where case
    when p_kind = 'shadowing' then
      p.id in (select person_id from cohort_roles where cohort_id = p_cohort)
      or 'education_officer' = any(p.roles)
    when p_qa_type = 'operations' then 'operations' = any(p.roles)
    else ('education_officer' = any(p.roles) or 'senior_instructor' = any(p.roles)) and p.is_full_timer
  end
  order by (select count(*) from visits v where v.cohort_id = p_cohort and v.assignee_id = p.id), p.full_name
  limit 1
$$;

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
  -- Replace generated visits that nobody has acted on yet.
  delete from visits where cohort_id = p_cohort and mode = 'planned' and status = 'planned' and submitted_at is null;
  for cl in select id from classrooms where cohort_id = p_cohort order by name loop
    foreach w in array v_shadow loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 2)::timestamp + interval '7 hours';
        insert into visits (cohort_id, classroom_id, kind, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'shadowing', 'planned', 'class', _template_for('shadowing', null), _rotate_assignee(p_cohort,'shadowing',null), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
    foreach w in array v_edu loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 1)::timestamp + interval '7 hours';
        insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'qa', 'education', 'planned', 'class', _template_for('qa','education'), _rotate_assignee(p_cohort,'qa','education'), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
    foreach w in array v_ops loop
      if w <= v_weeks then
        v_start := (co.start_date + (w - 1) * 7 + 3)::timestamp + interval '6 hours';
        insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by)
        values (p_cohort, cl.id, 'qa', 'operations', 'planned', 'class', _template_for('qa','operations'), _rotate_assignee(p_cohort,'qa','operations'), v_start, w, me());
        n := n + 1;
      end if;
    end loop;
  end loop;
  update cohorts set qa_plan = jsonb_build_object('type', pr.program_type, 'weeks', v_weeks, 'education_weeks', to_jsonb(v_edu),
    'operations_weeks', to_jsonb(v_ops), 'shadowing_weeks', to_jsonb(v_shadow), 'generated_at', now()) where id = p_cohort;
  perform _log('qa_plan.generate', 'cohort', p_cohort::text, jsonb_build_object('visits', n));
  return jsonb_build_object('visits', n);
end $$;

-- Who may run an education QA visit: CODED-internal, educational background
-- (part-timers only where the segment owner allows it — see setting part_time_qa_segments).
create or replace function _can_qa(p uuid, p_qa_type text, p_seg text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_qa_type = 'operations' then exists (select 1 from people where id = p and 'operations' = any(roles))
    else exists (select 1 from people where id = p
           and (roles && array['education_officer','senior_instructor','education_principal'])
           and (is_full_timer or coalesce(_setting('part_time_qa_segments') ? p_seg, false)))
  end
$$;

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
            p_focus_person, coalesce(p_template, _template_for(p_kind, p_qa_type)), p_assignee, p_when,
            greatest(1, ((p_when::date - (select start_date from cohorts where id = p_cohort)) / 7) + 1), 'invited', me())
    returning id into v_id;
  else
    select * into v_old from visits where id = v_id;
    perform _require(v_old.submitted_at is null, 'This visit is already completed');
    update visits set classroom_id = p_classroom, kind = p_kind, qa_type = case when p_kind = 'qa' then p_qa_type end,
      mode = coalesce(p_mode, mode), focus = coalesce(p_focus, focus), focus_person_id = p_focus_person,
      template_id = coalesce(p_template, template_id, _template_for(p_kind, p_qa_type)), assignee_id = p_assignee,
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

create or replace function visit_respond(p_visit uuid, p_action text, p_when timestamptz default null, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; o uuid; v_is_owner boolean;
begin
  select * into v from visits where id = p_visit;
  perform _require(v.id is not null, 'Visit not found');
  perform _require(v.submitted_at is null, 'This visit is already completed');
  v_is_owner := owns_cohort(v.cohort_id);
  perform _require(v.assignee_id = me() or v_is_owner, 'Only the assigned observer or the segment owner can change this visit');
  if p_action = 'accept' then
    update visits set status = 'accepted' where id = p_visit;
  elsif p_action = 'reschedule' then
    perform _require(p_when is not null, 'Pick the new date and time');
    perform _require(not exists (select 1 from erp_availability where person_id = v.assignee_id and p_when::date between from_date and to_date),
                     'Unavailable on that date (ERPNext availability)');
    update visits set scheduled_for = p_when, status = 'accepted' where id = p_visit;
  elsif p_action = 'decline' then
    -- Goes back to the scheduler's queue so it is replaced, not forgotten.
    update visits set assignee_id = null, status = 'planned' where id = p_visit;
  elsif p_action = 'cancel' then
    perform _require(v_is_owner, 'Only the segment owner can cancel a visit outright');
    update visits set status = 'cancelled' where id = p_visit;
  else
    perform _require(false, 'Unknown action');
  end if;
  for o in select _segment_owners(cohort_segment(v.cohort_id)) union select v.created_by loop
    if o <> me() then
      perform _notify(o, case p_action when 'accept' then 'Visit accepted' when 'reschedule' then 'Visit rescheduled'
                        when 'decline' then 'Visit declined — needs a new observer' else 'Visit cancelled' end,
        coalesce(p_reason, ''), '/visits/' || p_visit, null);
    end if;
  end loop;
  perform _log('visit.' || p_action, 'visit', p_visit::text, jsonb_build_object('when', p_when, 'reason', p_reason));
end $$;

-- ══ E. Visit instrument ═══════════════════════════════════
-- Scores each subject against the template rubric. Sections listed in p_unobserved are flagged, not scored.
create or replace function _score_subject(p_rubric jsonb, p_role text, p_scores jsonb, p_unobserved text[],
  out total numeric, out max numeric, out pct numeric)
language plpgsql immutable as $$
declare sec jsonb; it jsonb; v numeric;
begin
  total := 0; max := 0;
  for sec in select * from jsonb_array_elements(p_rubric->p_role->'sections') loop
    continue when (sec->>'key') = any(coalesce(p_unobserved,'{}'));
    for it in select * from jsonb_array_elements(sec->'items') loop
      v := least(greatest(coalesce((p_scores->>(it->>'key'))::numeric, 0), 0), (it->>'max')::numeric);
      total := total + v; max := max + (it->>'max')::numeric;
    end loop;
  end loop;
  pct := case when max > 0 then round(total * 100 / max, 1) else null end;
end $$;

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
  perform _require(p_attendance in ('full','partial'), 'Say whether you attended the full session or part of it');
  perform _require(p_attendance = 'full' or coalesce(array_length(p_unobserved,1),0) > 0, 'For partial attendance, mark the areas you did not observe');
  select * into t from qa_templates where id = v.template_id;
  v_seg := cohort_segment(v.cohort_id);

  if v.kind = 'qa' then
    perform _require(jsonb_array_length(coalesce(p_scores,'[]')) > 0, 'Score at least one subject');
    for s in select * from jsonb_array_elements(p_scores) loop
      perform _require((s->>'subject_role') = any(t.subjects), 'This template does not score ' || (s->>'subject_role'));
      select * into r from _score_subject(t.rubric, s->>'subject_role', s->'scores', p_unobserved);
      insert into visit_scores (visit_id, subject_person_id, subject_role, scores, total, max, pct)
      values (p_visit, nullif(s->>'subject_person_id','')::uuid, s->>'subject_role', s->'scores', r.total, r.max, r.pct);
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

-- Segment owner releases a visit report: approve as written, edit then share, or keep private.
create or replace function visit_release(p_visit uuid, p_decision text, p_summary text, p_one_thing text, p_action_points text, p_channel text) returns int
language plpgsql security definer set search_path = public as $$
declare v visits; p uuid; n int := 0; v_title text;
begin
  select * into v from visits where id = p_visit;
  perform _require(owns_cohort(v.cohort_id), 'Only the segment owner releases feedback (Pillar B)');
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
            coalesce(case when p_decision = 'edit' then p_one_thing end, v.one_thing),
            coalesce(case when p_decision = 'edit' then p_action_points end, v.action_points),
            p_channel, me());
    perform _notify(p, 'New feedback on your dashboard', v_title, '/me', 'rel:' || p_visit || ':' || p);
    n := n + 1;
  end loop;
  update visits set release_status = 'released', released_at = now(),
    summary = case when p_decision = 'edit' then coalesce(p_summary, summary) else summary end where id = p_visit;
  perform _log('visit.release', 'visit', p_visit::text, jsonb_build_object('decision', p_decision, 'channel', p_channel, 'people', n));
  return n;
end $$;

-- ══ Feedback any time (FB1–FB9) ═══════════════════════════
create or replace function feedback_log(p_subject uuid, p_cohort uuid, p_classroom uuid, p_type text, p_severity text,
  p_body text, p_red_flag_reason text default null, p_attachment text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; o uuid; v_name text; v_seg text; v_count int;
begin
  perform _require(me() is not null, 'Not signed in');
  perform _require(p_subject <> me(), 'You cannot log feedback about yourself');
  perform _require(length(trim(coalesce(p_body,''))) > 0, 'Write what you saw');
  perform _require(p_severity <> 'red_flag' or p_red_flag_reason is not null, 'Pick the red-flag reason');
  insert into feedback (subject_id, cohort_id, classroom_id, author_id, type, severity, body, red_flag_reason, attachment_url)
  values (p_subject, p_cohort, p_classroom, me(), p_type, p_severity, p_body, p_red_flag_reason, p_attachment)
  returning id into v_id;
  select full_name into v_name from people where id = p_subject;
  v_seg := coalesce(cohort_segment(p_cohort), (select home_segment from people where id = p_subject));
  for o in select _segment_owners(v_seg) loop
    if p_severity = 'red_flag' then
      perform _notify(o, 'Red flag — same-day review', v_name || ': ' || p_red_flag_reason, '/feedback/release', 'rf:' || v_id);
    else
      perform _notify(o, 'Feedback waiting for release', v_name, '/feedback/release', 'fbq:' || current_date || ':' || o);
    end if;
  end loop;
  -- FB8 pattern alert: 3+ concerns of the same type in a cohort
  select count(*) into v_count from feedback where subject_id = p_subject and cohort_id is not distinct from p_cohort
    and type = p_type and type in ('concern','incident') and status <> 'merged';
  if v_count >= 3 then
    for o in select _segment_owners(v_seg) loop
      perform _notify(o, 'Pattern: consider a Coaching Plan', v_name || ' has ' || v_count || ' ' || p_type || ' notes in this cohort.', '/people/' || p_subject, 'pattern:' || p_subject || ':' || p_cohort || ':' || p_type);
    end loop;
  end if;
  perform _log('feedback.log', 'feedback', v_id::text, jsonb_build_object('subject', p_subject, 'type', p_type, 'severity', p_severity));
  return v_id;
end $$;

create or replace function feedback_edit(p_id uuid, p_body text, p_type text, p_severity text) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  select * into f from feedback where id = p_id;
  perform _require(f.author_id = me(), 'Only the author can edit');
  perform _require(f.status = 'private' and f.reviewed_at is null, 'It has already been reviewed');
  update feedback set body = p_body, type = coalesce(p_type, type), severity = coalesce(p_severity, severity), updated_at = now() where id = p_id;
  perform _log('feedback.edit', 'feedback', p_id::text, jsonb_build_object('before', f.body));
end $$;

create or replace function feedback_review(p_id uuid, p_decision text, p_text text, p_channel text, p_merge_into uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback; v_title text;
begin
  select * into f from feedback where id = p_id;
  perform _require(f.id is not null, 'Note not found');
  perform _require(owns_person(f.subject_id), 'Only the segment owner releases feedback (Pillar B)');
  perform _require(f.status = 'private', 'This note was already handled');
  if p_decision in ('approve','edit') then
    perform _require(p_channel in ('email','call_email','face_email'), 'Record how the feedback is delivered');
    v_title := case f.type when 'praise' then 'Praise' when 'coaching' then 'Coaching point' when 'concern' then 'Concern' else 'Incident' end;
    insert into released_feedback (subject_id, feedback_id, cohort_id, kind, title, body, channel, released_by)
    values (f.subject_id, f.id, f.cohort_id, 'note', v_title,
            case when p_decision = 'edit' then coalesce(nullif(trim(p_text),''), f.body) else f.body end, p_channel, me());
    update feedback set status = 'released', reviewed_by = me(), reviewed_at = now() where id = p_id;
    perform _notify(f.subject_id, 'New feedback on your dashboard', v_title, '/me', 'reln:' || p_id);
  elsif p_decision = 'keep_private' then
    update feedback set status = 'kept_private', reviewed_by = me(), reviewed_at = now() where id = p_id;
  elsif p_decision = 'merge' then
    perform _require(p_merge_into is not null and p_merge_into <> p_id, 'Pick the note to merge into');
    update feedback set status = 'merged', merged_into = p_merge_into, reviewed_by = me(), reviewed_at = now() where id = p_id;
  else
    perform _require(false, 'Unknown decision');
  end if;
  perform _log('feedback.' || p_decision, 'feedback', p_id::text, jsonb_build_object('channel', p_channel));
end $$;

create or replace function feedback_ack(p_released uuid, p_reply text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(exists (select 1 from released_feedback where id = p_released and subject_id = me()), 'Not your feedback');
  update released_feedback set ack_at = coalesce(ack_at, now()), reply = coalesce(nullif(trim(p_reply),''), reply) where id = p_released;
  perform _log('feedback.ack', 'released_feedback', p_released::text, jsonb_build_object('reply', p_reply is not null));
end $$;

-- ══ 360° reviews (scoped to the classroom) ════════════════
create or replace function _team_role(p_cohort uuid, p uuid, p_classroom uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from classroom_staff where classroom_id = p_classroom and person_id = p),
    (select 'operations' from cohort_roles where cohort_id = p_cohort and person_id = p and role = 'overseer'))
$$;

create or replace function review_targets() returns table (cohort_id uuid, cohort_name text, classroom_id uuid, subject_id uuid,
  subject_name text, subject_role text, my_role text, closes date, done boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select cl.cohort_id, cl.id as classroom_id, cs.role as my_role from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id where cs.person_id = me()
    union
    select cr.cohort_id, cl.id, 'operations' from cohort_roles cr join classrooms cl on cl.cohort_id = cr.cohort_id where cr.person_id = me() and cr.role = 'overseer'
  ), team as (
    select m.cohort_id, m.classroom_id, m.my_role, cs.person_id as subject_id, cs.role as subject_role
    from mine m join classroom_staff cs on cs.classroom_id = m.classroom_id where cs.person_id <> me()
    union
    select m.cohort_id, m.classroom_id, m.my_role, cr.person_id, 'operations'
    from mine m join cohort_roles cr on cr.cohort_id = m.cohort_id and cr.role = 'overseer' where cr.person_id <> me() and m.my_role <> 'operations'
  )
  select t.cohort_id, co.name, t.classroom_id, t.subject_id, p.full_name, t.subject_role, t.my_role,
         co.end_date + coalesce((_setting('review_360_window_days')->>'days')::int, 14),
         exists (select 1 from reviews_360 r where r.cohort_id = t.cohort_id and r.reviewer_id = me() and r.subject_id = t.subject_id)
  from team t join cohorts co on co.id = t.cohort_id join people p on p.id = t.subject_id
  where co.end_date <= current_date
    and current_date <= co.end_date + coalesce((_setting('review_360_window_days')->>'days')::int, 14)
    and _setting('review_360_items') ? (t.my_role || '>' || t.subject_role)
$$;

create or replace function review_submit(p_cohort uuid, p_classroom uuid, p_subject uuid, p_items jsonb, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare v_mine text; v_theirs text; v_keys jsonb; k text;
begin
  perform _require(exists (select 1 from review_targets() t where t.cohort_id = p_cohort and t.subject_id = p_subject and t.classroom_id = p_classroom and not t.done),
                   'This review is not open for you (reviews stay inside your classroom team and close 14 days after the cohort ends)');
  v_mine := _team_role(p_cohort, me(), p_classroom);
  v_theirs := _team_role(p_cohort, p_subject, p_classroom);
  v_keys := _setting('review_360_items')->(v_mine || '>' || v_theirs);
  for k in select jsonb_array_elements(v_keys)->>'key' loop
    perform _require((p_items->>k)::int between 1 and 5, 'Rate every item from 1 to 5');
  end loop;
  insert into reviews_360 (cohort_id, classroom_id, reviewer_id, subject_id, reviewer_role, subject_role, items, comment)
  values (p_cohort, p_classroom, me(), p_subject, v_mine, v_theirs, p_items, nullif(trim(coalesce(p_comment,'')),''));
  perform _log('review360.submit', 'cohort', p_cohort::text, null);   -- reviewer is logged, the scores are not
end $$;

-- Aggregates only, never who gave which score; shown at 3 or more reviewers.
create or replace function review_aggregate(p_person uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b record; v_n int; v_avg numeric; v_min int := coalesce((_setting('review_360_min_reviewers')->>'n')::int, 3); v_items jsonb; v_comments jsonb;
begin
  if not can_see_scores(p_person) then return null; end if;
  select * into b from period_bounds(p_period);
  select count(distinct r.reviewer_id), avg((select avg(value::numeric) from jsonb_each_text(r.items)))
    into v_n, v_avg
  from reviews_360 r join cohorts c on c.id = r.cohort_id
  where r.subject_id = p_person and c.end_date between b.d_from and b.d_to;
  if v_n < v_min then
    return jsonb_build_object('n', v_n, 'valid', false, 'min', v_min);
  end if;
  select jsonb_object_agg(key, round(a, 2)) into v_items from (
    select e.key, avg(e.value::numeric) a from reviews_360 r join cohorts c on c.id = r.cohort_id, jsonb_each_text(r.items) e
    where r.subject_id = p_person and c.end_date between b.d_from and b.d_to group by e.key) x;
  select coalesce(jsonb_agg(comment order by random()), '[]') into v_comments from reviews_360 r join cohorts c on c.id = r.cohort_id
    where r.subject_id = p_person and c.end_date between b.d_from and b.d_to and comment is not null;
  return jsonb_build_object('n', v_n, 'valid', true, 'avg', round(v_avg, 2), 'score', round(v_avg / 5 * 100, 1), 'items', v_items, 'comments', v_comments);
end $$;

-- ══ JD checklist and accountability ═══════════════════════
create or replace function jd_confirm(p_person uuid, p_cohort uuid, p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(owns_person(p_person) or senior_assigned(p_person) or leads_person(p_person) or has_role('education_principal'),
                   'Only the person''s lead can confirm checklist items');
  insert into jd_ticks (person_id, cohort_id, item_id, done, source, confirmed_by, confirmed_at)
  values (p_person, p_cohort, p_item, p_done, 'lead', me(), now())
  on conflict (person_id, cohort_id, item_id) do update set done = excluded.done, source = 'lead', confirmed_by = me(), confirmed_at = now();
  perform _log('jd.confirm', 'person', p_person::text, jsonb_build_object('item', p_item, 'done', p_done));
end $$;

create or replace function accountability_add(p_person uuid, p_cohort uuid, p_label text, p_score numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(owns_person(p_person) or (has_role('operations') and oversees_cohort(p_cohort)), 'Only the segment owner or the overseer can add accountability entries');
  insert into accountability_entries (person_id, cohort_id, label, score, entered_by) values (p_person, p_cohort, p_label, p_score, me());
  perform _log('accountability.add', 'person', p_person::text, jsonb_build_object('label', p_label, 'score', p_score));
end $$;

-- ══ Platform: notifications, reminders, admin ═════════════
create or replace function notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where person_id = me() and read_at is null and (p_ids is null or id = any(p_ids))
$$;

create or replace function remind_person(p_person uuid, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(has_role('operations') or has_role('segment_owner') or has_role('senior_instructor'), 'Not allowed');
  perform _notify(p_person, p_title, p_body, p_link, null);
  perform _log('remind', 'person', p_person::text, jsonb_build_object('title', p_title));
end $$;

create or replace function settings_set(p_key text, p_value jsonb, p_status text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(has_role('system_owner'), 'Only the system owner can change settings');
  update settings set value = p_value, status = coalesce(p_status, status), updated_by = me(), updated_at = now() where key = p_key;
  perform _log('settings.set', 'settings', p_key, p_value);
end $$;

create or replace function scoring_template_save(p_id uuid, p_name text, p_scope_type text, p_scope_id text, p_weights jsonb, p_gates jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_old scoring_templates; v_id uuid; v_sum numeric;
begin
  perform _require(has_role('system_owner') or has_role('education_principal'), 'Only the system owner or the Education Principal can change scoring templates');
  select coalesce(sum(value::numeric),0) into v_sum from jsonb_each_text(p_weights);
  perform _require(v_sum = 100, 'Weights must add up to 100 (now ' || v_sum || ')');
  if p_id is not null then
    select * into v_old from scoring_templates where id = p_id;
    update scoring_templates set active = false where id = p_id;
  end if;
  insert into scoring_templates (name, scope_type, scope_id, weights, gates, version, created_by, status)
  values (p_name, p_scope_type, p_scope_id, p_weights, p_gates, coalesce(v_old.version, 0) + 1, me(),
          case when has_role('education_principal') then 'decided' else 'draft_review' end)
  returning id into v_id;
  perform _log('scoring_template.save', 'scoring_template', v_id::text, jsonb_build_object('weights', p_weights, 'gates', p_gates, 'previous', p_id));
  return v_id;
end $$;

create or replace function qa_template_save(p_key text, p_name text, p_kind text, p_focus text, p_subjects text[], p_rubric jsonb,
  p_special boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ver int; v_id uuid;
begin
  perform _require(has_role('system_owner') or has_role('education_principal') or has_role('senior_instructor'), 'Not allowed to edit templates');
  select coalesce(max(version),0) + 1 into v_ver from qa_templates where key = p_key;
  update qa_templates set status = 'retired' where key = p_key and status <> 'retired';
  insert into qa_templates (key, name, kind, focus, subjects, rubric, version, status, is_special, created_by)
  values (p_key, p_name, p_kind, p_focus, p_subjects, p_rubric, v_ver,
          case when has_role('education_principal') then 'active' else 'draft_review' end, coalesce(p_special,false), me())
  returning id into v_id;
  perform _log('qa_template.save', 'qa_template', v_id::text, jsonb_build_object('key', p_key, 'version', v_ver));
  return v_id;
end $$;

create or replace function person_set_roles(p_person uuid, p_roles text[], p_owned text[], p_full_timer boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_old people;
begin
  perform _require(has_role('system_owner'), 'Only the system owner can change roles and access');
  select * into v_old from people where id = p_person;
  update people set roles = p_roles, owned_segments = coalesce(p_owned,'{}'), is_full_timer = coalesce(p_full_timer, is_full_timer) where id = p_person;
  perform _log('access.roles', 'person', p_person::text, jsonb_build_object('before', v_old.roles, 'after', p_roles, 'owned', p_owned));
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
-- Internal helpers are not callable from the app.
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text) from authenticated;
