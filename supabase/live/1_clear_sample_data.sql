-- Go-live step 1 · Removes every sample record and the sample sign-in accounts (…@demo.coded.test).
-- Keeps what the migrations wrote: segments, QA and scoring templates, settings (including the drafts for Education) and JD items.
-- Run once in the Supabase SQL editor, after migrations 0009, 0010 and 0011. IT CANNOT BE UNDONE: take a backup first.
-- It stops without changing anything if it finds a person who is not a sample person.
begin;

do $$
declare n int;
begin
  select count(*) into n from people where coalesce(email, '') not like '%@demo.coded.test';
  if n > 0 then
    raise exception 'Stopped: % record(s) in people are not sample people (email not ending @demo.coded.test). Nothing was deleted.', n;
  end if;
end $$;

-- Reference data keeps its rows; only the link to the sample person who last edited it is cleared.
update qa_templates set created_by = null where created_by is not null;
update scoring_templates set created_by = null where created_by is not null;
update settings set updated_by = null where updated_by is not null;

-- Everything else is sample data.
truncate table
  accountability_entries, app_attendance, app_chat_replies, app_pulse, app_sessions, app_submissions, app_tasks, app_trainees,
  audit_log, cctp_bookings, cctp_enrolments, classroom_staff, classrooms, cohort_roles, cohorts, composites,
  content_items, content_stages, content_versions, erp_availability, erp_contracts, feedback, jd_ticks, level_changes,
  master_classes, mock_results, notifications, pipeline_steps, pipelines, plans, programs, qaer_onboarding,
  released_feedback, report_cards, reviews_360, survey_results, sync_runs, visit_scores, visits
restart identity;
delete from people;
delete from auth.identities where user_id in (select id from auth.users where email like '%@demo.coded.test');
delete from auth.users where email like '%@demo.coded.test';

-- What is left: reference data, and any sign-in accounts that are not sample accounts (people who signed up while sign-up was open).
select (select count(*) from segments) segments, (select count(*) from qa_templates) qa_templates, (select count(*) from scoring_templates) scoring_templates,
       (select count(*) from settings) settings, (select count(*) from jd_items) jd_items, (select count(*) from people) people,
       (select count(*) from auth.users) other_sign_in_accounts;
commit;
-- If other_sign_in_accounts is above 0, review them under Authentication > Users and remove any you do not recognise.
