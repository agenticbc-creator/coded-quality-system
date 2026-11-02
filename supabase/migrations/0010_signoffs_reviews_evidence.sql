-- 0010 · Second round: cohort sign-offs, plan reviews, evidence, decline hand-over, imports, email and guides.
-- Run once on top of 0001–0009, in the Supabase SQL editor. Every function keeps its signature; new ones are additive.
-- Draft rules (signal levels, scoring guides, Kids age brackets) are stored as draft_review for Education to sign off.

-- ══ 0. Migration level, read by the screens ═════════════════
insert into settings (key, label, value, status, note) values
('schema_version', 'Database migration level', '{"v":10}', 'decided', 'Written by migration 0010. The screens use it to switch on new features.')
on conflict (key) do update set value = excluded.value;

-- ══ 1. New columns ═══════════════════════════════════════════
alter table plans add column if not exists outcome text check (outcome in ('met','extended','escalated','hr_review'));
alter table plans add column if not exists reviewed_at timestamptz;
alter table plans add column if not exists reviewed_by uuid references people(id);
alter table plans add column if not exists review_note text;
alter table cohorts add column if not exists staffing_approved_at timestamptz;
alter table cohorts add column if not exists staffing_approved_by uuid references people(id);
alter table cohorts add column if not exists qa_plan_approved_at timestamptz;
alter table cohorts add column if not exists qa_plan_approved_by uuid references people(id);
alter table visits add column if not exists evidence jsonb not null default '[]';
alter table notifications add column if not exists emailed_at timestamptz;

-- Cohorts already live or closed were started under the old rule; record that, so they are not shown as unapproved.
update cohorts set staffing_approved_at = coalesce(went_live_at, now()), qa_plan_approved_at = coalesce(went_live_at, now())
where status in ('live','closed') and staffing_approved_at is null;

-- ══ 2. Contract statuses: the full ERPNext approval chain ═════
alter table erp_contracts drop constraint if exists erp_contracts_status_check;
alter table erp_contracts add constraint erp_contracts_status_check check (status in (
  'Draft','Pending Approval','Pending Verification','Pending COO Signature','COO Signed','Sent to Contractor','Contractor Signed','Active',
  'Approved','Completed','Cancelled'));  -- Approved, Completed and Cancelled kept for records read before this change

-- The contract approval step accepts a contract the contractor has signed (or one already active).
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
      where person_id = pl.person_id and status in ('Approved','Contractor Signed','Active') and signed_at is not null
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

-- ══ 3. Draft rules for Education to sign off ═══════════════
insert into settings (key, label, value, status, note) values
('signal_thresholds', 'Signal levels: watch and act now',
 '{"attendance_on_time":{"act_below":85},"ungraded_backlog":{"act_from":5},"completion":{"act_below":50},"pulse":{"act_below":3}}',
 'draft_review', 'Example levels. Watch shows for any miss; act now shows at these levels. Education sets the final numbers.'),
('scoring_anchors', 'Scoring guide shown under each rubric item',
 '{"none":"Not seen in this visit","low":"Seen once or for some learners","mid":"Seen often, with gaps","max":"Seen throughout, for every learner"}',
 'draft_review', 'A general guide until Education writes item-by-item anchors.')
on conflict (key) do nothing;

-- Kids age brackets (draft templates; picked by hand until Education approves them)
insert into qa_templates (key, name, kind, focus, subjects, status, segment_id, rubric)
select k, n, 'education_qa', 'class', '{instructor,ta,class}', 'draft_review', 'kids',
  jsonb_set(t.rubric, '{class,sections,0,items,0,label}', to_jsonb(l))
from qa_templates t,
  (values ('edu_class_kids_6_7',  'Education QA — class visit (Kids 6–7)',  'Children are on task; activities under 10 minutes, with movement breaks'),
          ('edu_class_kids_8_10', 'Education QA — class visit (Kids 8–10)', 'Children are on task; activities under 15 minutes, hands-on first'),
          ('edu_class_kids_11_13','Education QA — class visit (Kids 11–13)','Children are on task; activities under 20 minutes, pair work and short explanations')) v(k, n, l)
where t.key = 'edu_class_kids' and t.version = (select max(version) from qa_templates where key = 'edu_class_kids')
  and not exists (select 1 from qa_templates x where x.key = v.k);

-- ══ 4. Cohort sign-offs: staffing and the QA plan ═══════════
-- The age-bracket drafts are chosen by hand on the booking form; the automatic pick keeps using edu_class_kids.
create or replace function _template_for(p_kind text, p_qa_type text, p_seg text default null) returns uuid
language sql stable security definer set search_path = public as $$
  select id from qa_templates
  where status <> 'retired' and not is_special
    and kind = case when p_kind = 'shadowing' then 'shadowing' when p_qa_type = 'operations' then 'operations_qa' else 'education_qa' end
    and (segment_id is null or segment_id = p_seg)
    and key !~ '^edu_class_kids_[0-9]'
  order by (segment_id is not distinct from p_seg and p_seg is not null) desc, (focus = 'class') desc, version desc, key limit 1
$$;

create or replace function cohort_approve(p_cohort uuid, p_what text) returns void
language plpgsql security definer set search_path = public as $$
declare co cohorts;
begin
  select * into co from cohorts where id = p_cohort;
  perform _require(co.id is not null, 'Cohort not found');
  perform _require(owns_cohort(p_cohort), 'Only the segment owner signs off staffing and the QA plan');
  perform _require(p_what in ('staffing','qa_plan'), 'Unknown sign-off');
  if p_what = 'staffing' then
    perform _require(exists (select 1 from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id where cl.cohort_id = p_cohort and cs.role = 'instructor'),
                     'Assign the instructors before approving the staffing');
    update cohorts set staffing_approved_at = now(), staffing_approved_by = me() where id = p_cohort;
  else
    perform _require(co.qa_plan is not null or exists (select 1 from visits where cohort_id = p_cohort and kind = 'qa' and status <> 'cancelled'),
                     'Generate or book the QA plan before approving it');
    update cohorts set qa_plan_approved_at = now(), qa_plan_approved_by = me() where id = p_cohort;
  end if;
  perform _log('cohort.approve.' || p_what, 'cohort', p_cohort::text, null);
end $$;

-- A change to the team or the plan before Day 1 asks for the sign-off again.
create or replace function _staffing_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid := (select cohort_id from classrooms where id = coalesce(new.classroom_id, old.classroom_id));
begin
  update cohorts set staffing_approved_at = null, staffing_approved_by = null where id = v_cohort and status = 'setup';
  return null;
end $$;
drop trigger if exists staffing_changed on classroom_staff;
create trigger staffing_changed after insert or update or delete on classroom_staff for each row execute function _staffing_changed();

create or replace function _qa_plan_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'setup' and new.qa_plan is distinct from old.qa_plan and new.qa_plan_approved_at is not distinct from old.qa_plan_approved_at then
    new.qa_plan_approved_at := null; new.qa_plan_approved_by := null;
  end if;
  return new;
end $$;
drop trigger if exists qa_plan_changed on cohorts;
create trigger qa_plan_changed before update on cohorts for each row execute function _qa_plan_changed();

create or replace function _qa_visits_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'qa' and new.focus <> 'alignment' and (tg_op = 'INSERT' or (new.status = 'cancelled' and old.status <> 'cancelled')) then
    update cohorts set qa_plan_approved_at = null, qa_plan_approved_by = null where id = new.cohort_id and status = 'setup';
  end if;
  return null;
end $$;
drop trigger if exists qa_visits_changed on visits;
create trigger qa_visits_changed after insert or update of status on visits for each row execute function _qa_visits_changed();

-- Readiness now also needs both sign-offs; an alignment visit before Day 1 is a warning.
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
  if co.staffing_approved_at is null then b := b || 'The segment owner has not approved the staffing'::text; end if;
  if co.qa_plan_approved_at is null then b := b || 'The segment owner has not approved the QA plan'::text; end if;
  if not exists (select 1 from visits where cohort_id = p_cohort and focus = 'alignment' and status <> 'cancelled'
                 and (scheduled_for at time zone 'Asia/Kuwait')::date <= co.start_date) then
    w := w || 'No alignment visit is booked before Day 1'::text;
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

-- Score everyone on one cohort's team in one go (the segment owner or the Education Principal).
create or replace function cohort_score(p_cohort uuid, p_period text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p uuid; n int := 0; v_seg text := cohort_segment(p_cohort);
begin
  perform _require(owns_cohort(p_cohort) or has_role('education_principal'), 'Only the segment owner or the Education Principal scores a cohort');
  perform _require(p_period ~ '^[0-9]{4}-Q[1-4]$', 'Pick a quarter, for example 2026-Q4');
  perform _require(exists (select 1 from cohorts co, period_bounds(p_period) b where co.id = p_cohort and co.start_date <= b.d_to and co.end_date >= b.d_from),
                   'This cohort did not run in that quarter');
  for p in select distinct cs.person_id from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id where cl.cohort_id = p_cohort loop
    perform _compute_one(p, p_period, v_seg);
    n := n + 1;
  end loop;
  perform _log('composites.compute.cohort', 'cohort', p_cohort::text, jsonb_build_object('period', p_period, 'people', n));
  return jsonb_build_object('people', n);
end $$;

-- Released QA results for one person, split by segment (someone who teaches in Kids and Professionals sees both).
create or replace function person_segment_scores(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not can_see_scores(p_person) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('segment', x.seg, 'name', x.name, 'avg_pct', x.avg_pct, 'visits', x.n, 'last', x.last) order by x.last desc)
    from (select pr.segment_id seg, sg.name, round(avg(vs.pct), 1) avg_pct, count(distinct v.id) n, max(v.submitted_at) last
          from visit_scores vs join visits v on v.id = vs.visit_id join cohorts co on co.id = v.cohort_id
          join programs pr on pr.id = co.program_id join segments sg on sg.id = pr.segment_id
          where vs.subject_person_id = p_person and v.kind = 'qa' and v.release_status = 'released'
          group by pr.segment_id, sg.name) x), '[]'::jsonb) end
$$;

-- ══ 5. Plan reviews: every Coaching or Improvement Plan ends with a recorded outcome ══
create or replace function plan_review(p_plan uuid, p_outcome text, p_note text, p_new_due date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pl plans; v_id uuid := p_plan; v_name text; h uuid; v_outcome text := p_outcome;
begin
  select * into pl from plans where id = p_plan;
  perform _require(pl.id is not null, 'Plan not found');
  perform _require(owns_person(pl.person_id), 'Only the segment owner reviews plans');
  perform _require(pl.status = 'open', 'This plan is already closed');
  perform _require(v_outcome in ('met','extended','escalated','hr_review'), 'Pick the outcome');
  perform _require(length(trim(coalesce(p_note,''))) > 0, 'Write a short note on what you saw');
  select full_name into v_name from people where id = pl.person_id;
  if v_outcome = 'escalated' and pl.kind = 'improvement' then v_outcome := 'hr_review'; end if;

  if v_outcome = 'extended' then
    perform _require(p_new_due is not null and p_new_due > current_date, 'Pick the new review date');
    update plans set due = p_new_due, outcome = 'extended', reviewed_at = now(), reviewed_by = me(), review_note = p_note where id = p_plan;
    perform _notify(pl.person_id, 'Plan extended', 'Next review ' || to_char(p_new_due, 'DD Mon') || '.', '/me#plans', 'planrev:' || p_plan || ':' || current_date);
  else
    update plans set status = 'closed', outcome = v_outcome, reviewed_at = now(), reviewed_by = me(), review_note = p_note where id = p_plan;
    if v_outcome = 'escalated' then
      insert into plans (person_id, kind, composite_id, due, goals, opened_by)
      values (pl.person_id, 'improvement', pl.composite_id, coalesce(p_new_due, current_date + 30),
              coalesce((select jsonb_agg(g) from jsonb_array_elements(pl.goals) g where not coalesce((g->>'done')::boolean, false)), '[]'), me())
      returning id into v_id;
      perform _notify(pl.person_id, 'Improvement Plan opened', 'Your Coaching Plan review moved to an Improvement Plan. Your segment owner will go through it with you.', '/me#plans', 'planesc:' || p_plan);
    elsif v_outcome = 'hr_review' then
      for h in select _people_with_role('hr') loop
        perform _notify(h, 'HR review: ' || v_name, 'The Improvement Plan review asks for HR to step in.', '/people/' || pl.person_id, 'planhr:' || p_plan);
      end loop;
      perform _notify(pl.person_id, 'Plan review recorded', 'Your segment owner has asked HR to join the next step.', '/me#plans', 'planrev:' || p_plan);
    else
      perform _notify(pl.person_id, 'Plan goals met', 'Your plan is closed. Well done.', '/me#plans', 'planrev:' || p_plan);
    end if;
  end if;
  perform _log('plan.review', 'plan', p_plan::text, jsonb_build_object('outcome', v_outcome, 'new_plan', case when v_id <> p_plan then v_id end));
  return v_id;
end $$;

-- ══ 6. A declined visit goes straight to the next eligible observer ══
create or replace function _next_assignee(p_visit uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from visits v, people p
  where v.id = p_visit and p.id <> coalesce(v.assignee_id, '00000000-0000-0000-0000-000000000000')
    and not exists (select 1 from audit_log l where l.action = 'visit.decline' and l.entity_id = p_visit::text and l.actor_id = p.id)
    and case
      when v.kind = 'shadowing' then p.id in (select person_id from cohort_roles where cohort_id = v.cohort_id) or 'education_officer' = any(p.roles)
      when v.qa_type = 'operations' then 'operations' = any(p.roles)
      else ('education_officer' = any(p.roles) or 'senior_instructor' = any(p.roles)) and p.is_full_timer
    end
    and (v.kind = 'shadowing' or _can_qa(p.id, v.qa_type, cohort_segment(v.cohort_id)))
    and p.id not in (select person_id from classroom_staff where classroom_id = v.classroom_id)
    and not exists (select 1 from erp_availability a where a.person_id = p.id and (v.scheduled_for at time zone 'Asia/Kuwait')::date between a.from_date and a.to_date)
  order by (select count(*) from visits x where x.cohort_id = v.cohort_id and x.assignee_id = p.id), p.full_name
  limit 1
$$;
create or replace function visit_respond(p_visit uuid, p_action text, p_when timestamptz default null, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; o uuid; v_is_owner boolean; v_next uuid;
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
    perform _require(not (v.kind = 'qa' and v.qa_type = 'education' and v.focus <> 'alignment' and v.classroom_id is not null)
                     or not exists (select 1 from app_sessions where classroom_id = v.classroom_id
                                    and (starts_at at time zone 'Asia/Kuwait')::date >= (p_when at time zone 'Asia/Kuwait')::date)
                     or exists (select 1 from app_sessions s where s.classroom_id = v.classroom_id
                                and (s.starts_at at time zone 'Asia/Kuwait')::date = (p_when at time zone 'Asia/Kuwait')::date),
                     'This classroom has no class that day in the CODED App timetable. Pick a teaching day.');
    update visits set scheduled_for = p_when, status = 'accepted' where id = p_visit;
  elsif p_action = 'decline' then
    -- Goes back to the scheduler's queue so it is replaced, not forgotten.
    v_next := _next_assignee(p_visit);
    update visits set assignee_id = v_next, status = case when v_next is null then 'planned' else 'invited' end where id = p_visit;
    if v_next is not null then
      perform _notify(v_next, 'Visit invite (passed on)', to_char(v.scheduled_for at time zone 'Asia/Kuwait', 'Dy DD Mon, HH24:MI') || ' — the first observer declined',
        '/visits/' || p_visit, 'invite:' || p_visit || ':' || v_next);
    end if;
  elsif p_action = 'cancel' then
    perform _require(v_is_owner, 'Only the segment owner can cancel a visit outright');
    update visits set status = 'cancelled' where id = p_visit;
  else
    perform _require(false, 'Unknown action');
  end if;
  for o in select _segment_owners(cohort_segment(v.cohort_id)) union select v.created_by loop
    if o <> me() then
      perform _notify(o, case p_action when 'accept' then 'Visit accepted' when 'reschedule' then 'Visit rescheduled'
                        when 'decline' then case when v_next is null then 'Visit declined — needs a new observer' else 'Visit declined — passed to the next observer' end else 'Visit cancelled' end,
        coalesce(p_reason, ''), '/visits/' || p_visit, null);
    end if;
  end loop;
  perform _log('visit.' || p_action, 'visit', p_visit::text, jsonb_build_object('when', p_when, 'reason', p_reason));
end $$;

-- ══ 7. Visit context: live signals, and the One Thing from this cohort first ══
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
    'previous_one_thing', (select coalesce(jsonb_agg(jsonb_build_object('person', x.subject_id, 'one_thing', x.one_thing, 'at', x.released_at, 'same_cohort', x.same) order by x.released_at desc), '[]')
             from (select distinct on (rf.subject_id) rf.subject_id, rf.one_thing, rf.released_at, coalesce(rf.cohort_id = v.cohort_id, false) same
                   from released_feedback rf where rf.one_thing is not null
                     and rf.subject_id in (select person_id from classroom_staff where classroom_id = v.classroom_id)
                   order by rf.subject_id, coalesce(rf.cohort_id = v.cohort_id, false) desc, rf.released_at desc) x),
    'signals', live_signals(v.classroom_id)
  ) into r;
  return r;
end $$;

-- ══ 8. A senior instructor sees visit scores once they are released (or for visits they observed) ══
create or replace function visit_score_visible(vid uuid, subj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from visits v where v.id = vid and (
      v.assignee_id = me()
      or has_role('education_principal')
      or owns_cohort(v.cohort_id)
      or (senior_on_cohort(v.cohort_id) and v.release_status = 'released')
      or (v.release_status = 'released' and (subj = me() or leads_person(subj)))
      or (v.qa_type = 'operations' and has_role('operations') and oversees_cohort(v.cohort_id))
    )
  )
$$;

-- ══ 9. Scheduling: an education class visit must fall on a teaching day ══
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
  perform _require(p_kind <> 'qa' or p_qa_type <> 'education' or p_classroom is null or coalesce(p_focus, 'class') = 'alignment'
                   or not exists (select 1 from app_sessions where classroom_id = p_classroom  -- timetable does not reach that date yet
                              and (starts_at at time zone 'Asia/Kuwait')::date >= (p_when at time zone 'Asia/Kuwait')::date)
                   or exists (select 1 from app_sessions s where s.classroom_id = p_classroom
                              and (s.starts_at at time zone 'Asia/Kuwait')::date = (p_when at time zone 'Asia/Kuwait')::date),
                   'This classroom has no class that day in the CODED App timetable. Pick a teaching day.');
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

-- ══ 10. Release text without internal codes ══
create or replace function feedback_review(p_id uuid, p_decision text, p_text text, p_channel text, p_merge_into uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback; v_title text;
begin
  select * into f from feedback where id = p_id;
  perform _require(f.id is not null, 'Note not found');
  perform _require(owns_person(f.subject_id), 'Only the segment owner releases feedback');
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

-- An author can correct their own note until the segment owner has reviewed it.
create or replace function feedback_update_own(p_id uuid, p_type text, p_severity text, p_body text, p_red_flag_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  select * into f from feedback where id = p_id;
  perform _require(f.id is not null and f.author_id = me(), 'You can only change notes you wrote');
  perform _require(f.status = 'private' and f.reviewed_at is null, 'This note has been reviewed; ask the segment owner to change it');
  perform _require(length(trim(coalesce(p_body,''))) > 0, 'Write what you saw');
  perform _require(coalesce(p_severity, f.severity) <> 'red_flag' or f.severity = 'red_flag', 'Log a new note for a red flag, so the segment owner is alerted the same day');
  update feedback set type = coalesce(p_type, type), severity = coalesce(p_severity, severity), body = p_body,
    red_flag_reason = coalesce(p_red_flag_reason, red_flag_reason), updated_at = now() where id = p_id;
  perform _log('feedback.author_edit', 'feedback', p_id::text, jsonb_build_object('length_before', length(f.body)));
end $$;

-- ══ 11. Evidence: photos and voice notes in private storage ══
-- Paths: visit/<visit id>/<file> (the observer, before submitting) and feedback/<author id>/<file> (the note's author).
create or replace function evidence_writable(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a text[] := string_to_array(p_name, '/');
begin
  if a[1] = 'visit' then
    return exists (select 1 from visits v where v.id::text = a[2] and v.assignee_id = me() and v.submitted_at is null);
  elsif a[1] = 'feedback' then
    return a[2] = me()::text;
  end if;
  return false;
end $$;
create or replace function evidence_visible(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a text[] := string_to_array(p_name, '/');
begin
  if a[1] = 'visit' then
    return exists (select 1 from visits v where v.id::text = a[2] and (v.assignee_id = me() or owns_cohort(v.cohort_id) or has_role('education_principal')));
  elsif a[1] = 'feedback' then
    return a[2] = me()::text or exists (select 1 from feedback f where f.attachment_url = 'evidence:' || p_name and f.author_id::text = a[2]
                                           and (owns_person(f.subject_id) or has_role('education_principal')));
  end if;
  return false;
end $$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit) values ('evidence', 'evidence', false, 15728640) on conflict (id) do nothing;
  drop policy if exists evidence_insert on storage.objects;
  drop policy if exists evidence_read on storage.objects;
  create policy evidence_insert on storage.objects for insert to authenticated with check (bucket_id = 'evidence' and public.evidence_writable(name));
  create policy evidence_read on storage.objects for select to authenticated using (bucket_id = 'evidence' and public.evidence_visible(name));
exception when others then
  raise notice 'Storage is not available here (%). Evidence upload stays off until this block runs.', sqlerrm;
end $$;

create or replace function visit_evidence_add(p_visit uuid, p_path text, p_kind text, p_label text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  perform _require(v.id is not null and v.assignee_id = me(), 'Only the observer adds evidence');
  perform _require(v.submitted_at is null, 'This visit is already submitted');
  perform _require(p_path like 'visit/' || p_visit || '/%', 'Wrong file location');
  perform _require(p_kind in ('photo','voice','file'), 'Unknown evidence type');
  update visits set evidence = evidence || jsonb_build_array(jsonb_build_object('path', p_path, 'kind', p_kind, 'label', p_label, 'at', now())) where id = p_visit;
  perform _log('visit.evidence', 'visit', p_visit::text, jsonb_build_object('kind', p_kind));
end $$;

-- ══ 12. People: the system owner adds people; an invited person claims their record on first sign-in ══
create or replace function person_add(p_full_name text, p_email text, p_roles text[], p_home_segment text,
  p_owned text[] default '{}', p_full_timer boolean default false, p_arabic text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_bad text;
begin
  perform _require(has_role('system_owner'), 'Only the system owner adds people');
  perform _require(length(trim(coalesce(p_full_name,''))) > 1, 'Write the full name');
  perform _require(coalesce(p_email,'') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Write a valid email');
  perform _require(not exists (select 1 from people where lower(email) = lower(p_email)), 'Someone with this email already has a record');
  select r into v_bad from unnest(coalesce(p_roles,'{}')) r where r not in ('segment_owner','education_principal','senior_instructor','instructor','ta',
    'education_officer','education_coordinator','program_coordinator','operations','lead_instructor','content_creator','hr','gm','system_owner','cctp_candidate','candidate') limit 1;
  perform _require(v_bad is null, 'Unknown role: ' || coalesce(v_bad,''));
  perform _require(p_home_segment is null or exists (select 1 from segments where id = p_home_segment), 'Unknown segment');
  insert into people (full_name, arabic_name, email, roles, home_segment, owned_segments, is_full_timer)
  values (trim(p_full_name), p_arabic, lower(trim(p_email)), coalesce(p_roles,'{}'), p_home_segment, coalesce(p_owned,'{}'), coalesce(p_full_timer,false))
  returning id into v_id;
  perform _log('person.add', 'person', v_id::text, jsonb_build_object('roles', p_roles, 'segment', p_home_segment));
  return v_id;
end $$;

create or replace function claim_my_record() returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid := me(); v_email text;
begin
  if v_id is not null or auth.uid() is null then return v_id; end if;
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return null; end if;
  update people set auth_user_id = auth.uid() where auth_user_id is null and lower(email) = lower(v_email) returning id into v_id;
  if v_id is not null then perform _log('person.claim', 'person', v_id::text, null); end if;
  return v_id;
end $$;

-- ══ 13. Imports from ERPNext and the CODED App (CSV, by the system owner) ══
-- Use only on a database CODED has agreed may hold real people's records.
create or replace function import_contractors(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n_new int := 0; n_upd int := 0; v_id uuid;
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
      insert into people (full_name, arabic_name, email, roles, home_segment, erp_supplier_id, erp_service_category, erp_instructor_level, erp_contractor_status)
      values (r->>'full_name', r->>'arabic_name', nullif(lower(r->>'email'),''), array['instructor'], nullif(r->>'home_segment',''),
              r->>'erp_supplier_id', r->>'service_category', r->>'instructor_level', coalesce(r->>'contractor_status','Active'));
      n_new := n_new + 1;
    else
      update people set full_name = r->>'full_name', arabic_name = coalesce(r->>'arabic_name', arabic_name),
        erp_service_category = coalesce(r->>'service_category', erp_service_category), erp_instructor_level = coalesce(r->>'instructor_level', erp_instructor_level),
        erp_contractor_status = coalesce(r->>'contractor_status', erp_contractor_status) where id = v_id;
      n_upd := n_upd + 1;
    end if;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('erpnext', now(), 'ok', n_new + n_upd, 'Contractors imported from a CSV');
  perform _log('import.contractors', 'people', null, jsonb_build_object('new', n_new, 'updated', n_upd));
  return jsonb_build_object('new', n_new, 'updated', n_upd);
end $$;

create or replace function import_sessions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; s int := 0;
begin
  perform _require(has_role('system_owner'), 'Only the system owner imports records');
  perform _require(jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) between 1 and 5000, 'Send between 1 and 5,000 rows');
  for r in select * from jsonb_array_elements(p_rows) loop
    perform _require(exists (select 1 from classrooms where id::text = r->>'classroom_id'), 'Unknown classroom_id ' || coalesce(r->>'classroom_id',''));
    if exists (select 1 from app_sessions where classroom_id = (r->>'classroom_id')::uuid and starts_at = (r->>'starts_at')::timestamptz) then
      s := s + 1;
    else
      insert into app_sessions (classroom_id, starts_at, topic, attendance_logged_at)
      values ((r->>'classroom_id')::uuid, (r->>'starts_at')::timestamptz, r->>'topic', nullif(r->>'attendance_logged_at','')::timestamptz);
      n := n + 1;
    end if;
  end loop;
  insert into sync_runs (source, finished_at, status, records, message) values ('coded_app', now(), 'ok', n, 'Timetable imported from a CSV');
  perform _log('import.sessions', 'app_sessions', null, jsonb_build_object('new', n, 'skipped', s));
  return jsonb_build_object('new', n, 'skipped', s);
end $$;

-- ══ 14. Privileges (as at the end of 0009, plus the new internal helpers) ══
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions(), _unscored_items(jsonb, text, jsonb, text[]), _next_assignee(uuid), _staffing_changed(), _qa_plan_changed(), _qa_visits_changed() from authenticated;
