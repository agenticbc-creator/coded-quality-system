-- Go-live step 10 · Generates the QA plan of every live and setup cohort in one go, as the segment owner.
-- Run it once in the Supabase SQL editor AFTER migration 0014 (it refuses to run before). Put your own sign-in email
-- on the first line: the plans are generated and logged as you, exactly as if you pressed "Generate QA plan" on each cohort.
-- Visits already booked by hand (shadowing from the timetable, the bootcamp QA visits) are kept and their weeks skipped;
-- new visits go on the cohort's teaching days at its class time, never in the past. Observers stay open.
-- Cohorts in v_skip are left alone (on hold, or no timetable yet). Safe to run again: it replaces only what it generated.
do $$
declare v_email text := 'work.email@coded.kw';
  v_skip text[] := array['AIHR-Nov/Nov-26', 'ADA-Dec/Jan-26'];
  v_uid uuid; c record; r jsonb; n int := 0; k int := 0;
begin
  if v_email = 'work.email@coded.kw' then
    raise exception 'Put your sign-in email at the top of this script first. Nothing was changed.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visits' and column_name = 'auto_planned') then
    raise exception 'Apply migration 0014 first: before it, generating a plan deletes the visits booked by hand. Nothing was changed.';
  end if;
  select auth_user_id into v_uid from people where lower(email) = lower(trim(v_email));
  if v_uid is null then raise exception 'No signed-in record with that email. Nothing was changed.'; end if;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  for c in select id, name from cohorts where status <> 'closed' and not (name = any(v_skip)) order by start_date loop
    r := qa_plan_generate(c.id);
    n := n + (r->>'visits')::int; k := k + (r->>'kept')::int;
    raise notice '%: % new visits, % weeks already booked', c.name, r->>'visits', r->>'kept';
  end loop;
  raise notice 'Done: % new visits, % weeks already booked.', n, k;
end $$;
