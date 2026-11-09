# CODED Education Quality and Approvals System

Standalone build of the PRD *Education Quality and Approvals System* (25 Oct 2026): Phase 1 plus the Phase 2/3 items.
The full requirement-by-requirement map lives in the app at `/coverage` (`lib/prd.ts`).
Built to move into CODED Portal v2 later: the database mirrors ERPNext and the CODED App in `erp_*` and `app_*` tables.

**Stack:** Next.js 15 (App Router, server actions) · Supabase (Postgres, Auth, row-level security) · Tailwind · Vercel.
**Brand:** official CODED logo (`public/brand`), Inter, Navy `#14243F`, Blue `#004AA3`, Light Gray `#D2D2D2` from the CODED Figma library.

## What is in Phase 1

| PRD | Where |
|---|---|
| A. Content approval (one approval, versions, lock to cohort, time to market) | `/approvals/content` |
| B. People approvals (8 fixed steps, vetting scorecard, mock classes on the CCTP rubric, ERPNext contract check) | `/approvals/people` |
| C. Multi-classroom cohorts, overseer, go-live gate, classroom comparison | `/cohorts`, `/owner` |
| D. QA plans by program type, scheduling with invites, accept / reschedule / decline, rotation | `/cohorts/[id]`, `/visits` |
| E. Visit instrument (phone, offline draft, role rubrics, partial attendance, Signal / Intervene, bias-safe pre-visit context) | `/visits/[id]` |
| F. Scoring templates, composite engine, validity gates, tiers, automatic plans | `/scores`, `/admin?tab=scoring` |
| G. Educator dashboard (where I stand, why, what next) | `/me` |
| FB1–FB9. Feedback any time, release queue, red flags, acknowledgement | `/feedback/new`, `/feedback/release` |
| 360° reviews scoped to the classroom, JD checklist, cross-segment record, surveys (view only) | `/reviews`, `/me`, `/people/[id]` |
| Live CODED App signals, 24/72 reminders and escalation | `/me`, `/ops`, daily jobs |
| N1 / R1. Notifications, audit log | `/notifications`, `/admin?tab=audit` |
| GM observer view, HR view, system owner admin | `/overview`, `/people`, `/admin` |

## Added in Phase 2/3

| PRD | Where |
|---|---|
| H1–H7. CCTP: enrol, Trainer Learning Path progress and ranks, book and score the live mock class, recordings | `/cctp` |
| B7, P4, H6. Level changes and readiness (segment owner + HR or GM), CCTP-at-risk alerts | `/levels` |
| C5, D7. Master classes (Tier 1 only) and challenge sessions with their own template | `/master-classes` |
| E7. QAer onboarding per template, team readiness grid | `/onboarding` |
| G4, G5. Printable quarterly report card with acknowledgement; plan editing | `/report-card`, `/people/[id]` |
| A6, A7, X1. Staged content review (Outline → Beta) and the creator's pre-check | `/approvals/content/[id]` |
| R2. Approvals dashboard by stage, age and approver | `/approvals` |
| D3, X4. Week calendar with ERPNext unavailability and an `.ics` feed | `/calendar`, `/calendar/ics` |
| P3, B6, WB, X2. Kids/Youth rubric variants, re-approval warning, ERPNext write-back panel, "Suggest" for The One Thing | throughout |
| Education home, handbook, PRD coverage, ⌘K command palette | `/education`, `/handbook`, `/coverage` |

## Access model

All reads go through Postgres row-level security (`supabase/migrations/0002_access.sql`); all writes go through
security-definer functions that check the caller's role (`0003_actions.sql`, `0004_scoring_and_jobs.sql`).
Table writes are revoked from client roles, so the browser cannot bypass a rule.

Defaults used for the PRD's open questions (editable in **System → Rules and drafts**):
- The Education Principal gives the one content approval and signs off weight / rubric changes.
- Operations sees operations QA results and record gaps only; never educator scores.
- HR sees composite, tier and plans; never private notes.
- The system never changes ERPNext contractor status; it writes its own fields and flags HR.

Everything marked **Draft for review** (TA, class and operations rubrics, 360° wording, JD checklist for TAs,
accountability formula, short / long QA plans, vetting scorecard) was written for this build and needs Education sign-off.

## Audit fixes (2 Nov 2026)

The design now follows the **CODED Product Theme** (light): navy frame, electric `#3059FF` for actions only,
Brand Blue `#004AA3` for selection, tiers in their own colours, Manrope + Space Mono + IBM Plex Sans Arabic
self-hosted under `public/fonts`, and the "CODED × Quality" lockup.

Screens (live now): loading, error and not-found screens; one menu item highlighted at a time; "Needs you"
on the educator home, with the ERPNext panels moved into "My record"; three-level signals; a visit report that
cannot be filed with items left unscored and opens only once accepted and near the start time; per-person
One Thing and action points in the report; the report card filtered to its quarter; coordinator roles in the
menu and a QA calendar at `/coordinator`; PRD codes removed from screen copy; "PRD coverage" for the system owner only.

**Database: apply `supabase/migrations/0009_audit_fixes.sql`** (SQL editor, once). It closes the read-all
tables to people without a record, fixes `plan_save`, keeps private note text out of the audit log, stops
provisional scores unlocking Tier 1, scopes staffing and reminders, shows educators and leads released visits
only (the composite now counts released visits only), enforces the visit-report rules in the database, adds
per-person release (`visit_release(..., p_people)`), coordinator booking, and schedules the daily jobs with
pg_cron at 06:00 Kuwait time. The release queue switches to one block per person by itself once
`settings.schema_version` is 9. Also turn off **Allow new users to sign up** in Supabase Auth.

## Going live (no sample data)

**Live database (9 Nov 2026):** Supabase project `excvjpgpyriqcjnvdjuh` ("coded-quality", organization
agenticbc-creator's Org, eu-central-1), built from migrations 0001–0012 with no seed data. The app's defaults in
`lib/config.ts` point at it. The earlier demo project `dceyqaobmasqibclchdg` (codedadmin's Org) is no longer used.
Demo mode is off unless `DEMO_MODE=on` and `DEMO_PASSWORD` are both set in Vercel.


Do these in order. Steps 1, 5, 6 and 7 are settings only the project owner can change; the SQL steps run in the
Supabase SQL editor of project `dceyqaobmasqibclchdg`.

1. **Agree where real data lives.** This standalone Supabase project will hold real names, emails, scores and private
   feedback notes. CODED should agree to that (hosting region eu-central-1, who has dashboard access, backups) or move to Portal v2 first.
2. **Merge** the pull request into `main` (Vercel deploys production from it).
3. **Run the migrations** `0009_audit_fixes.sql`, `0010_signoffs_reviews_evidence.sql`, `0011_live_readiness.sql`, in that order.
4. **Back up, then clear the sample data:** `supabase/live/1_clear_sample_data.sql`. It deletes every sample person, program,
   cohort, visit, score and note, and the `@demo.coded.test` accounts; it keeps segments, templates, settings and JD items.
   It refuses to run if it finds anyone who is not a sample person. It cannot be undone.
5. **Supabase Auth settings:** turn off *Allow new users to sign up*; set the Site URL to
   `https://coded-quality-system.vercel.app` and add `https://coded-quality-system.vercel.app/login/set-password` to the Redirect URLs;
   set up custom SMTP (the built-in sender is rate-limited and meant for testing) so invites and password resets arrive.
6. **Vercel environment:** delete `DEMO_PASSWORD` (this turns off the sample personas and the "Sample data" labels).
   Optional: `SUPABASE_SERVICE_ROLE_KEY` (invite emails sent from the app), `RESEND_API_KEY` + `EMAIL_FROM` + `CRON_SECRET` (daily notification email).
   Redeploy after changing them.
7. **First system owner:** put your name and work email at the top of `supabase/live/2_first_system_owner.sql`, run it,
   then invite that email under Authentication > Users > Invite user and set a password from the email.
8. **Set up from the System page:** programs (System → Programs), people (Add a person, or import the ERPNext contractors CSV),
   contracts and unavailable dates (CSV), then segment owners create cohorts and the timetable comes in by CSV.

Rehearsed end to end on a throwaway database by `npm run test:db` (`supabase/tests/live.sql`).

## Second round (3 Nov 2026)

**Database: apply `supabase/migrations/0010_signoffs_reviews_evidence.sql`** after 0009 (SQL editor, once; it is
safe to run again). It adds the segment owner's sign-off of staffing and the QA plan (both block go-live; a team or
plan change before Day 1 asks again), an alignment-visit warning, plan reviews with an outcome (met, extended,
Improvement Plan, HR), decline hand-over to the next free observer, education class visits only on teaching days,
this cohort's One Thing first and live signals in the pre-visit context, senior instructors seeing scores only once
released, private photo and voice evidence (bucket `evidence`), author edits of unreviewed notes, per-segment
results, batch scoring of a cohort, the full ERPNext contract status chain, `person_add` with first-sign-in linking
(`claim_my_record`), CSV imports for the system owner, and draft settings for signal levels, a scoring guide and
Kids age-bracket templates (all marked draft for Education). The screens switch these on by themselves once
`settings.schema_version` is 10.

Demo coordinators: `supabase/seed/coordinators_seed.sql` (same `seed.demo_password` step as the demo seed) adds
Muna (Education Coordinator) and Omar (Program Coordinator) to the sign-in page.

Server-only settings in Vercel (each feature stays off until its key is set): `SUPABASE_SERVICE_ROLE_KEY`
(invite emails, daily email run), `CRON_SECRET` (protects `/api/cron/daily`, scheduled in `vercel.json` for
07:00 Kuwait), `RESEND_API_KEY` and `EMAIL_FROM` (notification email), `APP_URL`. Invite emails land on `/login/set-password`;
add `https://coded-quality-system.vercel.app/login/set-password` under Supabase Auth → URL Configuration → Redirect URLs.

Tests: `npm run test:db` builds a throwaway local Postgres database the way the hosted one was built
(0001–0008, demo seeds, 0009, 0010) and runs `supabase/tests/access.sql` (44 checks on who sees and does what).
It needs a local Postgres and never touches the hosted project.

The Arabic toggle in the top bar switches the menus and the top bar to Arabic (right to left); pages stay in English
until the wording is reviewed.

## Run it

```bash
cp .env.example .env.local   # fill in the anon key and, for demo sign-in, DEMO_PASSWORD
npm install
npm run dev
```

Database: apply `supabase/migrations/*.sql` in order, then (for demo data only) `supabase/seed/demo_seed.sql`
after `select set_config('seed.demo_password', '<password>', false);`, then `supabase/seed/phase2_seed.sql`.

**Before real data:** remove `DEMO_PASSWORD` (turns persona sign-in off), delete the demo users, and replace the
`erp_*` / `app_*` sample tables with the Portal v2 sync.
