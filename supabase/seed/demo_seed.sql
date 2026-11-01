-- Demo data for the standalone build. ALL names and numbers are fictional examples.
-- Run once on an empty database after the migrations:
--   select set_config('seed.demo_password', '<password>', false);  -- then this file
-- Demo users sign in with that password (see DEMO_PASSWORD in the app's env).

create temp table _ids (key text primary key, id uuid not null default gen_random_uuid());

create function pg_temp.pid(k text) returns uuid language sql as $$ select id from _ids where key = k $$;
create function pg_temp.kw(d date, hhmm text) returns timestamptz language sql as $$ select (d::text || ' ' || hhmm || '+03')::timestamptz $$;

-- Item scores that land close to a target percentage
create function pg_temp.items_for(p_rubric jsonb, p_role text, p_pct numeric, p_seed int) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(it->>'key',
           least((it->>'max')::numeric, greatest(0, round((it->>'max')::numeric * (p_pct + ((abs(hashtext((it->>'key') || p_seed)) % 7) - 3)) / 100)))), '{}')
  from jsonb_array_elements(p_rubric->p_role->'sections') sec, jsonb_array_elements(sec->'items') it
$$;

-- ── People ────────────────────────────────────────────────
insert into _ids (key) values
 ('noura'),('yousef'),('faisal'),('huda'),('sara'),('khalid'),('abeer'),('ahmed'),('mariam'),('hamad'),('bader'),('fahad'),
 ('lulwa'),('dana'),('jassim'),('shahad'),('abdulaziz'),('reem'),('tariq'),('fatma'),('ali'),('nada');

-- Demo sign-in accounts (password from seed.demo_password)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', i.id, 'authenticated', 'authenticated', i.key || '@demo.coded.test',
       crypt(current_setting('seed.demo_password'), gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
       now(), now(), '', '', '', '', '', '', '', '', false, false
from _ids i where i.key not in ('ali','nada','abeer','hamad','fahad','lulwa','dana','jassim','shahad');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%@demo.coded.test';

insert into people (id, auth_user_id, full_name, arabic_name, email, roles, home_segment, owned_segments, is_full_timer,
  erp_supplier_id, erp_service_category, erp_instructor_level, erp_contractor_status, approval_status, cctp_rank, cctp_cert)
select i.id, (select id from auth.users where id = i.id), p.full_name, p.arabic, i.key || '@demo.coded.test', p.roles, p.seg, p.owned, p.ft,
       p.erp, p.cat, p.lvl, p.status, p.appr, p.rank, p.cert
from _ids i join (values
 ('noura',    'Noura Al-Saleh',    'نورة الصالح',   '{segment_owner}'::text[],                   'pro',  '{pro}'::text[],        true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('yousef',   'Yousef Al-Bader',   'يوسف البدر',    '{segment_owner}',                           'youth','{kids,youth}',         true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('faisal',   'Faisal Al-Rashid',  'فيصل الراشد',   '{education_principal}',                     'pro',  '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('huda',     'Huda Al-Mutairi',   'هدى المطيري',   '{senior_instructor,instructor}',            'pro',  '{}',                   true,  'SUP-0102',  'Instructor',         'Senior Instructor',  'Active',    'cleared', 'Lead Trainer', 'CCT'),
 ('sara',     'Sara Al-Kandari',   'سارة الكندري',  '{education_officer}',                       'pro',  '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('khalid',   'Khalid Al-Enezi',   'خالد العنزي',   '{operations}',                              'pro',  '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('abeer',    'Abeer Al-Sayegh',   'عبير الصايغ',   '{operations}',                              'youth','{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('ahmed',    'Ahmed Hassan',      'أحمد حسن',      '{instructor,lead_instructor,content_creator}','pro', '{}',                   false, 'SUP-0231',  'Instructor',         'Lead Instructor',    'Active',    'cleared', 'Senior Trainer', 'CCT'),
 ('mariam',   'Mariam Al-Ali',     'مريم العلي',    '{ta}',                                      'pro',  '{}',                   false, 'SUP-0187',  'Teaching Assistant', 'TA',                 'Active',    'cleared', 'Trainer', 'CCTA'),
 ('hamad',    'Hamad Al-Ajmi',     'حمد العجمي',    '{ta}',                                      'pro',  '{}',                   false, 'SUP-0244',  'Teaching Assistant', 'TA',                 'Active',    'cleared', 'Junior Trainer', null),
 ('bader',    'Bader Al-Shatti',   'بدر الشطي',     '{instructor}',                              'pro',  '{}',                   false, 'SUP-0198',  'Instructor',         'Instructor',         'Active',    'cleared', null, null),
 ('fahad',    'Fahad Al-Fadhli',   'فهد الفضلي',    '{ta}',                                      'pro',  '{}',                   false, 'SUP-0251',  'Teaching Assistant', 'TA',                 'Active',    'cleared', null, null),
 ('lulwa',    'Lulwa Al-Hajeri',   'لولوة الهاجري', '{instructor}',                              'pro',  '{}',                   false, 'SUP-0176',  'Instructor',         'Instructor',         'Active',    'cleared', 'Senior Trainer', 'CCTA'),
 ('dana',     'Dana Al-Otaibi',    'دانة العتيبي',  '{ta}',                                      'pro',  '{}',                   false, 'SUP-0262',  'Teaching Assistant', 'TA',                 'Active',    'cleared', null, null),
 ('jassim',   'Jassim Al-Kandari', 'جاسم الكندري',  '{instructor}',                              'youth','{}',                   false, 'SUP-0144',  'Instructor',         'Instructor',         'Active',    'cleared', null, null),
 ('shahad',   'Shahad Al-Dosari',  'شهد الدوسري',   '{instructor}',                              'kids', '{}',                   false, 'SUP-0129',  'Instructor',         null,                 'Active',    'cleared', null, null),
 ('abdulaziz','Abdulaziz Al-Qattan','عبدالعزيز القطان','{gm}',                                   null,   '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('reem',     'Reem Al-Harbi',     'ريم الحربي',    '{hr}',                                      null,   '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('tariq',    'Tariq Al-Shammari', 'طارق الشمري',   '{system_owner}',                            null,   '{}',                   true,  null,        null,                 null,                 null,        'not_started', null, null),
 ('fatma',    'Fatma Al-Rifai',    'فاطمة الرفاعي', '{content_creator}',                         'pro',  '{}',                   false, 'SUP-0270',  'Content Creator',    null,                 'Active',    'not_started', null, null),
 ('ali',      'Ali Mansour',       'علي منصور',     '{}',                                        'pro',  '{}',                   false, 'SUP-0288',  'Instructor',         null,                 'Potential', 'in_pipeline', null, null),
 ('nada',     'Nada Saeed',        'ندى سعيد',      '{}',                                        'pro',  '{}',                   false, 'SUP-0291',  'Teaching Assistant', null,                 'Potential', 'in_pipeline', null, null)
) as p(key, full_name, arabic, roles, seg, owned, ft, erp, cat, lvl, status, appr, rank, cert) on p.key = i.key;

-- Shahad's level is missing in ERPNext: filled on the quality-system side only (25 Oct decision)
update people set qs_instructor_level = 'Instructor' where id = pg_temp.pid('shahad');

-- ── Programs ──────────────────────────────────────────────
insert into _ids (key) values ('p_fs'),('p_aiad'),('p_agw'),('p_ysc'),('p_kwc');
insert into programs (id, name, product, segment_id, program_type, duration_weeks, sessions_per_week) values
 (pg_temp.pid('p_fs'),  'Full Stack Web Bootcamp',     'Full Stack',       'pro',   'bootcamp', 5, 5),
 (pg_temp.pid('p_aiad'),'AI App Developer Bootcamp',   'AI App Developer', 'pro',   'bootcamp', 5, 5),
 (pg_temp.pid('p_agw'), 'Agentic AI for Business',     'Workshops',        'pro',   'short',    1, 3),
 (pg_temp.pid('p_ysc'), 'Youth Summer Coding',         'Youth',            'youth', 'long',     8, 3),
 (pg_temp.pid('p_kwc'), 'Kids Winter Camp',            'Kids',             'kids',  'short',    1, 5);

-- ── Content approvals ─────────────────────────────────────
insert into _ids (key) values ('ci_fs'),('ci_aiad'),('ci_agw'),('ci_kwc'),('ci_ysc');
insert into content_items (id, program_id, title, kind, audience, outcomes, deadline, budget, status, creator_id, approved_version, approved_by, approved_at, created_at) values
 (pg_temp.pid('ci_fs'),  pg_temp.pid('p_fs'),  'Full Stack Web — 5-week curriculum (2026 refresh)', 'update', 'Career switchers, beginner to junior', 'Build and deploy a full-stack app with auth and a database', '2026-09-25',
   '{"hours":60,"rate":20,"total":1200}', 'approved', pg_temp.pid('ahmed'), 2, pg_temp.pid('faisal'), '2026-09-21 10:00+03', '2026-09-01 09:00+03'),
 (pg_temp.pid('ci_aiad'),pg_temp.pid('p_aiad'),'AI App Developer — Cohort 7 update (agents module)', 'update', 'Developers new to AI apps', 'Ship an AI app with tool use and evaluation', '2026-11-08',
   '{"hours":40,"rate":20,"total":800}', 'submitted', pg_temp.pid('fatma'), null, null, null, '2026-10-12 09:00+03'),
 (pg_temp.pid('ci_agw'), pg_temp.pid('p_agw'), 'Agentic AI for Business — 3-day workshop pack', 'new', 'Business teams, non-technical', 'Design and test one agent workflow for their team', '2026-10-12',
   '{"hours":24,"rate":20,"total":480}', 'approved', pg_temp.pid('ahmed'), 1, pg_temp.pid('faisal'), '2026-10-09 13:00+03', '2026-09-28 09:00+03'),
 (pg_temp.pid('ci_kwc'), pg_temp.pid('p_kwc'), 'Kids Winter Camp — Scratch games', 'new', 'Ages 8 to 10', 'Make and share a simple game', '2026-01-05',
   null, 'approved', pg_temp.pid('fatma'), 1, pg_temp.pid('faisal'), '2026-01-04 10:00+03', '2025-12-10 09:00+03'),
 (pg_temp.pid('ci_ysc'), pg_temp.pid('p_ysc'), 'Youth Summer Coding — Python and web', 'new', 'Ages 14 to 17', 'Build a personal website and a Python project', '2026-06-28',
   null, 'approved', pg_temp.pid('fatma'), 1, pg_temp.pid('faisal'), '2026-06-25 10:00+03', '2026-06-01 09:00+03');

insert into content_versions (content_id, version, summary, link, submitted_by, submitted_at, decision, decided_by, decided_at, comments) values
 (pg_temp.pid('ci_fs'), 1, 'First draft of the refreshed curriculum', 'https://example.org/fs-v1', pg_temp.pid('ahmed'), '2026-09-14 10:00+03', 'changes_requested', pg_temp.pid('faisal'), '2026-09-16 12:00+03',
   'Week 3 is 60% lecture. Rework the React days to meet the 70/30 rule and add a struggle task before each solution walkthrough.'),
 (pg_temp.pid('ci_fs'), 2, 'React week reworked; productive-struggle tasks added', 'https://example.org/fs-v2', pg_temp.pid('ahmed'), '2026-09-18 15:00+03', 'approved', pg_temp.pid('faisal'), '2026-09-21 10:00+03', 'Approved. Good use of the Arc in week 4.'),
 (pg_temp.pid('ci_aiad'), 1, 'New agents module (days 11–15) and updated capstone brief', 'https://example.org/aiad-c7', pg_temp.pid('fatma'), '2026-10-26 11:00+03', 'pending', null, null, null),
 (pg_temp.pid('ci_agw'), 1, 'Complete workshop pack with facilitator notes', 'https://example.org/agw-v1', pg_temp.pid('ahmed'), '2026-10-05 09:00+03', 'approved', pg_temp.pid('faisal'), '2026-10-09 13:00+03', null),
 (pg_temp.pid('ci_kwc'), 1, 'Five-day Scratch games plan', null, pg_temp.pid('fatma'), '2025-12-28 09:00+03', 'approved', pg_temp.pid('faisal'), '2026-01-04 10:00+03', null),
 (pg_temp.pid('ci_ysc'), 1, 'Eight-week plan', null, pg_temp.pid('fatma'), '2026-06-20 09:00+03', 'approved', pg_temp.pid('faisal'), '2026-06-25 10:00+03', null);

-- ── Cohorts and classrooms ────────────────────────────────
insert into _ids (key) values ('c_fs'),('c_aiad'),('c_agw'),('c_ysc'),('c_kwc'),
  ('cl_fs_a'),('cl_fs_b'),('cl_fs_c'),('cl_aiad_a'),('cl_aiad_b'),('cl_agw'),('cl_ysc'),('cl_kwc');

insert into cohorts (id, program_id, name, start_date, end_date, status, content_id, content_version, backup_instructor_id, went_live_at, final_report, final_report_at) values
 (pg_temp.pid('c_fs'),  pg_temp.pid('p_fs'),  'Full Stack — Cohort 3 (Oct 2026)',       '2026-10-04','2026-11-05','live',  pg_temp.pid('ci_fs'),  2, pg_temp.pid('jassim'), '2026-10-04 08:00+03', null, null),
 (pg_temp.pid('c_aiad'),pg_temp.pid('p_aiad'),'AI App Developer — Cohort 7 (Nov 2026)', '2026-11-15','2026-12-17','setup', null, null, null, null, null, null),
 (pg_temp.pid('c_agw'), pg_temp.pid('p_agw'), 'Agentic AI for Business — Oct workshop',  '2026-10-18','2026-10-20','closed',pg_temp.pid('ci_agw'), 1, null, '2026-10-18 08:00+03',
   'Strong delivery; one classroom; all QA visits held. Trainees asked for a follow-up clinic.', '2026-10-21 12:00+03'),
 (pg_temp.pid('c_ysc'), pg_temp.pid('p_ysc'), 'Youth Summer Coding 2026',               '2026-07-05','2026-08-27','closed',pg_temp.pid('ci_ysc'), 1, null, '2026-07-05 08:00+03', 'Completed.', '2026-08-30 12:00+03'),
 (pg_temp.pid('c_kwc'), pg_temp.pid('p_kwc'), 'Kids Winter Camp 2026',                  '2026-01-11','2026-01-15','closed',pg_temp.pid('ci_kwc'), 1, null, '2026-01-11 08:00+03', 'Completed.', '2026-01-18 12:00+03');

insert into classrooms (id, cohort_id, name, room, ready) values
 (pg_temp.pid('cl_fs_a'),  pg_temp.pid('c_fs'),  'Classroom A', 'Lab 2.1', true),
 (pg_temp.pid('cl_fs_b'),  pg_temp.pid('c_fs'),  'Classroom B', 'Lab 2.2', true),
 (pg_temp.pid('cl_fs_c'),  pg_temp.pid('c_fs'),  'Classroom C', 'Lab 3.1', true),
 (pg_temp.pid('cl_aiad_a'),pg_temp.pid('c_aiad'),'Classroom A', 'Lab 2.1', false),
 (pg_temp.pid('cl_aiad_b'),pg_temp.pid('c_aiad'),'Classroom B', null, false),
 (pg_temp.pid('cl_agw'),   pg_temp.pid('c_agw'), 'Main room',   'Hall 1', true),
 (pg_temp.pid('cl_ysc'),   pg_temp.pid('c_ysc'), 'Classroom A', 'Lab 1.2', true),
 (pg_temp.pid('cl_kwc'),   pg_temp.pid('c_kwc'), 'Classroom A', 'Kids Lab', true);

insert into classroom_staff (classroom_id, person_id, role, is_lead) values
 (pg_temp.pid('cl_fs_a'), pg_temp.pid('ahmed'), 'instructor', true),
 (pg_temp.pid('cl_fs_a'), pg_temp.pid('mariam'),'ta', false),
 (pg_temp.pid('cl_fs_a'), pg_temp.pid('hamad'), 'ta', false),
 (pg_temp.pid('cl_fs_b'), pg_temp.pid('bader'), 'instructor', false),
 (pg_temp.pid('cl_fs_b'), pg_temp.pid('fahad'), 'ta', false),
 (pg_temp.pid('cl_fs_c'), pg_temp.pid('lulwa'), 'instructor', false),
 (pg_temp.pid('cl_fs_c'), pg_temp.pid('dana'),  'ta', false),
 (pg_temp.pid('cl_aiad_a'), pg_temp.pid('ahmed'), 'instructor', true),
 (pg_temp.pid('cl_agw'), pg_temp.pid('ahmed'), 'instructor', true),
 (pg_temp.pid('cl_agw'), pg_temp.pid('mariam'),'ta', false),
 (pg_temp.pid('cl_agw'), pg_temp.pid('hamad'), 'ta', false),
 (pg_temp.pid('cl_agw'), pg_temp.pid('dana'),  'ta', false),
 (pg_temp.pid('cl_ysc'), pg_temp.pid('jassim'),'instructor', true),
 (pg_temp.pid('cl_ysc'), pg_temp.pid('mariam'),'ta', false),
 (pg_temp.pid('cl_kwc'), pg_temp.pid('shahad'),'instructor', true),
 (pg_temp.pid('cl_kwc'), pg_temp.pid('mariam'),'ta', false);

insert into cohort_roles (cohort_id, person_id, role) values
 (pg_temp.pid('c_fs'),  pg_temp.pid('khalid'), 'overseer'),
 (pg_temp.pid('c_fs'),  pg_temp.pid('huda'),   'senior_instructor'),
 (pg_temp.pid('c_agw'), pg_temp.pid('khalid'), 'overseer'),
 (pg_temp.pid('c_agw'), pg_temp.pid('huda'),   'senior_instructor'),
 (pg_temp.pid('c_ysc'), pg_temp.pid('abeer'),  'overseer'),
 (pg_temp.pid('c_kwc'), pg_temp.pid('abeer'),  'overseer');

update cohorts set qa_plan = '{"type":"bootcamp","weeks":5,"education_weeks":[2,4],"operations_weeks":[3],"shadowing_weeks":[1,2,3,4,5]}' where id = pg_temp.pid('c_fs');
update cohorts set qa_plan = '{"type":"short","weeks":1,"education_weeks":[1],"operations_weeks":[1],"shadowing_weeks":[1]}' where id = pg_temp.pid('c_agw');

-- ── ERPNext mirror: contracts, availability ───────────────
insert into erp_contracts (id, person_id, segment_id, role, program_id, cohort_id, status, start_date, end_date, rate_type, rate, signed_at) values
 ('CON-2026-0412', pg_temp.pid('ahmed'), 'pro',  'Instructor', null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 25, '2026-08-20'),
 ('CON-2026-0413', pg_temp.pid('mariam'),'pro',  'TA',         null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 12, '2026-08-21'),
 ('CON-2026-0151', pg_temp.pid('mariam'),'youth','TA',         pg_temp.pid('p_ysc'), pg_temp.pid('c_ysc'), 'Completed','2026-07-01','2026-08-31','hourly', 10, '2026-06-15'),
 ('CON-2026-0019', pg_temp.pid('mariam'),'kids', 'Assistant',  pg_temp.pid('p_kwc'), pg_temp.pid('c_kwc'), 'Completed','2026-01-10','2026-01-16','daily',  45, '2025-12-28'),
 ('CON-2026-0414', pg_temp.pid('hamad'), 'pro',  'TA',         null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 11, '2026-08-22'),
 ('CON-2026-0415', pg_temp.pid('bader'), 'pro',  'Instructor', null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 22, '2026-08-20'),
 ('CON-2026-0416', pg_temp.pid('fahad'), 'pro',  'TA',         null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 11, '2026-08-23'),
 ('CON-2026-0417', pg_temp.pid('lulwa'), 'pro',  'Instructor', null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 23, '2026-08-20'),
 ('CON-2026-0418', pg_temp.pid('dana'),  'pro',  'TA',         null, null, 'Active',   '2026-09-01','2026-12-31','hourly', 11, '2026-08-24'),
 ('CON-2026-0390', pg_temp.pid('jassim'),null,   'Instructor', null, null, 'Active',   '2026-06-01','2026-12-31','hourly', 20, '2026-05-25'),
 ('CON-2026-0201', pg_temp.pid('shahad'),'kids', 'Instructor', null, null, 'Active',   '2026-01-01','2026-12-31','daily',  70, '2025-12-20'),
 ('CON-2026-0400', pg_temp.pid('huda'),  'pro',  'Senior Instructor', null, null, 'Active', '2026-01-01','2026-12-31','fixed', null, '2025-12-15'),
 ('CON-2026-0471', pg_temp.pid('ali'),   'pro',  'Instructor', pg_temp.pid('p_aiad'), pg_temp.pid('c_aiad'), 'Approved', '2026-11-15','2026-12-17','hourly', 22, '2026-10-25');

insert into erp_availability (person_id, from_date, to_date, note) values
 (pg_temp.pid('sara'), '2026-11-10', '2026-11-11', 'Annual leave'),
 (pg_temp.pid('huda'), '2026-11-05', '2026-11-05', 'Conference');

insert into sync_runs (source, started_at, finished_at, status, records, message) values
 ('erpnext',   now() - interval '22 hours', now() - interval '22 hours' + interval '40 seconds', 'ok', 22, 'Contractor records and contracts read'),
 ('coded_app', now() - interval '22 hours', now() - interval '22 hours' + interval '2 minutes', 'ok', 41, 'Attendance, submissions, roster, chat'),
 ('surveys',   now() - interval '22 hours', now() - interval '22 hours' + interval '15 seconds', 'warning', 9, 'Final survey for Cohort 3 not open yet');

-- ── People approvals ──────────────────────────────────────
insert into _ids (key) values ('pl_ali'),('pl_nada');
insert into pipelines (id, person_id, target_role, segment_id, program_id, status, rate_type, rate, created_by, created_at) values
 (pg_temp.pid('pl_ali'), pg_temp.pid('ali'), 'instructor', 'pro', pg_temp.pid('p_aiad'), 'in_pipeline', 'hourly', 22, pg_temp.pid('huda'), '2026-10-06 10:00+03'),
 (pg_temp.pid('pl_nada'),pg_temp.pid('nada'),'ta',         'pro', pg_temp.pid('p_aiad'), 'in_pipeline', null, null, pg_temp.pid('huda'), '2026-10-27 10:00+03');

insert into pipeline_steps (pipeline_id, step, ord, status, data, notes, done_by, done_at, opened_at) values
 (pg_temp.pid('pl_ali'), 'criteria', 1, 'done', '{}', 'Python, LLM APIs, 3+ years teaching or mentoring.', pg_temp.pid('huda'), '2026-10-06 12:00+03', '2026-10-06 10:00+03'),
 (pg_temp.pid('pl_ali'), 'vetting', 2, 'done', '{"scores":{"technical_depth":26,"live_problem":21,"explains":17,"teaching_instinct":12,"fit":9},"total":85,"recommend":true}',
   'Strong on agents; explained tool calling clearly to a non-developer.', pg_temp.pid('huda'), '2026-10-12 15:00+03', '2026-10-06 12:00+03'),
 (pg_temp.pid('pl_ali'), 'selection_rate', 3, 'done', '{"rate":22,"rate_type":"hourly"}', 'Selected for AI App Developer Cohort 7.', pg_temp.pid('noura'), '2026-10-14 11:00+03', '2026-10-12 15:00+03'),
 (pg_temp.pid('pl_ali'), 'contract', 4, 'done', '{"erp_contract":"CON-2026-0471","erp_status":"Approved","signed_at":"2026-10-25"}', 'Signed 21 days before Day 1.', pg_temp.pid('reem'), '2026-10-25 14:00+03', '2026-10-14 11:00+03'),
 (pg_temp.pid('pl_ali'), 'onboarding', 5, 'done', '{}', 'Curriculum onboarding completed with Huda.', pg_temp.pid('huda'), '2026-10-22 16:00+03', '2026-10-25 14:00+03'),
 (pg_temp.pid('pl_ali'), 'mock1', 6, 'done', '{"total":84,"result":"CCTA"}', null, pg_temp.pid('huda'), '2026-10-23 13:00+03', '2026-10-22 16:00+03'),
 (pg_temp.pid('pl_ali'), 'mock2', 7, 'pending', '{}', null, null, null, '2026-10-26 09:00+03'),
 (pg_temp.pid('pl_ali'), 'cleared', 8, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'criteria', 1, 'done', '{}', 'Comfortable with the tools; available for every session.', pg_temp.pid('huda'), '2026-10-27 12:00+03', '2026-10-27 10:00+03'),
 (pg_temp.pid('pl_nada'),'vetting', 2, 'pending', '{}', null, null, null, '2026-10-27 12:00+03'),
 (pg_temp.pid('pl_nada'),'selection_rate', 3, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'contract', 4, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'onboarding', 5, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'mock1', 6, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'mock2', 7, 'pending', '{}', null, null, null, null),
 (pg_temp.pid('pl_nada'),'cleared', 8, 'pending', '{}', null, null, null, null);

insert into mock_results (person_id, pipeline_id, context, scores, critical_failures, total, result, feedback, assessor_id, created_at) values
 (pg_temp.pid('ali'), pg_temp.pid('pl_ali'), 'mock1', '{"arc":17,"struggle":12,"mentorship":17,"collaborative":13,"supportive":13,"real_life":12}', '{}', 84, 'CCTA',
  'Clear Arc and good real-life examples. In the struggle task you stepped in after 90 seconds; let the pair work for at least five minutes before hinting.', pg_temp.pid('huda'), '2026-10-23 13:00+03');

-- ── CODED App mirror for the live Full Stack cohort ───────
create temp table _names (n int, name text);
insert into _names select row_number() over (), x from unnest(array[
 'Abdullah K.','Fatemah S.','Hussain M.','Latifa A.','Mohammad R.','Noor H.','Saud B.','Rawan T.','Yaqoub F.','Haya Q.','Faisal J.','Aisha D.',
 'Talal N.','Sheikha W.','Omar Z.','Maha L.','Nasser G.','Bodour E.','Salem P.','Hessa V.','Mubarak C.','Reem Y.','Ibrahim O.','Lama U.',
 'Ahmad I.','Shahad K.','Ziad T.','Dalal S.','Majed H.','Nouf A.','Hamza B.','Sarah M.','Khaled R.','Jana F.','Waleed Q.','Asma D.']) x;

insert into app_trainees (cohort_id, classroom_id, name)
select pg_temp.pid('c_fs'), pg_temp.pid(case when n <= 12 then 'cl_fs_a' when n <= 24 then 'cl_fs_b' else 'cl_fs_c' end), name from _names;
insert into app_trainees (cohort_id, classroom_id, name)
select pg_temp.pid('c_agw'), pg_temp.pid('cl_agw'), name from _names where n between 1 and 20;

-- Sessions: Sunday to Thursday, 09:00 Kuwait time
insert into app_sessions (classroom_id, starts_at, topic, attendance_logged_at, logged_by)
select cl.id, pg_temp.kw(d::date, '09:00'),
  (array['HTML and CSS foundations','JavaScript fundamentals','React and components','Node, Express and APIs','Databases and deployment'])[least(5, ((d::date - date '2026-10-04') / 7) + 1)],
  case
    when pg_temp.kw(d::date,'09:00') > now() - interval '20 hours' then null
    when cl.key = 'cl_fs_b' and d::date = date '2026-10-29' then null
    when cl.key = 'cl_fs_b' and d::date in (date '2026-10-26', date '2026-10-27') then pg_temp.kw(d::date,'09:00') + interval '31 hours'
    when cl.key = 'cl_fs_b' then pg_temp.kw(d::date,'09:00') + interval '5 hours'
    when cl.key = 'cl_fs_c' then pg_temp.kw(d::date,'09:00') + interval '3 hours'
    else pg_temp.kw(d::date,'09:00') + interval '2 hours' end,
  case when cl.key = 'cl_fs_a' and extract(isodow from d) in (2,3) then pg_temp.pid('mariam')
       when cl.key = 'cl_fs_a' then pg_temp.pid('ahmed')
       when cl.key = 'cl_fs_b' then pg_temp.pid('bader') else pg_temp.pid('lulwa') end
from generate_series(date '2026-10-04', date '2026-11-01', interval '1 day') d
cross join (select key, id from _ids where key in ('cl_fs_a','cl_fs_b','cl_fs_c')) cl
where extract(isodow from d) in (7,1,2,3,4);

insert into app_sessions (classroom_id, starts_at, topic, attendance_logged_at, logged_by)
select pg_temp.pid('cl_agw'), pg_temp.kw(d::date,'09:00'), 'Agentic AI for Business — day ' || (d::date - date '2026-10-18' + 1),
       pg_temp.kw(d::date,'09:00') + interval '4 hours', pg_temp.pid('ahmed')
from generate_series(date '2026-10-18', date '2026-10-20', interval '1 day') d;

insert into app_attendance (session_id, trainee_id, present)
select s.id, t.id,
  case when s.attendance_logged_at is null then true
       when t.name in ('Talal N.','Sheikha W.') and s.starts_at >= pg_temp.kw('2026-10-28','09:00') then false
       else abs(hashtext(s.id::text || t.id::text)) % 100 >= 8 end
from app_sessions s join app_trainees t on t.classroom_id = s.classroom_id
where s.attendance_logged_at is not null;

-- Tasks: two per week (due Tuesday and Thursday 21:00), one due tonight
insert into app_tasks (classroom_id, title, due_at, week_no)
select cl.id, 'Week ' || w || ' — ' || (array['Lab','Project checkpoint'])[k], pg_temp.kw(date '2026-10-04' + (w-1)*7 + case when k = 1 then 2 else 4 end, '21:00'), w
from generate_series(1,4) w cross join generate_series(1,2) k
cross join (select id from _ids where key in ('cl_fs_a','cl_fs_b','cl_fs_c')) cl;
insert into app_tasks (classroom_id, title, due_at, week_no)
select id, 'Week 5 — Deployment lab', pg_temp.kw('2026-11-01','21:00'), 5 from _ids where key in ('cl_fs_a','cl_fs_b','cl_fs_c');

insert into app_submissions (task_id, trainee_id, status, submitted_at, graded_at, graded_by)
select t.id, tr.id, x.status, x.submitted_at,
  case when x.status in ('completed','needs_changes') then x.graded_at end,
  case when x.status in ('completed','needs_changes') then x.grader end
from app_tasks t join app_trainees tr on tr.classroom_id = t.classroom_id
join _ids cl on cl.id = t.classroom_id
cross join lateral (select abs(hashtext(t.id::text || tr.id::text)) % 100 as h) hh
cross join lateral (
  select
    case
      when t.due_at > now() then 'pending'
      when tr.name = 'Talal N.' and t.week_no >= 3 then 'missed'
      when hh.h < 4 then 'missed'
      when cl.key = 'cl_fs_c' and t.week_no = 4 and t.title like '%Lab' and hh.h < 45 then 'submitted'
      when hh.h > 88 then 'needs_changes'
      else 'completed' end as status,
    t.due_at - ((2 + hh.h % 28) || ' hours')::interval as submitted_at,
    t.due_at - ((2 + hh.h % 28) || ' hours')::interval
      + case when cl.key = 'cl_fs_a' then interval '20 hours'
             when cl.key = 'cl_fs_b' then interval '44 hours'
             when cl.key = 'cl_fs_c' and t.week_no = 4 then interval '90 hours'
             else interval '30 hours' end as graded_at,
    case when cl.key = 'cl_fs_a' and hh.h % 2 = 0 then pg_temp.pid('mariam')
         when cl.key = 'cl_fs_a' then pg_temp.pid('ahmed')
         when cl.key = 'cl_fs_b' then pg_temp.pid('bader') else pg_temp.pid('lulwa') end as grader
) x;
update app_submissions set submitted_at = null where status in ('pending','missed');
-- grades in the future are not real yet
update app_submissions set status = 'submitted', graded_at = null, graded_by = null where graded_at > now();

insert into app_chat_replies (classroom_id, asked_at, replied_at, replied_by)
select cl.id, pg_temp.kw(date '2026-10-04' + g, '19:00'),
  pg_temp.kw(date '2026-10-04' + g, '19:00') + case when cl.key = 'cl_fs_b' and g % 3 = 0 then interval '30 hours' else interval '4 hours' end,
  case when cl.key = 'cl_fs_a' and g % 2 = 0 then pg_temp.pid('hamad') when cl.key = 'cl_fs_a' then pg_temp.pid('ahmed')
       when cl.key = 'cl_fs_b' then pg_temp.pid('fahad') else pg_temp.pid('lulwa') end
from generate_series(0, 26, 2) g cross join (select key, id from _ids where key in ('cl_fs_a','cl_fs_b','cl_fs_c')) cl;

insert into app_pulse (classroom_id, instructor_id, taken_at, instructor_item, too_fast_pct, responses, enrolled) values
 (pg_temp.pid('cl_fs_a'), pg_temp.pid('ahmed'), '2026-10-21 14:00+03', 4.5, 12, 11, 12),
 (pg_temp.pid('cl_fs_b'), pg_temp.pid('bader'), '2026-10-21 14:00+03', 3.4, 36, 11, 12),
 (pg_temp.pid('cl_fs_c'), pg_temp.pid('lulwa'), '2026-10-21 14:00+03', 4.2, 18, 10, 12);

-- Survey results (stay in the ERP; shown per person, per area)
insert into survey_results (cohort_id, subject_id, survey, area, avg, responses, enrolled, screened_comments) values
 (pg_temp.pid('c_agw'), pg_temp.pid('ahmed'), 'final', 'Clarity', 4.6, 15, 20, '{"Explained agents with real examples from our work."}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('ahmed'), 'final', 'Engagement', 4.5, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('ahmed'), 'final', 'Practical relevance', 4.7, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('ahmed'), 'final', 'Pace', 4.2, 15, 20, '{"Day 2 afternoon felt rushed."}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('ahmed'), 'final', 'Overall', 4.6, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('mariam'),'final', 'Support quality', 4.4, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('mariam'),'final', 'Availability', 4.5, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('mariam'),'final', 'Clarity of help', 4.3, 15, 20, '{}'),
 (pg_temp.pid('c_agw'), pg_temp.pid('mariam'),'final', 'Respect', 4.7, 15, 20, '{"Very patient with our questions."}'),
 (pg_temp.pid('c_ysc'), pg_temp.pid('mariam'),'final', 'Overall', 4.4, 18, 24, '{}'),
 (pg_temp.pid('c_kwc'), pg_temp.pid('mariam'),'final', 'Overall', 4.1, 14, 20, '{}'),
 (pg_temp.pid('c_fs'),  pg_temp.pid('ahmed'), 'pulse', 'Overall', 4.5, 11, 12, '{}'),
 (pg_temp.pid('c_fs'),  pg_temp.pid('bader'), 'pulse', 'Overall', 3.4, 11, 12, '{"Too fast in React week."}'),
 (pg_temp.pid('c_fs'),  pg_temp.pid('lulwa'), 'pulse', 'Overall', 4.2, 10, 12, '{}');

-- ── Visits, scores and released feedback ──────────────────
create function pg_temp.add_visit(p_cohort text, p_classroom text, p_kind text, p_qa text, p_week int, p_assignee text, p_at timestamptz,
  p_tpl text, p_release text, p_summary text, p_one text, p_actions text, p_subjects jsonb, p_channel text default 'email',
  p_flags text[] default '{}', p_interventions jsonb default '[]', p_ack text default 'ack') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); t qa_templates; s jsonb; sc jsonb; r record; p uuid; i int := 0;
begin
  select * into t from qa_templates where key = p_tpl and status <> 'retired' order by version desc limit 1;
  insert into visits (id, cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, status,
     created_by, attendance, interventions, checklist, action_points, flags, summary, one_thing, submitted_at, release_status, released_at, created_at)
  values (v_id, pg_temp.pid(p_cohort), pg_temp.pid(p_classroom), p_kind, p_qa, 'planned', 'class', t.id, pg_temp.pid(p_assignee), p_at, p_week, 'completed',
     pg_temp.pid('noura'), 'full', p_interventions,
     case when p_kind = 'shadowing' then '{"on_time":true,"goal_shared":true,"hands_on":true,"circulating":true,"tas_active":true,"materials_ok":true,"climate":true}'::jsonb end,
     p_actions, p_flags, p_summary, p_one, p_at + interval '5 hours', p_release,
     case when p_release = 'released' then p_at + interval '22 hours' end, p_at - interval '10 days');
  for s in select * from jsonb_array_elements(coalesce(p_subjects, '[]')) loop
    i := i + 1;
    sc := pg_temp.items_for(t.rubric, s->>'role', (s->>'pct')::numeric, i + p_week * 10);
    select * into r from _score_subject(t.rubric, s->>'role', sc, '{}');
    insert into visit_scores (visit_id, subject_person_id, subject_role, scores, total, max, pct)
    values (v_id, case when s->>'who' is not null then pg_temp.pid(s->>'who') end, s->>'role', sc, r.total, r.max, r.pct);
  end loop;
  if p_release = 'released' then
    for p in select pg_temp.pid(x->>'who') from jsonb_array_elements(p_subjects) x where x->>'who' is not null
             union select cs.person_id from classroom_staff cs where cs.classroom_id = pg_temp.pid(p_classroom) and p_kind = 'shadowing' loop
      insert into released_feedback (subject_id, visit_id, cohort_id, kind, title, body, one_thing, action_points, channel, released_by, released_at, ack_at)
      values (p, v_id, pg_temp.pid(p_cohort), 'visit',
              case when p_kind = 'shadowing' then 'Shadowing visit' else initcap(p_qa) || ' QA visit' end || ' — week ' || p_week,
              p_summary, p_one, p_actions, p_channel, pg_temp.pid(case when p_cohort in ('c_ysc','c_kwc') then 'yousef' else 'noura' end),
              p_at + interval '22 hours',
              case when p_ack = 'none' then null when p_ack = 'late' then p_at + interval '80 hours' else p_at + interval '30 hours' end);
    end loop;
  end if;
  return v_id;
end $$;

-- Agentic AI workshop (closed)
select pg_temp.add_visit('c_agw','cl_agw','qa','education',1,'sara', pg_temp.kw('2026-10-19','10:00'),'edu_class','released',
  'Confident facilitation and real business examples. Trainees built a working agent flow by day 2.',
  'Leave a longer silence after each question before calling on someone.', 'Add a 5-minute exit check at the end of each day.',
  '[{"who":"ahmed","role":"instructor","pct":92},{"who":"mariam","role":"ta","pct":88},{"who":"hamad","role":"ta","pct":84},{"who":"dana","role":"ta","pct":86},{"role":"class","pct":90}]');
select pg_temp.add_visit('c_agw','cl_agw','qa','operations',1,'khalid', pg_temp.kw('2026-10-20','09:00'),'ops_classroom','released',
  'Room ready, attendance logged within hours, all requests closed the same day.', null, null,
  '[{"who":"ahmed","role":"instructor","pct":95},{"who":"mariam","role":"ta","pct":90},{"who":"hamad","role":"ta","pct":85},{"who":"dana","role":"ta","pct":92}]');
select pg_temp.add_visit('c_agw','cl_agw','shadowing',null,1,'khalid', pg_temp.kw('2026-10-18','11:00'),'shadowing_checklist','released',
  'Good energy in the room; trainees were hands-on within 20 minutes.', null, 'Print the team handout before day 2.', '[]');

-- Full Stack Cohort 3 (live): shadowing weeks 1–4
select pg_temp.add_visit('c_fs', c.cl, 'shadowing', null, w, (array['khalid','sara','huda','khalid'])[w],
  pg_temp.kw(date '2026-10-06' + (w-1)*7, '11:00'), 'shadowing_checklist', case when w = 4 then 'pending' else 'released' end,
  (array['Trainees settled quickly; good pair-programming setup.','Clear goals on the board; one pair stuck on setup for 15 minutes.',
         'Strong energy in the React lab; TAs active.','Room was hands-on most of the session; some trainees waiting for help.'])[w],
  null, (array['Share the session goal in the first 5 minutes.','Check laptops before the lab starts.','Rotate TAs between pairs every 20 minutes.','Use a help queue on the board.'])[w], '[]')
from generate_series(1,4) w cross join (values ('cl_fs_a'),('cl_fs_b'),('cl_fs_c')) c(cl);

-- Education QA week 2 (released)
select pg_temp.add_visit('c_fs','cl_fs_a','qa','education',2,'sara', pg_temp.kw('2026-10-12','09:30'),'edu_class','released',
  'Well-structured JavaScript session; trainees debugged their own errors before you stepped in.',
  'Time-box the explanation segments to 10 minutes.', 'Use the timer on screen during labs.',
  '[{"who":"ahmed","role":"instructor","pct":89},{"who":"mariam","role":"ta","pct":86},{"who":"hamad","role":"ta","pct":81},{"role":"class","pct":88}]');
select pg_temp.add_visit('c_fs','cl_fs_b','qa','education',2,'sara', pg_temp.kw('2026-10-13','09:30'),'edu_class','released',
  'Good knowledge of the material. The lecture part ran long and the lab started 30 minutes late.',
  'Start the lab within 20 minutes of the session start (70/30 rule).', 'Move the long demo into a short video before class.',
  '[{"who":"bader","role":"instructor","pct":78},{"who":"fahad","role":"ta","pct":80},{"role":"class","pct":76}]', 'call_email');
select pg_temp.add_visit('c_fs','cl_fs_c','qa','education',2,'sara', pg_temp.kw('2026-10-14','09:30'),'edu_class','released',
  'Calm, clear explanations and good checks for understanding.', 'Let trainees struggle a little longer before giving hints.', null,
  '[{"who":"lulwa","role":"instructor","pct":85},{"who":"dana","role":"ta","pct":83},{"role":"class","pct":84}]');

-- Operations QA week 3 (released)
select pg_temp.add_visit('c_fs','cl_fs_a','qa','operations',3,'khalid', pg_temp.kw('2026-10-20','08:45'),'ops_classroom','released',
  'On time, records current, room ready.', null, null,
  '[{"who":"ahmed","role":"instructor","pct":93},{"who":"mariam","role":"ta","pct":90},{"who":"hamad","role":"ta","pct":88}]');
select pg_temp.add_visit('c_fs','cl_fs_b','qa','operations',3,'khalid', pg_temp.kw('2026-10-20','08:45'),'ops_classroom','released',
  'Session started 8 minutes late; attendance records behind by two days.', null, 'Log attendance before leaving the room.',
  '[{"who":"bader","role":"instructor","pct":80},{"who":"fahad","role":"ta","pct":85}]', 'call_email', '{}', '[]', 'late');
select pg_temp.add_visit('c_fs','cl_fs_c','qa','operations',3,'khalid', pg_temp.kw('2026-10-21','08:45'),'ops_classroom','released',
  'Good room setup; grading slightly behind.', null, null,
  '[{"who":"lulwa","role":"instructor","pct":90},{"who":"dana","role":"ta","pct":88}]');

-- Education QA week 4 (A and B waiting for release; C released)
select pg_temp.add_visit('c_fs','cl_fs_a','qa','education',4,'huda', pg_temp.kw('2026-10-26','09:30'),'edu_class','pending',
  'Excellent API session. The timer kept the explanation tight; trainees spent most of the time building.',
  'Ask one trainee to explain their fix to the room each lab.', 'Pair Hamad with a stronger TA for the deployment week.',
  '[{"who":"ahmed","role":"instructor","pct":92},{"who":"mariam","role":"ta","pct":89},{"who":"hamad","role":"ta","pct":84},{"role":"class","pct":90}]',
  'email', '{}', '[{"kind":"signal","trigger":"Pacing: demo running long","said":"Quiet note at the break to move to the lab","outcome":"Lab started 5 minutes later"}]');
select pg_temp.add_visit('c_fs','cl_fs_b','qa','education',4,'sara', pg_temp.kw('2026-10-27','09:30'),'edu_class','pending',
  'The session ran mostly as lecture. Several trainees were lost in the Express routing part and the TA was not briefed on the lab.',
  'Brief Fahad before each session and start the lab within 20 minutes.', 'Shadow a Tier 1 instructor before the next cohort.',
  '[{"who":"bader","role":"instructor","pct":72},{"who":"fahad","role":"ta","pct":79},{"role":"class","pct":74}]',
  'face_email', '{remediation_shadow_tier1}',
  '[{"kind":"intervene","trigger":"A misconception about middleware order was forming","said":"Gave a two-minute example of middleware order","outcome":"Handed back to the instructor; left at the next break"}]');
select pg_temp.add_visit('c_fs','cl_fs_c','qa','education',4,'huda', pg_temp.kw('2026-10-28','09:30'),'edu_class','released',
  'Strong live debugging: trainees led the fix. Grading is running behind.', 'Clear the grading backlog every evening before the next session.', null,
  '[{"who":"lulwa","role":"instructor","pct":88},{"who":"dana","role":"ta","pct":85},{"role":"class","pct":86}]', 'email', '{}', '[]', 'none');

-- Upcoming visits (week 5)
insert into visits (cohort_id, classroom_id, kind, qa_type, mode, focus, template_id, assignee_id, scheduled_for, week_no, status, created_by)
values
 (pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_a'), 'shadowing', null, 'planned', 'class', (select id from qa_templates where key='shadowing_checklist'), pg_temp.pid('khalid'), pg_temp.kw('2026-11-02','11:00'), 5, 'accepted', pg_temp.pid('noura')),
 (pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), 'shadowing', null, 'planned', 'class', (select id from qa_templates where key='shadowing_checklist'), pg_temp.pid('sara'),   pg_temp.kw('2026-11-02','11:00'), 5, 'invited',  pg_temp.pid('noura')),
 (pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_c'), 'shadowing', null, 'planned', 'class', (select id from qa_templates where key='shadowing_checklist'), null,                  pg_temp.kw('2026-11-03','11:00'), 5, 'planned',  pg_temp.pid('noura')),
 (pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), 'qa', 'education', 'pulse', 'instructor', (select id from qa_templates where key='edu_class'), pg_temp.pid('sara'), pg_temp.kw('2026-11-03','09:30'), 5, 'invited', pg_temp.pid('noura'));
update visits set focus_person_id = pg_temp.pid('bader') where mode = 'pulse';

-- ── Private notes (feedback any time) ─────────────────────
insert into feedback (subject_id, cohort_id, classroom_id, author_id, type, severity, red_flag_reason, body, status, reviewed_by, reviewed_at, created_at) values
 (pg_temp.pid('bader'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), pg_temp.pid('huda'),  'concern', 'minor', null,
  'Pacing too fast in the React days; several trainees lost and copying code without understanding.', 'released', pg_temp.pid('noura'), '2026-10-23 10:00+03', '2026-10-22 15:00+03'),
 (pg_temp.pid('bader'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), pg_temp.pid('khalid'),'concern', 'minor', null,
  'Started 12 minutes late on Tuesday; trainees waited in the lab.', 'private', null, null, '2026-10-28 09:20+03'),
 (pg_temp.pid('bader'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), pg_temp.pid('sara'),  'concern', 'serious', null,
  'TA was not briefed on the lab; Fahad had to read the task with trainees.', 'private', null, null, '2026-10-27 13:00+03'),
 (pg_temp.pid('bader'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_b'), pg_temp.pid('khalid'),'incident', 'red_flag', 'More than 15 minutes late or no-show',
  'Arrived 20 minutes late on Thursday 29 Oct; Fahad started the session.', 'private', null, null, '2026-10-29 09:25+03'),
 (pg_temp.pid('lulwa'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_c'), pg_temp.pid('huda'),  'praise', 'positive', null,
  'Excellent live debugging walkthrough — trainees led the fix and explained it to each other.', 'private', null, null, '2026-10-30 12:00+03'),
 (pg_temp.pid('hamad'), pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_a'), pg_temp.pid('ahmed'), 'coaching', 'minor', null,
  'Hamad answers questions by typing the fix for trainees. Coach him to ask guiding questions instead.', 'private', null, null, '2026-10-29 18:00+03'),
 (pg_temp.pid('mariam'),pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_a'), pg_temp.pid('khalid'),'praise', 'positive', null,
  'Mariam ran a short help clinic at the break for trainees who were behind.', 'released', pg_temp.pid('noura'), '2026-10-16 11:00+03', '2026-10-15 13:00+03'),
 (pg_temp.pid('dana'),  pg_temp.pid('c_fs'), pg_temp.pid('cl_fs_c'), pg_temp.pid('khalid'),'concern', 'minor', null,
  'Left 15 minutes early on Monday without telling the instructor.', 'kept_private', pg_temp.pid('noura'), '2026-10-20 10:00+03', '2026-10-19 16:00+03');

insert into released_feedback (subject_id, feedback_id, cohort_id, kind, title, body, channel, released_by, released_at, ack_at, reply)
select f.subject_id, f.id, f.cohort_id, 'note', case f.type when 'praise' then 'Praise' else 'Concern' end,
  case when f.subject_id = pg_temp.pid('bader') then 'Pacing in the React days was too fast for part of the room. Check understanding before moving on.' else f.body end,
  case when f.type = 'praise' then 'email' else 'call_email' end, f.reviewed_by, f.reviewed_at,
  f.reviewed_at + interval '20 hours', case when f.subject_id = pg_temp.pid('bader') then 'Understood — I will add a check before each new topic.' end
from feedback f where f.status = 'released';

-- ── 360 reviews (workshop, window open until 3 Nov) ───────
insert into reviews_360 (cohort_id, classroom_id, reviewer_id, subject_id, reviewer_role, subject_role, items, comment, submitted_at)
select pg_temp.pid('c_agw'), pg_temp.pid('cl_agw'), pg_temp.pid(r), pg_temp.pid(s), rr, sr, i::jsonb, c, '2026-10-23 12:00+03'
from (values
 ('mariam','ahmed','ta','instructor','{"briefing":5,"support":5,"respect":5}','Always clear on what he needed from us.'),
 ('hamad','ahmed','ta','instructor','{"briefing":4,"support":5,"respect":5}',null),
 ('dana','ahmed','ta','instructor','{"briefing":5,"support":4,"respect":5}',null),
 ('khalid','ahmed','operations','instructor','{"punctuality":5,"records_on_time":4,"requests_on_time":5}',null),
 ('ahmed','mariam','instructor','ta','{"learner_support":5,"initiative":4,"follows_brief":5}','Takes initiative with struggling trainees.'),
 ('hamad','mariam','ta','ta','{"collaboration":5,"reliability":5}',null),
 ('dana','mariam','ta','ta','{"collaboration":4,"reliability":5}',null),
 ('khalid','mariam','operations','ta','{"punctuality":5,"records_on_time":5,"requests_on_time":4}',null),
 ('ahmed','hamad','instructor','ta','{"learner_support":4,"initiative":4,"follows_brief":4}',null),
 ('mariam','hamad','ta','ta','{"collaboration":4,"reliability":5}',null),
 ('khalid','hamad','operations','ta','{"punctuality":4,"records_on_time":4,"requests_on_time":5}',null),
 ('ahmed','dana','instructor','ta','{"learner_support":4,"initiative":5,"follows_brief":4}',null),
 ('mariam','dana','ta','ta','{"collaboration":5,"reliability":4}',null),
 ('ahmed','khalid','instructor','operations','{"readiness":5,"follow_up":5,"records_on_time":4}',null),
 ('hamad','khalid','ta','operations','{"readiness":5,"follow_up":4,"responsiveness":5}',null)
) v(r, s, rr, sr, i, c);

-- ── JD checklist (workshop, confirmed by the lead) ────────
insert into jd_ticks (person_id, cohort_id, item_id, done, source, confirmed_by, confirmed_at)
select pg_temp.pid('ahmed'), pg_temp.pid('c_agw'), ji.id, ji.key <> 'correction_plans', 'lead', pg_temp.pid('noura'), '2026-10-22 10:00+03'
from jd_items ji where ji.role = 'instructor';
insert into jd_ticks (person_id, cohort_id, item_id, done, source, confirmed_by, confirmed_at)
select p.id, pg_temp.pid('c_agw'), ji.id, not (ji.key = 'delegated_one_on_ones' or (p.key = 'hamad' and ji.key = 'chat_replies')), 'lead', pg_temp.pid('ahmed'), '2026-10-22 10:00+03'
from jd_items ji cross join (select key, id from _ids where key in ('mariam','hamad','dana')) p where ji.role = 'ta';
-- Live cohort: lead confirmations so far
insert into jd_ticks (person_id, cohort_id, item_id, done, source, confirmed_by, confirmed_at)
select p.id, pg_temp.pid('c_fs'), ji.id, ji.key in ('one_on_ones','outlines_assessments','briefs_tas') or (p.key <> 'bader' and ji.key = 'retention'),
       'lead', pg_temp.pid('huda'), '2026-10-30 10:00+03'
from jd_items ji cross join (select key, id from _ids where key in ('ahmed','bader','lulwa')) p
where ji.role = 'instructor' and ji.evidence = 'lead' and not (p.key = 'bader' and ji.key = 'briefs_tas');

insert into accountability_entries (person_id, cohort_id, label, score, entered_by, created_at) values
 (pg_temp.pid('ahmed'), pg_temp.pid('c_fs'), 'Covered an extra clinic session for Classroom B', 100, pg_temp.pid('khalid'), '2026-10-22 18:00+03'),
 (pg_temp.pid('bader'), pg_temp.pid('c_fs'), 'Late start, 28 Oct', 60, pg_temp.pid('khalid'), '2026-10-28 10:00+03');

-- ── Earlier quarters (already computed before this build) ─
insert into composites (person_id, period, segment_id, role, components, total, tier, provisional, gate_failures, computed_at)
select pg_temp.pid(k), p, s, r, c::jsonb, t, tr, false, '{}', ca::timestamptz from (values
 ('mariam','2026-Q1','kids','ta','{"qa":{"score":82,"n":1,"weight":50},"ops":{"score":88,"n":1,"weight":20},"r360":{"score":84,"n":4,"weight":20},"acc":{"score":85,"weight":10}}', 84.0, 3, '2026-03-31 18:00+03'),
 ('mariam','2026-Q3','youth','ta','{"qa":{"score":86,"n":2,"weight":50},"ops":{"score":90,"n":1,"weight":20},"r360":{"score":90,"n":3,"weight":20},"acc":{"score":80,"weight":10}}', 87.0, 2, '2026-09-30 18:00+03'),
 ('ahmed','2026-Q1','pro','instructor','{"qa":{"score":85,"n":2,"weight":50},"ops":{"score":88,"n":1,"weight":20},"r360":{"score":86,"n":4,"weight":20},"acc":{"score":88,"weight":10}}', 86.1, 2, '2026-03-31 18:00+03'),
 ('ahmed','2026-Q2','pro','instructor','{"qa":{"score":87,"n":2,"weight":50},"ops":{"score":90,"n":1,"weight":20},"r360":{"score":88,"n":3,"weight":20},"acc":{"score":90,"weight":10}}', 88.1, 2, '2026-06-30 18:00+03'),
 ('ahmed','2026-Q3','pro','instructor','{"qa":{"score":90,"n":2,"weight":50},"ops":{"score":92,"n":1,"weight":20},"r360":{"score":90,"n":4,"weight":20},"acc":{"score":92,"weight":10}}', 90.6, 1, '2026-09-30 18:00+03'),
 ('jassim','2026-Q3','youth','instructor','{"qa":{"score":91,"n":2,"weight":50},"ops":{"score":90,"n":1,"weight":20},"r360":{"score":92,"n":3,"weight":20},"acc":{"score":90,"weight":10}}', 91.0, 1, '2026-09-30 18:00+03'),
 ('shahad','2026-Q1','kids','instructor','{"qa":{"score":88,"n":1,"weight":50},"ops":{"score":86,"n":1,"weight":20},"r360":{"score":90,"n":3,"weight":20},"acc":{"score":88,"weight":10}}', 88.2, 2, '2026-03-31 18:00+03'),
 ('bader','2026-Q3','pro','instructor','{"qa":{"score":84,"n":2,"weight":50},"ops":{"score":86,"n":1,"weight":20},"r360":{"score":85,"n":3,"weight":20},"acc":{"score":80,"weight":10}}', 84.2, 3, '2026-09-30 18:00+03')
) v(k, p, s, r, c, t, tr, ca);

insert into plans (person_id, kind, composite_id, opened_at, due, goals, status, opened_by)
select pg_temp.pid('bader'), 'coaching', c.id, '2026-10-02 10:00+03', '2026-10-16',
  '[{"goal":"Start the lab within 20 minutes of the session start","done":true},{"goal":"Brief the TA before every session","done":false},{"goal":"Clear grading within 72 hours","done":true}]', 'open', pg_temp.pid('noura')
from composites c where c.person_id = pg_temp.pid('bader') and c.period = '2026-Q3';

-- ── This quarter: compute from the evidence above ─────────
select _compute_one(p.id, '2026-Q4', 'pro') from (
  select distinct cs.person_id id from classroom_staff cs join classrooms cl on cl.id = cs.classroom_id join cohorts co on co.id = cl.cohort_id
  join programs pr on pr.id = co.program_id where pr.segment_id = 'pro' and co.start_date <= '2026-12-31' and co.end_date >= '2026-10-01') p;

-- ── A few notifications and audit entries so the inboxes are not empty ──
insert into notifications (person_id, title, body, link, created_at) values
 (pg_temp.pid('noura'), 'Red flag — same-day review', 'Bader Al-Shatti: More than 15 minutes late or no-show', '/feedback/release', '2026-10-29 09:26+03'),
 (pg_temp.pid('noura'), 'Red flag: observation under 75', 'Bader Al-Shatti scored 72. They must shadow a Tier 1 instructor before the next cohort.', '/feedback/release', '2026-10-27 14:30+03'),
 (pg_temp.pid('noura'), 'Pattern: consider a Coaching Plan', 'Bader Al-Shatti has 3 concern notes in this cohort.', '/people/' || pg_temp.pid('bader'), '2026-10-28 09:21+03'),
 (pg_temp.pid('faisal'),'Content waiting for approval', 'AI App Developer — Cohort 7 update (agents module) — version 1', '/approvals/content/' || pg_temp.pid('ci_aiad'), '2026-10-26 11:01+03'),
 (pg_temp.pid('sara'),  'Education QA visit invite', 'Tue 03 Nov, 09:30 — Classroom B pulse check', '/visits', '2026-10-31 10:00+03'),
 (pg_temp.pid('ahmed'), 'New feedback on your dashboard', 'Education QA visit — week 2', '/me', '2026-10-13 08:00+03'),
 (pg_temp.pid('mariam'),'360° reviews are open', 'Review your classroom team within 14 days.', '/reviews', '2026-10-21 09:00+03'),
 (pg_temp.pid('huda'),  'Reminder: approval step overdue', 'Ali Mansour — mock class 2', '/approvals/people/' || pg_temp.pid('pl_ali'), now() - interval '2 hours');

insert into audit_log (actor_id, action, entity, entity_id, data, at) values
 (pg_temp.pid('faisal'), 'content.approved', 'content', pg_temp.pid('ci_fs')::text, '{"version":2}', '2026-09-21 10:00+03'),
 (pg_temp.pid('noura'),  'cohort.go_live', 'cohort', pg_temp.pid('c_fs')::text, '{"ok":true}', '2026-10-04 08:00+03'),
 (pg_temp.pid('reem'),   'pipeline.step.done', 'pipeline', pg_temp.pid('pl_ali')::text, '{"step":"contract"}', '2026-10-25 14:00+03'),
 (pg_temp.pid('huda'),   'pipeline.mock', 'pipeline', pg_temp.pid('pl_ali')::text, '{"step":"mock1","total":84,"result":"CCTA"}', '2026-10-23 13:00+03'),
 (pg_temp.pid('sara'),   'visit.submit', 'visit', null, '{"attendance":"full"}', '2026-10-27 14:30+03');

select (select count(*) from people) people, (select count(*) from visits) visits, (select count(*) from visit_scores) scores,
       (select count(*) from app_sessions) sessions, (select count(*) from app_submissions) submissions,
       (select count(*) from composites where period = '2026-Q4') q4_composites, (select count(*) from auth.users) users;
