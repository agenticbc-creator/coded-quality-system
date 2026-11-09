-- Two fictional coordinators for the demo (run after demo_seed.sql). They sign in with the same demo password
-- as the other personas: copied from an existing demo account, or from seed.demo_password when that is set.
-- Muna is the Education Coordinator for Professionals (books QA, sees status only).
-- Omar is the Program Coordinator for Professionals (counts as Operations).
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', k || '@demo.coded.test',
         coalesce(crypt(nullif(current_setting('seed.demo_password', true), ''), gen_salt('bf')),
                  (select encrypted_password from auth.users where email = 'noura@demo.coded.test')), now(), '{"provider":"email","providers":["email"]}', '{}',
         now(), now(), '', '', '', '', '', '', '', '', false, false
  from (values ('muna'), ('omar')) v(k)
  where not exists (select 1 from auth.users where email = k || '@demo.coded.test')
  returning id, email
), i as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from u returning user_id
)
insert into people (auth_user_id, full_name, arabic_name, email, roles, home_segment, is_full_timer)
select u.id, p.full_name, p.arabic, u.email, p.roles, 'pro', true
from u join (values
  ('muna@demo.coded.test', 'Muna Al-Fares', 'منى الفارس', '{education_coordinator}'::text[]),
  ('omar@demo.coded.test', 'Omar Al-Khaldi', 'عمر الخالدي', '{program_coordinator}'::text[])
) p(email, full_name, arabic, roles) on p.email = u.email;

-- Omar oversees the live Professionals cohort, like an operations officer would.
insert into cohort_roles (cohort_id, person_id, role)
select co.id, p.id, 'overseer' from cohorts co join programs pr on pr.id = co.program_id, people p
where pr.segment_id = 'pro' and co.status = 'live' and p.email = 'omar@demo.coded.test'
  and not exists (select 1 from cohort_roles r where r.cohort_id = co.id and r.person_id = p.id);
