-- Sample data for migration 0008 (CCTP, levels, onboarding, master classes, staged review, report cards).
-- Run after demo_seed.sql. Fictional people and numbers.

-- Yara: CODED alumna on the CCTP path (signs in with the same demo password as the other personas)
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'yara@demo.coded.test',
         encrypted_password, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '', false, false
  from auth.users where email = 'noura@demo.coded.test'
  on conflict do nothing
  returning id, email
), i as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now() from u
  returning user_id
)
insert into people (auth_user_id, full_name, arabic_name, email, roles, home_segment, owned_segments, is_full_timer, approval_status, cctp_rank)
select user_id, 'Yara Al-Mansour', 'يارا المنصور', 'yara@demo.coded.test', '{cctp_candidate}', 'pro', '{}', false, 'not_started', 'Senior Trainer' from i;

create temp table _p as select split_part(email, '@', 1) k, id from people where email like '%@demo.coded.test'
  union all select lower(split_part(full_name, ' ', 1)), id from people where email is null or email not like '%@demo.coded.test';
create function pg_temp.p(k text) returns uuid language sql as $$ select id from _p where _p.k = $1 limit 1 $$;

-- ── CCTP ─────────────────────────────────────────────────
insert into cctp_enrolments (person_id, source, lessons_completed, status, enrolled_by, enrolled_at) values
 (pg_temp.p('yara'),  'alumni',     72, 'learning', pg_temp.p('faisal'), '2026-08-10 10:00+03'),
 (pg_temp.p('hamad'), 'contractor', 100,'booked',   pg_temp.p('faisal'), '2026-06-02 10:00+03'),
 (pg_temp.p('mariam'),'contractor', 100,'certified',pg_temp.p('faisal'), '2026-03-01 10:00+03'),
 (pg_temp.p('bader'), 'contractor', 34, 'learning', pg_temp.p('huda'),   '2026-09-14 10:00+03'),
 (pg_temp.p('fahad'), 'contractor', 19, 'learning', pg_temp.p('huda'),   '2026-10-05 10:00+03'),
 (pg_temp.p('dana'),  'contractor', 100,'not_yet',  pg_temp.p('huda'),   '2026-04-12 10:00+03')
on conflict do nothing;
update people set cctp_rank = 'Junior Trainer' where id = pg_temp.p('fahad');
update people set cctp_rank = 'Trainer' where id = pg_temp.p('bader');
update people set cctp_rank = 'Path Complete' where id in (pg_temp.p('hamad'), pg_temp.p('dana'));

insert into mock_results (person_id, context, scores, critical_failures, total, result, feedback, assessor_id, created_at) values
 (pg_temp.p('mariam'), 'cctp', '{"arc":17,"struggle":13,"mentorship":17,"collaborative":12,"supportive":13,"real_life":12}', '{}', 84, 'CCTA',
  'Warm, well-paced session. Next step: let trainees struggle a little longer before stepping in.', pg_temp.p('faisal'), '2026-05-20 12:00+03'),
 (pg_temp.p('dana'), 'cctp', '{"arc":15,"struggle":8,"mentorship":14,"collaborative":11,"supportive":12,"real_life":10}', '{direct_solutions}', 70, 'not_yet',
  'Typed the fix for a stuck trainee twice. Retake once you have practised guiding questions.', pg_temp.p('huda'), '2026-10-08 12:00+03');
insert into cctp_bookings (person_id, scheduled_for, assessor_id, status, mock_result_id, recording_url, created_at)
select pg_temp.p('mariam'), '2026-05-20 10:00+03', pg_temp.p('faisal'), 'completed', id, 'https://drive.google.com/file/d/sample-mariam-mock', '2026-05-10 09:00+03'
from mock_results where person_id = pg_temp.p('mariam') and context = 'cctp';
insert into cctp_bookings (person_id, scheduled_for, assessor_id, status, mock_result_id, created_at)
select pg_temp.p('dana'), '2026-10-08 10:00+03', pg_temp.p('huda'), 'completed', id, '2026-10-01 09:00+03'
from mock_results where person_id = pg_temp.p('dana') and context = 'cctp';
insert into cctp_bookings (person_id, scheduled_for, status, created_at) values (pg_temp.p('hamad'), '2026-11-08 10:00+03', 'booked', '2026-10-28 09:00+03');

-- ── QAer onboarding (E7) ─────────────────────────────────
insert into qaer_onboarding (person_id, template_key, completed_at) values
 (pg_temp.p('sara'), 'edu_class', '2026-09-20 10:00+03'), (pg_temp.p('sara'), 'edu_instructor', '2026-09-20 10:30+03'),
 (pg_temp.p('sara'), 'shadowing_checklist', '2026-09-20 11:00+03'),
 (pg_temp.p('huda'), 'edu_class', '2026-09-18 10:00+03'), (pg_temp.p('huda'), 'edu_masterclass', '2026-09-18 10:30+03'),
 (pg_temp.p('khalid'), 'ops_classroom', '2026-09-22 10:00+03'), (pg_temp.p('khalid'), 'shadowing_checklist', '2026-09-22 10:20+03')
on conflict do nothing;

-- ── Levels and readiness (B7 / P4) ───────────────────────
insert into level_changes (person_id, kind, from_level, to_level, reason, owner_by, owner_at, created_at) values
 (pg_temp.p('ahmed'), 'promotion', 'Lead Instructor', 'Senior Instructor', 'CCT certified and Tier 1 for two quarters', pg_temp.p('noura'), '2026-10-25 11:00+03', '2026-10-22 08:00+03'),
 (pg_temp.p('mariam'), 'readiness', 'TA', 'Instructor', 'CCTA/CCT and Tier 1 results — ready to move from TA to instructor', null, null, '2026-10-22 08:00+03'),
 (pg_temp.p('bader'), 'review', 'Instructor', 'Instructor', 'Red flag in the last 90 days', null, null, '2026-10-29 08:00+03')
on conflict do nothing;

-- ── Master class (C5 / D7) ───────────────────────────────
with c as (select id from cohorts where name like 'Full Stack — Cohort 3%'),
     cl as (select id from classrooms where cohort_id = (select id from c) and name = 'Classroom A'),
     v as (
  insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, focus_person_id, template_id, assignee_id, scheduled_for, week_no, status, created_by)
  select (select id from c), (select id from cl), 'qa', 'education', 'planned', 'instructor', pg_temp.p('ahmed'),
         (select id from qa_templates where key = 'edu_masterclass'), pg_temp.p('sara'), '2026-11-04 10:00+03', 5, 'accepted', pg_temp.p('noura')
  returning id)
insert into master_classes (cohort_id, classroom_id, kind, title, instructor_id, scheduled_for, visit_id, created_by)
select (select id from c), (select id from cl), 'master_class', 'Shipping to production: auth, logs and rollbacks', pg_temp.p('ahmed'), '2026-11-04 10:00+03', (select id from v), pg_temp.p('noura');

-- ── Staged content review (A6 / A7) on the AI App Developer update ──
update content_items set staged = true where title like 'AI App Developer — Cohort 7 update%';
insert into content_stages (content_id, stage, ord, approver_role, status, comments, decided_by, decided_at)
select ci.id, s.stage, s.ord, s.role, s.status, s.comments, case when s.status <> 'pending' then pg_temp.p(s.who) end, s.at::timestamptz
from content_items ci, (values
  ('outline', 1, 'senior_instructor', 'approved', 'Clear arc across the four days.', 'huda', '2026-10-14 10:00+03'),
  ('detailed_outline', 2, 'senior_instructor', 'approved', 'Good: evaluation lab moved before the capstone.', 'huda', '2026-10-17 10:00+03'),
  ('lesson_plan', 3, 'senior_instructor', 'approved', null, 'huda', '2026-10-21 10:00+03'),
  ('final_briefing', 4, 'education_principal', 'pending', null, null, null),
  ('alpha', 5, 'senior_instructor', 'pending', null, null, null),
  ('beta', 6, 'education_principal', 'pending', null, null, null)
) as s(stage, ord, role, status, comments, who, at)
where ci.title like 'AI App Developer — Cohort 7 update%'
on conflict do nothing;
update content_versions set precheck = '{"seventy_thirty":true,"arc":true,"productive_struggle":true,"real_life":true,"time_boxed":false,"outcomes_mapped":true}'
where content_id = (select id from content_items where title like 'AI App Developer — Cohort 7 update%');

-- ── Report cards (G4) ────────────────────────────────────
insert into report_cards (person_id, period, acknowledged_at, comment)
select person_id, period, '2026-10-06 09:00+03', case when person_id = pg_temp.p('ahmed') then 'Thanks — aiming to keep the pacing scores up.' end
from composites where period = '2026-Q3' and person_id in (pg_temp.p('ahmed'), pg_temp.p('mariam'), pg_temp.p('lulwa'))
on conflict do nothing;

select (select count(*) from cctp_enrolments) cctp, (select count(*) from level_changes) levels, (select count(*) from master_classes) mcs,
       (select count(*) from content_stages) stages, (select count(*) from qaer_onboarding) onboarding, (select count(*) from report_cards) report_cards,
       (select count(*) from people where email = 'yara@demo.coded.test') yara;
