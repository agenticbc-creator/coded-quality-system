-- Reference data and draft rubrics.
-- status: from_notion = already in CODED's frameworks; decided = 25 Oct 2026 decisions;
--         default = assumption in the PRD (open question); draft_review = written for this build, needs Education sign-off.

insert into segments (id, name, sort) values ('kids','Kids',1), ('youth','Youth',2), ('pro','Professionals',3);

insert into settings (key, label, value, status, note) values
('content_approver_role', 'Who gives the one content approval', '{"role":"education_principal"}', 'default', 'PRD open question: Education Principal assumed.'),
('weights_signoff_role', 'Who signs off changes to scoring weights and rubrics', '{"role":"education_principal"}', 'default', 'PRD open question: Education Principal assumed. Changes by anyone else are saved as drafts.'),
('approval_turnaround', 'Approval turnaround per step', '{"working_days":3}', 'decided', 'Reminder after 3 working days (Kuwait weekend Fri–Sat).'),
('tiers', 'Tier thresholds', '{"tier1":90,"tier2":85,"tier3":75,"target":90,"floor":85}', 'from_notion', 'Instructor Evaluation Framework. Target 90, floor 85 (decided 25 Oct 2026).'),
('review_360_min_reviewers', 'Minimum reviewers before a 360° result counts', '{"n":3}', 'from_notion', 'May 2026 Peer 360° design.'),
('review_360_window_days', '360° review window after the cohort ends', '{"days":14}', 'from_notion', null),
('survey_validity', 'Survey response rate before results are shown', '{"pct":60}', 'from_notion', 'Validity gate.'),
('part_time_qa_segments', 'Segments where part-timers may run education QA', '[]', 'decided', 'None until a segment owner allows it.'),
('jd_auto_threshold', 'Evidence level that ticks a JD checklist item automatically', '{"pct":90}', 'draft_review', 'Draft: 90% on time ticks the item; the lead confirms the rest.'),
('missing_component_rule', 'What happens when a composite component has no data', '{"rule":"reweight"}', 'draft_review', 'Draft: the remaining weights are scaled up and the score is marked provisional.'),
('accountability_formula', 'How accountability becomes 0–100', '{"method":"mean","parts":["attendance_24h","grading_72h","ack_48h","jd_checklist","coordinator"]}', 'draft_review',
 'Draft: the average of the parts that have data. Attendance logged within 24h (%), grading within 72h (%), feedback acknowledged within 48h (%), JD checklist done (%), coordinator entries (0–100).'),
('visibility_rules', 'Who sees evaluations', '{"operations":"Operations QA results and record gaps only","hr":"Composite, tier and plans; never private notes","lead_instructor":"Own score and their TAs; other instructors only for full-timers"}', 'default', 'Defaults chosen for the open PRD questions.'),
('erp_write_rule', 'ERPNext contractor status', '{"rule":"never_change_status"}', 'default', 'The system never changes ERPNext contractor status or contracts. It writes its own fields and flags HR.'),
('qa_plan_defaults', 'Default QA plan by program type', '{
  "bootcamp": {"label":"Bootcamp (about 5 weeks)","education_weeks":[2,4],"operations_weeks":[3],"shadowing":"weekly","pulse_week":5,"source":"QA & Shadowing Schedule; operations QA in week 3 is a draft"},
  "short":    {"label":"Short program (a few days)","education":1,"operations":1,"shadowing":1,"source":"Proposed (Pillar B minimum) plus one operations QA (draft)"},
  "long":     {"label":"Long program (longer than a bootcamp)","education_every":4,"education_min":2,"operations_every":8,"shadowing_every":2,"source":"Proposed"}
}', 'draft_review', 'Bootcamp from Notion; short and long are proposals. Operations QA added to every plan so the 20% component has data.'),
('red_flag_reasons', 'Red-flag reasons', '["Safety concern","Curriculum failure","More than 15 minutes late or no-show","Materials missing over 10 minutes","Escalated learner conflict","Repeat offence"]', 'from_notion', 'Instructor Evaluation Framework.'),
('feedback_channels', 'Feedback delivery by severity (Pillar B)', '{"email":"Went well: email","call_email":"Minor issues: call, then email","face_email":"Went badly: face to face, then email"}', 'from_notion', 'Education Circle in copy.'),
('ta_checklist', 'TA checklist (people approvals)', '{"items":[{"key":"tools","label":"Comfortable with the program''s tools"},{"key":"patience","label":"Patient with non-technical participants"},{"key":"availability","label":"Available for every session"}]}', 'from_notion', 'Instructor Sourcing, Vetting & Onboarding.'),
('vetting_scorecard', 'Live technical vetting scorecard', '{"items":[
  {"key":"technical_depth","label":"Technical depth in the program''s stack","max":30},
  {"key":"live_problem","label":"Live problem solving","max":25},
  {"key":"explains","label":"Explains clearly to a beginner","max":20},
  {"key":"teaching_instinct","label":"Teaching instinct: asks, does not just tell","max":15},
  {"key":"fit","label":"Fit with CODED values and team","max":10}],"pass":70}', 'draft_review', 'Draft scorecard; Notion asks for a written scorecard but does not define it.'),
('cctp_mock_rubric', 'Mock-class rubric (CCTP, 100 points)', '{"items":[
  {"key":"arc","label":"Lesson Structure and the Arc","max":20},
  {"key":"struggle","label":"Productive Struggle","max":15},
  {"key":"mentorship","label":"Mentorship and Modelling","max":20},
  {"key":"collaborative","label":"Collaborative Learning","max":15},
  {"key":"supportive","label":"Supportive Environment","max":15},
  {"key":"real_life","label":"Real Life Learning","max":15}],
 "critical":[
  {"key":"direct_solutions","label":"Gave direct solutions"},
  {"key":"frustration","label":"Showed frustration with struggling trainees"},
  {"key":"theory","label":"More than 40% pure theory"},
  {"key":"unsafe","label":"Unsafe environment"}],
 "bands":{"CCT":90,"CCTA":80}}', 'from_notion', 'CCTP program page (marked To be Reviewed in Notion).'),
('review_360_items', '360° items by reviewer → reviewed', '{
  "ta>instructor":         [{"key":"briefing","label":"Gave clear briefs and educational direction"},{"key":"support","label":"Supported me in helping learners"},{"key":"respect","label":"Treated the team with respect"}],
  "instructor>instructor": [{"key":"collaboration","label":"Collaboration"},{"key":"knowledge_sharing","label":"Knowledge sharing"},{"key":"reliability","label":"Reliability"}],
  "instructor>ta":         [{"key":"learner_support","label":"Learner support"},{"key":"initiative","label":"Initiative"},{"key":"follows_brief","label":"Follows the brief"}],
  "ta>ta":                 [{"key":"collaboration","label":"Collaboration"},{"key":"reliability","label":"Reliability"}],
  "instructor>operations": [{"key":"readiness","label":"Classroom readiness"},{"key":"follow_up","label":"Follow-up to closure"},{"key":"records_on_time","label":"Records on time"}],
  "ta>operations":         [{"key":"readiness","label":"Classroom readiness"},{"key":"follow_up","label":"Follow-up to closure"},{"key":"responsiveness","label":"Responsiveness"}],
  "operations>instructor": [{"key":"punctuality","label":"Punctuality"},{"key":"records_on_time","label":"Records on time"},{"key":"requests_on_time","label":"Requests answered on time"}],
  "operations>ta":         [{"key":"punctuality","label":"Punctuality"},{"key":"records_on_time","label":"Records on time"},{"key":"requests_on_time","label":"Requests answered on time"}]
}', 'draft_review', 'Pairings from the PRD; item wording is a draft. Operations never rates teaching quality.');

-- Default scoring template (decided 25 Oct 2026)
insert into scoring_templates (name, scope_type, scope_id, weights, gates, status) values
('CODED default', 'default', null, '{"qa":50,"ops":20,"r360":20,"acc":10}', '{"min_edu_qa":1,"min_360_reviewers":3,"min_ops_qa":0}', 'decided');

-- ── QA templates ──────────────────────────────────────────
insert into qa_templates (key, name, kind, focus, subjects, status, rubric) values
('edu_class', 'Education QA — class visit', 'education_qa', 'class', '{instructor,ta,class}', 'draft_review', '{
  "instructor": {"label":"Instructor (0–100)","source":"E3 rubric from the PRD; One Thing scoring is a draft","sections":[
    {"key":"preparation","label":"Preparation","items":[
      {"key":"prep_early","label":"Arrived 15 minutes early; room and tech ready","max":7},
      {"key":"prep_materials","label":"Materials and lab files staged","max":6},
      {"key":"prep_plan","label":"Lesson plan matches the approved curriculum","max":7}]},
    {"key":"delivery","label":"Delivery","items":[
      {"key":"interaction","label":"Interaction: checks for understanding; 70/30 hands-on balance","max":18},
      {"key":"pacing","label":"Pacing fits the room; activities are time-boxed","max":15},
      {"key":"adaptability","label":"Adaptability: responds to confusion; productive struggle, no direct solutions","max":15},
      {"key":"fidelity","label":"Curriculum fidelity: teaches the approved version","max":12}]},
    {"key":"one_thing","label":"The One Thing","items":[
      {"key":"follow_through","label":"Acts on the One Thing from the last debrief (full marks on a first visit)","max":20}]}]},
  "ta": {"label":"TA (0–100)","source":"Draft","sections":[
    {"key":"support","label":"Learner support","items":[
      {"key":"learner_support","label":"Circulates and unblocks learners without giving solutions","max":25},
      {"key":"responsiveness","label":"Responds to raised hands and chat during the session","max":20}]},
    {"key":"direction","label":"Works to the brief","items":[
      {"key":"follows_brief","label":"Follows the instructor''s brief and lesson plan","max":20}]},
    {"key":"clarity","label":"Clarity","items":[
      {"key":"clarity_of_help","label":"Explains with guiding questions; checks the learner understood","max":20}]},
    {"key":"professionalism","label":"Professionalism","items":[
      {"key":"professional","label":"Punctual, prepared and respectful","max":15}]}]},
  "class": {"label":"Class overall (0–100)","source":"Draft","sections":[
    {"key":"climate","label":"Climate","items":[
      {"key":"engagement","label":"Trainees are on task and engaged","max":25},
      {"key":"safe_climate","label":"Safe, supportive room; trainees ask questions","max":25}]},
    {"key":"learning","label":"Learning","items":[
      {"key":"hands_on","label":"Hands-on time is at least 70% (70/30 rule)","max":25},
      {"key":"goal_reached","label":"Session goal reached; exit check shows understanding","max":25}]}]}
}'),
('edu_instructor', 'Education QA — one instructor', 'education_qa', 'instructor', '{instructor}', 'draft_review', '{
  "instructor": {"label":"Instructor (0–100)","sections":[
    {"key":"preparation","label":"Preparation","items":[
      {"key":"prep_early","label":"Arrived 15 minutes early; room and tech ready","max":7},
      {"key":"prep_materials","label":"Materials and lab files staged","max":6},
      {"key":"prep_plan","label":"Lesson plan matches the approved curriculum","max":7}]},
    {"key":"delivery","label":"Delivery","items":[
      {"key":"interaction","label":"Interaction: checks for understanding; 70/30 hands-on balance","max":18},
      {"key":"pacing","label":"Pacing fits the room; activities are time-boxed","max":15},
      {"key":"adaptability","label":"Adaptability: responds to confusion; productive struggle, no direct solutions","max":15},
      {"key":"fidelity","label":"Curriculum fidelity: teaches the approved version","max":12}]},
    {"key":"one_thing","label":"The One Thing","items":[
      {"key":"follow_through","label":"Acts on the One Thing from the last debrief (full marks on a first visit)","max":20}]}]}
}'),
('ops_classroom', 'Operations QA — classroom operations', 'operations_qa', 'class', '{instructor,ta}', 'draft_review', '{
  "instructor": {"label":"Classroom operations (0–100)","source":"Draft","sections":[
    {"key":"punctuality","label":"Punctuality","items":[
      {"key":"on_time","label":"Session started on time","max":15},
      {"key":"on_site_early","label":"On site before trainees","max":10}]},
    {"key":"records","label":"Records","items":[
      {"key":"attendance_24h","label":"Attendance logged within 24 hours","max":15},
      {"key":"grading_72h","label":"Grading within 72 hours","max":10}]},
    {"key":"room","label":"Room and equipment","items":[
      {"key":"room_ready","label":"Room set up and tidy","max":10},
      {"key":"tech_ready","label":"Equipment and lab access working","max":10}]},
    {"key":"requests","label":"Requests","items":[
      {"key":"requests","label":"Requests and follow-ups answered on time","max":15}]},
    {"key":"conduct","label":"Conduct","items":[
      {"key":"conduct","label":"Professional conduct and dress code","max":15}]}]},
  "ta": {"label":"Classroom operations (0–100)","source":"Draft","sections":[
    {"key":"punctuality","label":"Punctuality","items":[
      {"key":"on_time","label":"Present at session start","max":15},
      {"key":"on_site_early","label":"On site before trainees","max":10}]},
    {"key":"records","label":"Records","items":[
      {"key":"attendance_24h","label":"Delegated attendance logged within 24 hours","max":15},
      {"key":"grading_72h","label":"Delegated grading within 72 hours","max":10}]},
    {"key":"room","label":"Room and equipment","items":[
      {"key":"room_ready","label":"Helps set up the room","max":10},
      {"key":"tech_ready","label":"Helps trainees with access and tools","max":10}]},
    {"key":"requests","label":"Requests","items":[
      {"key":"requests","label":"Requests answered on time","max":15}]},
    {"key":"conduct","label":"Conduct","items":[
      {"key":"conduct","label":"Professional conduct and dress code","max":15}]}]}
}'),
('shadowing_checklist', 'Shadowing — classroom checklist', 'shadowing', 'class', '{}', 'draft_review', '{
  "checklist":[
    {"key":"on_time","label":"Session started on time"},
    {"key":"goal_shared","label":"Session goal shared with trainees"},
    {"key":"hands_on","label":"Trainees working hands-on most of the time"},
    {"key":"circulating","label":"Instructor circulates and checks on trainees"},
    {"key":"tas_active","label":"TAs active with learners"},
    {"key":"materials_ok","label":"Materials and lab environment worked"},
    {"key":"climate","label":"Trainees comfortable asking questions"}],
  "note_tags":["praise","coaching","concern","red_flag"],
  "source":"Draft based on Pillar B: anything a CODED employee can see, hear or verify"
}');

insert into qa_templates (key, name, kind, focus, subjects, status, is_special, rubric)
select 'edu_masterclass', 'Education QA — master class or challenge', 'education_qa', 'class', '{instructor,class}', 'draft_review', true,
  jsonb_build_object('instructor', rubric->'instructor', 'class', rubric->'class')
from qa_templates where key = 'edu_class';

-- ── JD checklists (from approved JDs; TA draft until the TA JD is approved) ──
insert into jd_items (role, key, label, evidence, ord, status) values
('instructor','grading_72h','Grades submissions within 72 hours','app_grading',1,'from_notion'),
('instructor','attendance_24h','Logs attendance within 24 hours','app_attendance',2,'from_notion'),
('instructor','chat_replies','Replies to trainee chat within one working day','app_chat',3,'draft_review'),
('instructor','feedback_ack','Acknowledges feedback within 48 hours','feedback_ack',4,'from_notion'),
('instructor','one_on_ones','Holds one-on-ones with at-risk learners','lead',5,'from_notion'),
('instructor','approved_version','Teaches the approved content version','visit',6,'from_notion'),
('instructor','outlines_assessments','Prepares outlines and assessments for assigned programs','lead',7,'from_notion'),
('instructor','briefs_tas','Briefs TAs and gives educational direction','lead',8,'from_notion'),
('instructor','retention','Works with Operations on education-side retention','lead',9,'from_notion'),
('instructor','correction_plans','Writes correction plans within scope','lead',10,'from_notion'),
('ta','learner_support','Supports learners in class under the instructor''s direction','lead',1,'draft_review'),
('ta','delegated_grading','Delegated grading within 72 hours','app_grading',2,'draft_review'),
('ta','delegated_attendance','Delegated attendance within 24 hours','app_attendance',3,'draft_review'),
('ta','chat_replies','Replies to trainee chat when assigned','app_chat',4,'draft_review'),
('ta','follows_brief','Follows the instructor''s brief','lead',5,'draft_review'),
('ta','available','Available for every session','lead',6,'draft_review'),
('ta','delegated_one_on_ones','Logs delegated one-on-ones','lead',7,'draft_review'),
('ta','feedback_ack','Acknowledges feedback within 48 hours','feedback_ack',8,'draft_review'),
('operations','readiness','Confirms room, roster and lab readiness per classroom','lead',1,'from_notion'),
('operations','records','Keeps attendance and participant records complete','lead',2,'from_notion'),
('operations','surveys','Runs survey and evaluation administration','lead',3,'from_notion'),
('operations','follow_up','Follows up to closure','lead',4,'from_notion'),
('operations','shadowing','Completes assigned shadowing visits','visit',5,'from_notion'),
('operations','scheduling','Handles scheduling logistics','lead',6,'from_notion');
