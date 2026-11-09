-- Go-live rehearsal on the throwaway test database: clear the sample data, create the first system owner,
-- then set up a program, people, contracts, a cohort, staffing and a timetable the way a live team would.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\echo '-- go-live rehearsal'
\i supabase/live/1_clear_sample_data.sql
\! sed "/^declare/{s/'FULL NAME'/'Test Owner'/;s/'work.email@coded.kw'/'owner@example.com'/}" supabase/live/2_first_system_owner.sql > /tmp/first_owner_test.sql
\i /tmp/first_owner_test.sql

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if; return 'ok    ' || label; end $$;
create function pg_temp.as_uid(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('role', 'authenticated', false); end $$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.ok((select count(*) from people where email like '%@demo.coded.test') = 0 and (select count(*) from auth.users where email like '%@demo.coded.test') = 0, 'no sample people or sample accounts left');
select pg_temp.ok((select count(*) from cohorts) + (select count(*) from visits) + (select count(*) from programs) = 0, 'no sample programs, cohorts or visits left');
select pg_temp.ok((select count(*) from qa_templates) > 0 and (select count(*) from settings) > 0 and (select count(*) from segments) = 3, 'reference data kept');

-- The owner is invited and signs in for the first time
insert into auth.users (id, email, email_confirmed_at) values ('44444444-4444-4444-4444-444444444444', 'owner@example.com', now());
select pg_temp.as_uid('44444444-4444-4444-4444-444444444444');
select pg_temp.ok(claim_my_record() is not null, 'first sign-in links the system owner');
select pg_temp.ok(person_add('Segment Owner Pro', 'so.pro@example.com', '{segment_owner}', 'pro', '{pro}', true) is not null, 'owner adds a segment owner');
select pg_temp.ok((import_contractors('[{"erp_supplier_id":"SUP-L1","full_name":"Live Instructor","email":"inst@example.com","home_segment":"pro","cleared_to_teach":"yes"},{"erp_supplier_id":"SUP-L2","full_name":"Live TA","email":"ta@example.com","home_segment":"pro","role":"ta"}]')->>'cleared')::int = 1, 'contractors imported, one already cleared');
select pg_temp.ok(program_save(null, 'Full Stack Bootcamp', 'Full Stack', 'pro', 'bootcamp', 12, 5) is not null, 'owner creates a program');
select pg_temp.ok((import_contracts('[{"contract_id":"CON-0001","erp_supplier_id":"SUP-L1","role":"Instructor","segment":"pro","status":"Active","start_date":"2026-11-01","end_date":"2027-02-28","rate_type":"hourly","rate":"20","signed_at":"2026-10-20"}]')->>'new')::int = 1, 'contract imported');
select pg_temp.ok((import_availability('[{"erp_supplier_id":"SUP-L1","from_date":"2026-12-20","to_date":"2026-12-24","note":"Leave"}]')->>'new')::int = 1, 'unavailable dates imported');
select pg_temp.ok(run_daily_jobs_ext() is not null and (select count(*) from sync_runs where message like '%read') = 0, 'daily jobs record no pretend ERPNext or App pull');
reset role;

-- The segment owner signs in and sets up a cohort
insert into auth.users (id, email, email_confirmed_at) values ('55555555-5555-5555-5555-555555555555', 'so.pro@example.com', now());
select pg_temp.as_uid('55555555-5555-5555-5555-555555555555');
select pg_temp.ok(claim_my_record() is not null, 'segment owner links on first sign-in');
select set_config('t.co', cohort_create((select id from programs limit 1), 'Full Stack — Cohort 1 (Nov 2026)', '2026-11-15', '2027-02-04', 1)::text, false) \g /dev/null
select classroom_assign((select id from classrooms where cohort_id = current_setting('t.co')::uuid limit 1), (select id from people where erp_supplier_id = 'SUP-L1'), 'instructor', true);
select pg_temp.ok((select count(*) from classroom_staff) = 1, 'cleared instructor with an Active contract is staffed');
reset role;
select pg_temp.as_uid('44444444-4444-4444-4444-444444444444');
select pg_temp.ok((import_sessions('[{"cohort":"Full Stack — Cohort 1 (Nov 2026)","classroom":"Classroom A","starts_at":"2026-11-15T09:00:00+03:00","topic":"Kick-off"}]')->>'new')::int = 1, 'timetable imported by cohort and classroom name');
reset role;
\echo 'go-live rehearsal passed'
