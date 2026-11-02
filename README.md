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
