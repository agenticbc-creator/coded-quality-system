-- Access and flow tests for migrations 0009 and 0010, run against the demo seed (supabase/tests/run.sh).
-- Each block runs as one demo persona inside a transaction that is rolled back, so blocks do not affect each other.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if;
  return 'ok    ' || label;
end $$;
create function pg_temp.refused(stmt text, label text, needle text default null) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL (allowed): %', label;
exception when others then
  if sqlerrm like 'FAIL (allowed)%' then raise; end if;
  if needle is not null and position(needle in sqlerrm) = 0 then raise exception 'FAIL: % (wrong error: %)', label, sqlerrm; end if;
  return 'ok    ' || label;
end $$;
-- Runs the rest of the transaction as this persona (email prefix) or as a bare auth user id.
create function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select auth_user_id::text from people where email = k || '@demo.coded.test'), k), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table t_ids as
select (select v.id from visits v join classrooms cl on cl.id = v.classroom_id where v.kind = 'qa' and v.qa_type = 'education' and v.release_status = 'pending' and cl.name = 'Classroom B') pending_b,
       (select v.id from visits v join classrooms cl on cl.id = v.classroom_id where v.kind = 'qa' and v.qa_type = 'education' and v.release_status = 'pending' and cl.name = 'Classroom A') pending_a,
       (select v.id from visits v join classrooms cl on cl.id = v.classroom_id where v.kind = 'qa' and v.status = 'invited' and cl.name = 'Classroom B') invited_b,
       (select co.id from cohorts co where co.status = 'live' and co.name like 'Full Stack%') fs,
       (select cl.id from classrooms cl join cohorts co on co.id = cl.cohort_id where co.name like 'Full Stack%' and cl.name = 'Classroom A') room_a,
       (select min(s.starts_at) from app_sessions s join classrooms cl on cl.id = s.classroom_id join cohorts co on co.id = cl.cohort_id
         where co.name like 'Full Stack%' and cl.name = 'Classroom A' and s.starts_at > '2026-10-25') teach_at,
       (select co.id from cohorts co where co.status = 'setup') setup_cohort,
       (select pl.id from plans pl join people p on p.id = pl.person_id where p.email = 'bader@demo.coded.test' and pl.status = 'open') bader_plan,
       (select f.id from feedback f join people a on a.id = f.author_id where a.email = 'khalid@demo.coded.test' and f.status = 'private' limit 1) khalid_note,
       (select id from people where email = 'sara@demo.coded.test') sara,
       (select id from people where email = 'huda@demo.coded.test') huda,
       (select id from people where email = 'bader@demo.coded.test') bader;
grant select on t_ids to authenticated;

\echo '-- 0009: a signed-up account with no record reads nothing'
begin;
insert into auth.users (id, email, email_confirmed_at) values ('11111111-1111-1111-1111-111111111111', 'stranger@example.com', now());
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok((select count(*) from people) = 0, 'no people rows for an account without a record');
select pg_temp.ok((select count(*) from cohorts) = 0, 'no cohorts for an account without a record');
select pg_temp.ok(claim_my_record() is null, 'claim finds nothing to link');
rollback;

\echo '-- 0010: a senior instructor sees visit scores only once released, or for visits they observed'
begin;
select pg_temp.act_as('huda');
select pg_temp.ok((select count(*) from visit_scores where visit_id = (select pending_b from t_ids)) = 0, 'senior instructor: no scores on an unreleased visit someone else observed');
select pg_temp.ok((select count(*) from visit_scores where visit_id = (select pending_a from t_ids)) > 0, 'senior instructor: sees scores on the visit she observed');
select pg_temp.ok((select count(*) from visit_scores vs join visits v on v.id = vs.visit_id where v.release_status = 'released' and v.kind = 'qa') > 0, 'senior instructor: sees released scores');
rollback;

\echo '-- Instructors see their own released scores only'
begin;
select pg_temp.act_as('bader');
select pg_temp.ok((select count(*) from visit_scores where visit_id = (select pending_b from t_ids)) = 0, 'instructor: nothing from an unreleased visit');
select pg_temp.ok((select count(*) from visit_scores where subject_person_id <> (select bader from t_ids) and subject_role <> 'class') = 0, 'instructor: no one else''s personal scores');
select pg_temp.ok(jsonb_array_length(person_segment_scores((select bader from t_ids))) >= 1, 'instructor: own per-segment results');
select pg_temp.ok(person_segment_scores((select sara from t_ids)) = '[]'::jsonb, 'instructor: no per-segment results for someone else');
rollback;

\echo '-- 0009: the education coordinator books visits and sees status, not scores'
begin;
select pg_temp.act_as('muna');
select pg_temp.ok((select count(*) from visits) > 0, 'coordinator: reads visits in her segment');
select pg_temp.ok((select count(*) from visit_scores) = 0, 'coordinator: reads no visit scores');
select pg_temp.ok(visit_schedule(null, (select fs from t_ids), (select room_a from t_ids), 'qa', 'education', 'planned', 'class', null, null,
  (select sara from t_ids), (select teach_at from t_ids)) is not null,
  'coordinator: books an education QA visit on a teaching day');
select pg_temp.refused($$select visit_schedule(null, (select fs from t_ids), (select room_a from t_ids), 'qa', 'education', 'planned', 'class', null, null,
  (select sara from t_ids), '2026-10-23 10:00+03')$$, '0010: no education class visit on a day without a class (Friday)', 'no class that day');
rollback;

\echo '-- 0009: the program coordinator counts as operations'
begin;
select pg_temp.act_as('omar');
select pg_temp.ok(has_role('operations'), 'program coordinator: has the operations role');
select pg_temp.ok((select count(*) from visit_scores) = 0 or (select bool_and(v.qa_type = 'operations') from visit_scores vs join visits v on v.id = vs.visit_id), 'program coordinator: only operations QA scores, if any');
rollback;

\echo '-- 0010: a declined invite passes to the next eligible observer'
begin;
select pg_temp.act_as('sara');
select visit_respond((select invited_b from t_ids), 'decline', null, 'Clash with a workshop');
reset role;  -- the decliner no longer sees the visit; check it as the database owner
select pg_temp.ok((select assignee_id from visits where id = (select invited_b from t_ids)) is distinct from (select sara from t_ids), 'decline: the decliner is no longer assigned');
select pg_temp.ok((select status from visits where id = (select invited_b from t_ids)) in ('invited','planned'), 'decline: the visit is invited to someone else or back in the queue');
select pg_temp.ok((select assignee_id is null or assignee_id not in (select person_id from classroom_staff where classroom_id = v.classroom_id) from visits v where id = (select invited_b from t_ids)),
  'decline: never passed to someone teaching in that classroom');
rollback;

\echo '-- 0009: scoring waits for the invite to be accepted'
begin;
select pg_temp.act_as('sara');
select pg_temp.refused($$select visit_submit((select invited_b from t_ids), 'full', '{}', '[]', '{}', '{}', '[]', '', '', '')$$, 'submit refused before the invite is accepted');
rollback;

\echo '-- 0009: per-person release notes'
begin;
select pg_temp.act_as('noura');
select pg_temp.ok(visit_release((select pending_b from t_ids), 'approve', null, null, null, 'email',
  jsonb_build_array(jsonb_build_object('person', (select bader from t_ids), 'one_thing', 'Check every pair before moving on', 'action_points', 'Use exit tickets', 'channel', 'call_email'))) >= 1, 'release: segment owner releases with per-person notes');
select pg_temp.ok((select one_thing from released_feedback where visit_id = (select pending_b from t_ids) and subject_id = (select bader from t_ids)) = 'Check every pair before moving on', 'release: the person''s own One Thing is stored');
rollback;

\echo '-- 0010: cohort sign-offs'
begin;
select pg_temp.act_as('noura');
select pg_temp.ok((cohort_readiness((select setup_cohort from t_ids))->'blockers') ? 'The segment owner has not approved the staffing', 'readiness: staffing sign-off is a blocker');
select pg_temp.ok((select staffing_approved_at is not null from cohorts where id = (select fs from t_ids)), 'existing live cohort counts as signed off');
rollback;
begin;
select pg_temp.act_as('huda');
select pg_temp.refused($$select cohort_approve((select setup_cohort from t_ids), 'staffing')$$, 'sign-off: refused for a senior instructor', 'Only the segment owner');
rollback;

\echo '-- 0010: plan reviews'
begin;
select pg_temp.act_as('huda');
select pg_temp.refused($$select plan_review((select bader_plan from t_ids), 'met', 'Done')$$, 'plan review: refused for a senior instructor');
select pg_temp.act_as('noura');
select pg_temp.refused($$select plan_review((select bader_plan from t_ids), 'met', '')$$, 'plan review: needs a note', 'short note');
select pg_temp.ok(plan_review((select bader_plan from t_ids), 'escalated', 'Goals not met after two check-ins') <> (select bader_plan from t_ids), 'plan review: escalating a Coaching Plan opens an Improvement Plan');
select pg_temp.ok((select status = 'closed' and outcome = 'escalated' from plans where id = (select bader_plan from t_ids)), 'plan review: the Coaching Plan is closed with its outcome');
select pg_temp.ok((select count(*) from plans where person_id = (select bader from t_ids) and kind = 'improvement' and status = 'open') = 1, 'plan review: one open Improvement Plan');
rollback;

\echo '-- 0010: authors correct their own notes before review'
begin;
select pg_temp.act_as('sara');
select pg_temp.refused($$select feedback_update_own((select khalid_note from t_ids), 'concern', 'minor', 'Changed by someone else')$$, 'note edit: refused for someone who did not write it');
select pg_temp.act_as('khalid');
select feedback_update_own((select khalid_note from t_ids), 'concern', 'minor', 'Corrected wording');
select pg_temp.ok((select body from feedback where id = (select khalid_note from t_ids)) = 'Corrected wording', 'note edit: the author corrects their own note');
rollback;

\echo '-- 0010: evidence paths'
begin;
select pg_temp.act_as('sara');
select pg_temp.ok(evidence_writable('visit/' || (select invited_b from t_ids) || '/board.jpg'), 'evidence: the observer can upload to an open visit');
select pg_temp.ok(not evidence_writable('visit/' || (select pending_b from t_ids) || '/late.jpg'), 'evidence: not after the visit is submitted');
select pg_temp.ok(not evidence_writable('feedback/' || (select huda from t_ids) || '/x.jpg'), 'evidence: not into someone else''s feedback folder');
select pg_temp.act_as('khalid');
select pg_temp.ok(not evidence_writable('visit/' || (select invited_b from t_ids) || '/board.jpg'), 'evidence: someone else cannot upload to the visit');
rollback;

\echo '-- 0010: adding people and first sign-in'
begin;
select pg_temp.act_as('noura');
select pg_temp.refused($$select person_add('Test Person', 'new.person@example.com', '{instructor}', 'pro')$$, 'add person: refused for a segment owner', 'system owner');
select pg_temp.act_as('tariq');
select pg_temp.refused($$select person_add('Test Person', 'new.person@example.com', '{wizard}', 'pro')$$, 'add person: unknown role refused', 'Unknown role');
select pg_temp.ok(person_add('Test Person', 'New.Person@example.com', '{instructor}', 'pro') is not null, 'add person: the system owner adds a record');
select pg_temp.refused($$select person_add('Test Again', 'new.person@example.com', '{instructor}', 'pro')$$, 'add person: the same email twice is refused', 'already');
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('22222222-2222-2222-2222-222222222222', 'new.person@example.com', now());
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.ok(claim_my_record() is not null, 'first sign-in: the invited person claims their record');
select pg_temp.ok(me() is not null, 'first sign-in: the record is linked');
rollback;

\echo '-- 0010: imports are for the system owner only'
begin;
select pg_temp.act_as('noura');
select pg_temp.refused($$select import_contractors('[{"erp_supplier_id":"SUP-T1","full_name":"Test Contractor"}]')$$, 'import: refused for a segment owner', 'system owner');
select pg_temp.act_as('tariq');
select pg_temp.ok((import_contractors('[{"erp_supplier_id":"SUP-T1","full_name":"Test Contractor"},{"erp_supplier_id":"SUP-0102","full_name":"Huda Al-Mutairi"}]')->>'new')::int = 1, 'import: one new, one updated');
rollback;

\echo '-- Review fixes'
begin;
select pg_temp.ok((select key from qa_templates where id = _template_for('qa', 'education', 'kids')) = 'edu_class_kids', 'templates: the age-bracket drafts are never picked automatically');
select pg_temp.act_as('sara');
select visit_respond((select invited_b from t_ids), 'decline', null, null);
reset role;
-- the second observer declines too: it must not go back to Sara
select set_config('t.first', (select assignee_id::text from visits where id = (select invited_b from t_ids)), true) \g /dev/null
select set_config('request.jwt.claim.sub', (select auth_user_id::text from people where id::text = current_setting('t.first')), true) \g /dev/null
set local role authenticated;
select visit_respond((select invited_b from t_ids), 'decline', null, null) where current_setting('t.first', true) <> '';
reset role;
select pg_temp.ok((select assignee_id is distinct from (select sara from t_ids) from visits where id = (select invited_b from t_ids)), 'decline: never passed back to someone who already declined');
rollback;
begin;
select pg_temp.act_as('noura');
select pg_temp.refused($$select cohort_score((select fs from t_ids), '2025-Q1')$$, 'batch score: refused for a quarter the cohort did not run in', 'did not run');
select pg_temp.ok((cohort_score((select fs from t_ids), '2026-Q4')->>'people')::int > 0, 'batch score: scores the team for its quarter');
rollback;
begin;
select pg_temp.act_as('tariq');
select pg_temp.ok((import_contractors('[{"erp_supplier_id":"SUP-T9","full_name":"Noura Al-Saleh","email":"NOURA@demo.coded.test"}]')->>'updated')::int = 1, 'import: an existing email is matched, not duplicated');
rollback;
begin;
select pg_temp.act_as('khalid');
select pg_temp.refused($$select feedback_update_own((select khalid_note from t_ids), 'concern', 'red_flag', 'x', 'Safety')$$, 'note edit: cannot turn a note into a red flag quietly', 'new note');
rollback;

begin;
-- A new observer with no visits and no onboarding cannot accept a first visit
insert into auth.users (id, email, email_confirmed_at) values ('33333333-3333-3333-3333-333333333333', 'new.eo@example.com', now());
insert into people (auth_user_id, full_name, email, roles, home_segment, is_full_timer) values ('33333333-3333-3333-3333-333333333333', 'New Officer', 'new.eo@example.com', '{education_officer}', 'pro', true);
select pg_temp.act_as('noura');
select set_config('t.v', visit_schedule(null, (select fs from t_ids), (select room_a from t_ids), 'shadowing', null, 'planned', 'class', null, null,
  (select id from people where email = 'new.eo@example.com'), (select teach_at from t_ids))::text, true) \g /dev/null
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.refused($$select visit_respond(current_setting('t.v')::uuid, 'accept')$$, 'onboarding: a first visit waits for QAer onboarding', 'onboarding');
select qaer_onboarding_complete('shadowing_checklist');
select visit_respond(current_setting('t.v')::uuid, 'accept');
select pg_temp.ok((select status from visits where id = current_setting('t.v')::uuid) = 'accepted', 'onboarding: accepted once onboarded on that template');
rollback;

-- 0013: clearing a contractor, staffing without ERPNext contracts, sign-in emails for imported records
begin;
insert into people (full_name, roles, home_segment, erp_supplier_id) values ('Imported TA', '{ta}', 'pro', 'SUP-IMP-1');
select pg_temp.act_as('noura');
select pg_temp.refused($$select classroom_assign((select room_a from t_ids), (select id from people where erp_supplier_id = 'SUP-IMP-1'), 'ta')$$, 'staffing: someone not cleared cannot be assigned', 'not cleared');
select pg_temp.refused($$select person_set_approval((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'cleared', 'ok')$$, 'clearance: a reason is required', 'Write why');
select person_set_approval((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'cleared', 'Hired as TA and approved in ERPNext');
select classroom_assign((select room_a from t_ids), (select id from people where erp_supplier_id = 'SUP-IMP-1'), 'ta');
select pg_temp.ok(exists (select 1 from classroom_staff where classroom_id = (select room_a from t_ids) and person_id = (select id from people where erp_supplier_id = 'SUP-IMP-1')),
  'staffing: a cleared person is assigned while ERPNext contracts are not required');
reset role;
select pg_temp.ok(exists (select 1 from audit_log where action = 'person.approval' and entity_id = (select id::text from people where erp_supplier_id = 'SUP-IMP-1')), 'clearance: logged with its reason');
update settings set value = '{"require_active_contract": true}' where key = 'staffing_rules';
select pg_temp.act_as('noura');
select pg_temp.refused($$select classroom_assign((select id from classrooms where cohort_id = (select fs from t_ids) and name = 'Classroom B'), (select id from people where erp_supplier_id = 'SUP-IMP-1'), 'ta')$$,
  'staffing: with the contract rule on, no Active contract means no assignment', 'Active contract');
select pg_temp.act_as('bader');
select pg_temp.refused($$select person_set_approval((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'not_started', 'Trying to undo it')$$, 'clearance: an instructor cannot clear people', 'segment owner');
select pg_temp.refused($$select person_set_email((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'imported.ta@example.com')$$, 'email: only the system owner sets sign-in emails', 'system owner');
select pg_temp.act_as('tariq');
select person_set_email((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'Imported.TA@example.com');
select pg_temp.ok((select email from people where erp_supplier_id = 'SUP-IMP-1') = 'imported.ta@example.com', 'email: saved in lower case on the imported record');
select pg_temp.refused($$select person_set_email((select id from people where email = 'noura@demo.coded.test'), 'other@example.com')$$, 'email: a record that already signs in keeps its email', 'already signs in');
select pg_temp.refused($$select person_set_email((select id from people where erp_supplier_id = 'SUP-IMP-1'), 'noura@demo.coded.test')$$, 'email: one email per record', 'already has this email');
rollback;

\echo 'all access tests passed'
