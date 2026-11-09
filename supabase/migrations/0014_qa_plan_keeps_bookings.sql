-- 0014 · Generating a QA plan keeps the visits people booked by hand, books on teaching days at the class time,
-- and never books in the past. Before this, "Generate QA plan" deleted every planned visit of the cohort (including
-- shadowing booked from the timetable) and booked at 10:00 on fixed weekdays, Friday and Saturday included.
-- Run once after 0013 (safe to run again).

insert into settings (key, label, value, status, note) values
('schema_version', 'Database migration level', '{"v":14}', 'decided', 'Written by migration 0014.')
on conflict (key) do update set value = jsonb_build_object('v', greatest(coalesce((settings.value->>'v')::int, 0), 14));

-- Visits the plan generator made. Regenerating replaces only these, and only while nobody has picked them up.
alter table visits add column if not exists auto_planned boolean not null default false;

-- ══ 1. A teaching slot for one visit ══
-- Looks only inside plan week p_week (clipped to the cohort's dates), from the target day (week start + p_offset)
-- onward, then earlier in the same week. Never a day before today. Preference: a session from the timetable
-- (app_sessions); otherwise a weekday this cohort already has hand-booked visits on, at their usual time, first on a
-- day with no other visit in the classroom; otherwise Sunday to Thursday at 10:00 Kuwait time. Null when the week
-- has no day left.
create or replace function _teaching_slot(p_cohort uuid, p_classroom uuid, p_week int, p_offset int) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare co cohorts; v_from date; v_to date; v_target date; v_today date := (now() at time zone 'Asia/Kuwait')::date;
  v_session timestamptz; v_days int[]; v_time time; d date;
begin
  select * into co from cohorts where id = p_cohort;
  v_from := greatest(co.start_date + (p_week - 1) * 7, v_today);
  v_to := least(co.start_date + p_week * 7 - 1, co.end_date);
  if v_from > v_to then return null; end if;
  v_target := greatest(least(co.start_date + (p_week - 1) * 7 + p_offset, v_to), v_from);

  select s.starts_at into v_session from app_sessions s
   where s.classroom_id = p_classroom and (s.starts_at at time zone 'Asia/Kuwait')::date between v_from and v_to
   order by ((s.starts_at at time zone 'Asia/Kuwait')::date < v_target), s.starts_at limit 1;
  if v_session is not null then return v_session; end if;

  select array_agg(distinct extract(isodow from v.scheduled_for at time zone 'Asia/Kuwait')::int) into v_days
    from visits v where v.cohort_id = p_cohort and not v.auto_planned and v.status <> 'cancelled' and v.scheduled_for is not null;
  select (v.scheduled_for at time zone 'Asia/Kuwait')::time into v_time
    from visits v where v.cohort_id = p_cohort and not v.auto_planned and v.status <> 'cancelled' and v.scheduled_for is not null
   group by 1 order by count(*) desc, 1 limit 1;
  if v_time is null then
    select (s.starts_at at time zone 'Asia/Kuwait')::time into v_time from app_sessions s where s.classroom_id = p_classroom order by s.starts_at limit 1;
  end if;
  v_time := coalesce(v_time, time '10:00');

  -- Pass 1: a known teaching weekday with no other visit in the classroom; 2: any known teaching weekday; 3: Sunday to Thursday.
  for pass in 1..3 loop
    for d in select g::date from generate_series(v_from, v_to, interval '1 day') g order by (g::date < v_target), g loop
      if (case when pass < 3 and v_days is not null then extract(isodow from d)::int = any(v_days)
               else extract(isodow from d)::int not in (5, 6) end)
         and (pass > 1 or not exists (select 1 from visits v where v.classroom_id = p_classroom and v.status <> 'cancelled'
                                        and (v.scheduled_for at time zone 'Asia/Kuwait')::date = d)) then
        return (d + v_time) at time zone 'Asia/Kuwait';
      end if;
    end loop;
  end loop;
  return null;
end $$;

-- ══ 2. The generator ══
create or replace function qa_plan_generate(p_cohort uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare co cohorts; pr programs; cl record; d jsonb; w int; n int := 0; v_kept int := 0; v_weeks int; v_at timestamptz;
  v_edu int[]; v_ops int[]; v_shadow int[]; k record;
begin
  perform _require(owns_cohort(p_cohort) or (has_role('operations') and oversees_cohort(p_cohort)), 'Only the segment owner or the overseer can generate the QA plan');
  select * into co from cohorts where id = p_cohort;
  perform _require(co.status <> 'closed', 'This cohort is closed');
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

  -- Replace only what an earlier plan generated and nobody has picked up. Hand-booked visits stay.
  delete from visits where cohort_id = p_cohort and auto_planned and status = 'planned' and submitted_at is null;

  for cl in select id from classrooms where cohort_id = p_cohort order by name loop
    for k in
      select 'shadowing'::text kind, null::text qa_type, unnest(v_shadow) wk, 2 offs
      union all select 'qa', 'education', unnest(v_edu), 1
      union all select 'qa', 'operations', unnest(v_ops), 3
    loop
      w := k.wk;
      continue when w > v_weeks;
      -- A visit of this kind already booked in that classroom and week counts.
      if exists (select 1 from visits v where v.cohort_id = p_cohort and v.classroom_id = cl.id and v.kind = k.kind
                   and v.qa_type is not distinct from k.qa_type and v.status <> 'cancelled'
                   and (v.week_no = w or (v.scheduled_for at time zone 'Asia/Kuwait')::date
                        between co.start_date + (w - 1) * 7 and co.start_date + w * 7 - 1)) then
        v_kept := v_kept + 1;
        continue;
      end if;
      v_at := _teaching_slot(p_cohort, cl.id, w, k.offs);
      continue when v_at is null;  -- the week is over, or has no working day left
      insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, created_by, auto_planned)
      values (p_cohort, cl.id, k.kind, k.qa_type, 'planned', 'class',
              case when k.kind = 'shadowing' then _template_for('shadowing', null, pr.segment_id) else _template_for('qa', k.qa_type, pr.segment_id) end,
              _rotate_assignee(p_cohort, k.kind, k.qa_type), v_at, w, me(), true);
      n := n + 1;
    end loop;
  end loop;

  update cohorts set qa_plan = jsonb_build_object('type', pr.program_type, 'weeks', v_weeks, 'education_weeks', to_jsonb(v_edu),
    'operations_weeks', to_jsonb(v_ops), 'shadowing_weeks', to_jsonb(v_shadow), 'generated_at', now(), 'kept', v_kept) where id = p_cohort;
  perform _log('qa_plan.generate', 'cohort', p_cohort::text, jsonb_build_object('visits', n, 'kept', v_kept));
  return jsonb_build_object('visits', n, 'kept', v_kept);
end $$;

-- ══ 3. Privileges (as at the end of 0013, plus the new helper) ══
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function _log(text,text,text,jsonb), _notify(uuid,text,text,text,text), _compute_one(uuid,text,text), _jd_autotick(uuid),
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[]),
  _level_suggestions(), _unscored_items(jsonb, text, jsonb, text[]), _next_assignee(uuid), _staffing_changed(), _qa_plan_changed(),
  _qa_visits_changed(), _person_by_supplier(text), _teaching_slot(uuid, uuid, int, int) from authenticated;
