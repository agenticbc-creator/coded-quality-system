-- 0013 · Staffing works before ERPNext contracts are imported; owners can clear an approved contractor and give an
-- imported record its sign-in email. Run once after 0012 (safe to run again).

insert into settings (key, label, value, status, note) values
('schema_version', 'Database migration level', '{"v":13}', 'decided', 'Written by migration 0013.'),
('staffing_rules', 'Staffing rules', '{"require_active_contract": false}', 'decided',
 'require_active_contract: true once ERPNext contracts are imported (System → Imports). While false, the cohort page warns instead of refusing.')
on conflict (key) do update set value = case when settings.key = 'schema_version' then excluded.value else settings.value end;

-- ══ 1. Assigning a classroom: the Active-contract check follows the staffing_rules setting ══
create or replace function classroom_assign(p_classroom uuid, p_person uuid, p_role text, p_is_lead boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid := classroom_cohort(p_classroom); v_seg text; v_person people;
begin
  v_seg := cohort_segment(v_cohort);
  perform _require(_can_staff(v_cohort), 'Only the segment owner or Operations can staff classrooms');
  perform _require(p_role in ('instructor','ta'), 'Pick instructor or TA');
  select * into v_person from people where id = p_person;
  perform _require(v_person.id is not null, 'Person not found');
  perform _require(v_person.approval_status = 'cleared', v_person.full_name || ' is not cleared to teach yet');
  perform _require(coalesce((_setting('staffing_rules')->>'require_active_contract')::boolean, false) is not true
                   or exists (select 1 from erp_contracts where person_id = p_person and status = 'Active'
                              and (cohort_id = v_cohort or (cohort_id is null and (segment_id = v_seg or segment_id is null)))),
                   v_person.full_name || ' has no Active contract in ERPNext for this cohort');
  insert into classroom_staff (classroom_id, person_id, role, is_lead) values (p_classroom, p_person, p_role, coalesce(p_is_lead,false))
  on conflict (classroom_id, person_id) do update set role = excluded.role, is_lead = excluded.is_lead;
  perform _log('classroom.assign', 'cohort', v_cohort::text, jsonb_build_object('classroom', p_classroom, 'person', p_person, 'role', p_role));
end $$;

-- ══ 2. Clear an approved contractor to teach (or take it back), with the reason in the audit log ══
create or replace function person_set_approval(p_person uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v people;
begin
  select * into v from people where id = p_person;
  perform _require(v.id is not null, 'Person not found');
  perform _require(owns_person(p_person) or has_role('education_principal') or has_role('system_owner'),
                   'Only the segment owner or the Education Principal clears people to teach');
  perform _require(p_status in ('cleared','not_started'), 'Unknown approval status');
  perform _require(length(trim(coalesce(p_reason,''))) >= 5, 'Write why (for example: hired and approved in ERPNext)');
  perform _require(not exists (select 1 from pipelines where person_id = p_person and status = 'in_pipeline'),
                   v.full_name || ' is in the approval pipeline; finish it there');
  update people set approval_status = p_status where id = p_person;
  perform _log('person.approval', 'person', p_person::text, jsonb_build_object('from', v.approval_status, 'to', p_status, 'reason', trim(p_reason)));
end $$;

-- ══ 3. Give an existing record its sign-in email (imports arrive without one) ══
create or replace function person_set_email(p_person uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v people; e text := lower(trim(coalesce(p_email,'')));
begin
  perform _require(has_role('system_owner'), 'Only the system owner sets sign-in emails');
  select * into v from people where id = p_person;
  perform _require(v.id is not null, 'Person not found');
  perform _require(v.auth_user_id is null, v.full_name || ' already signs in; change the email in Supabase Authentication instead');
  perform _require(e ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Write a valid email');
  perform _require(not exists (select 1 from people where lower(email) = e and id <> p_person), 'Someone else already has this email');
  update people set email = e where id = p_person;
  perform _log('person.email', 'person', p_person::text, null);
end $$;

-- ══ 4. Privileges (as at the end of 0011) ══
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions(), _unscored_items(jsonb, text, jsonb, text[]), _next_assignee(uuid), _staffing_changed(), _qa_plan_changed(),
  _qa_visits_changed(), _person_by_supplier(text) from authenticated;
