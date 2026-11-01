# CODED Education Quality and Approvals System

Standalone build of the PRD *Education Quality and Approvals System* (25 Oct 2026), Phase 1.
Built to move into CODED Portal v2 later: the database mirrors ERPNext and the CODED App in `erp_*` and `app_*` tables.

**Stack:** Next.js 15 (App Router, server actions) · Supabase (Postgres, Auth, row-level security) · Tailwind · Vercel.

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

## Run it

```bash
cp .env.example .env.local   # fill in the anon key and, for demo sign-in, DEMO_PASSWORD
npm install
npm run dev
```

Database: apply `supabase/migrations/*.sql` in order, then (for demo data only) `supabase/seed/demo_seed.sql`
after `select set_config('seed.demo_password', '<password>', false);`.

**Before real data:** remove `DEMO_PASSWORD` (turns persona sign-in off), delete the demo users, and replace the
`erp_*` / `app_*` sample tables with the Portal v2 sync.
