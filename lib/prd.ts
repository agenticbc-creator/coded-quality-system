// PRD coverage — every requirement in "PRD: Education Quality and Approvals System" (25 Oct 2026)
// mapped to where it lives in this build. Rendered on /coverage.

export type Status = "built" | "partial" | "needs_portal";
export type Req = { id: string; title: string; priority?: "P0" | "P1" | "P2" | "X"; status: Status; where: string; note?: string };
export type Group = { key: string; title: string; reqs: Req[] };

export const PRD: Group[] = [
  {
    key: "A", title: "A. Content approval", reqs: [
      { id: "A1", title: "Content request / update brief", priority: "P0", status: "built", where: "/approvals/content → New content request" },
      { id: "A2", title: "One approval before use", priority: "P0", status: "built", where: "/approvals/content/[id]", note: "Education Principal approves (open question, assumed)." },
      { id: "A3", title: "Reject with comments; every round versioned", priority: "P0", status: "built", where: "Version history on each content item; revisions per item on the list" },
      { id: "A4", title: "Approved version locked to the cohort", priority: "P1", status: "built", where: "/cohorts/[id] → Content" },
      { id: "A5", title: "Time to market tracked", priority: "P1", status: "built", where: "/approvals/content (column)" },
      { id: "A6", title: "Stage gates with an approver per stage", priority: "P2", status: "built", where: "Content item → Staged review", note: "Optional per item; the one final approval still applies." },
      { id: "A7", title: "Asset review: Alpha (technical) and Beta (pedagogy)", priority: "P2", status: "built", where: "Content item → Staged review (Alpha, Beta)" },
      { id: "A8", title: "Content budget estimate", priority: "P2", status: "built", where: "Brief (hours × rate)" },
      { id: "X1", title: "Pre-check against the 70/30 rule and the Arc", priority: "X", status: "built", where: "Submit form → pre-check", note: "Rule-based checklist, not AI." },
    ],
  },
  {
    key: "B", title: "B. People approvals", reqs: [
      { id: "B1", title: "Candidate record from Portal v2 applications", priority: "P0", status: "partial", where: "/approvals/people", note: "Reads the ERPNext mirror; until the live Portal v2 feed, migration 0010 adds a CSV import of ERPNext contractors for the system owner." },
      { id: "B2", title: "Fixed pipeline: criteria → cleared to teach", priority: "P0", status: "built", where: "/approvals/people/[id]" },
      { id: "B3", title: "Mock classes on the CCTP rubric, feedback within 24h", priority: "P0", status: "built", where: "Mock class steps" },
      { id: "B4", title: "Role checklists incl. TA checklist", priority: "P1", status: "built", where: "Onboarding step (TA)" },
      { id: "B5", title: "Backup instructor per program", priority: "P1", status: "built", where: "/cohorts/[id] → Oversight" },
      { id: "B6", title: "Re-approval when moving program or segment", priority: "P2", status: "built", where: "Go-live gate warning", note: "Flags staff cleared for a different segment; start a re-approval from People approvals." },
      { id: "B7", title: "Instructor-level change, HR/GM + segment owner", priority: "P2", status: "built", where: "/levels" },
    ],
  },
  {
    key: "C", title: "C. Multi-classroom programs", reqs: [
      { id: "C1", title: "Cohort holds classrooms; visits, scores, 360° per classroom", priority: "P0", status: "built", where: "/cohorts/[id]" },
      { id: "C2", title: "Overseer required; go-live blocked without one", priority: "P0", status: "built", where: "Go-live gate" },
      { id: "C3", title: "Overseer view with quick feedback", priority: "P0", status: "built", where: "/ops, Log feedback" },
      { id: "C4", title: "Side-by-side classroom comparison", priority: "P1", status: "built", where: "/owner, /cohorts/[id]" },
      { id: "C5", title: "Master classes and challenges as evaluable sessions; Tier 1 only", priority: "P1", status: "built", where: "/master-classes" },
    ],
  },
  {
    key: "D", title: "D. Visit scheduling", reqs: [
      { id: "D1", title: "QA plan by program type", priority: "P0", status: "partial", where: "/cohorts/[id] → QA plan", note: "Migration 0010 adds the segment owner's sign-off of the staffing and the QA plan (both block go-live) and warns when no alignment visit is booked before Day 1." },
      { id: "D2", title: "Visits created ahead on the program checklist", priority: "P0", status: "built", where: "QA plan grid" },
      { id: "D3", title: "Schedule: QAer, type, focus, template + invite", priority: "P0", status: "partial", where: "/visits/new", note: "In-app invite and reminder; calendar (.ics) download per visit; from migration 0010 an education class visit must fall on a teaching day. Outlook/Google sync needs Portal v2." },
      { id: "D4", title: "Accept, reschedule, decline; every change logged", priority: "P0", status: "built", where: "/visits/[id]" },
      { id: "D5", title: "Rotation and delegation", priority: "P0", status: "partial", where: "QA plan generator + 'Needs an observer' queue", note: "Rotation works; migration 0010 passes a declined invite to the next eligible, available observer." },
      { id: "D6", title: "Pop-up and pulse checks logged separately", priority: "P1", status: "built", where: "Visit type" },
      { id: "D7", title: "Master class / challenge sessions with a template", priority: "P1", status: "built", where: "/master-classes" },
    ],
  },
  {
    key: "E", title: "E. Visit instrument", reqs: [
      { id: "E1", title: "Pre-visit context without earlier QA scores", priority: "P0", status: "partial", where: "/visits/[id]", note: "Hides earlier scores; migration 0010 adds this week's CODED App signals and shows this cohort's One Thing first. Standup notes are not in yet." },
      { id: "E2", title: "Rubrics per role; one visit scores instructor, TAs, class", priority: "P0", status: "built", where: "Visit instrument" },
      { id: "E3", title: "Education QA rubric 0–100", priority: "P0", status: "built", where: "Template 'Education QA — class visit'" },
      { id: "E4", title: "Visit log: attendance, unobserved areas, Signal/Intervene, flags", priority: "P0", status: "built", where: "Visit instrument", note: "The report cannot be submitted with an item left unscored; migration 0009 enforces it in the database too." },
      { id: "E5", title: "Template library, versioned", priority: "P0", status: "partial", where: "/admin → QA templates", note: "Versioned, but edited as raw JSON; no per-program templates or generation." },
      { id: "E6", title: "Phone and tablet, offline", priority: "P1", status: "partial", where: "Draft saved on the device until submitted", note: "Draft kept on the device; a report finished offline is queued and sent when the signal returns. Photos and voice notes (migration 0010) upload when online." },
      { id: "E7", title: "QAer onboarding before a first visit", priority: "P1", status: "partial", where: "/onboarding", note: "Onboarding is a self-tick; nothing blocks a first visit without it." },
      { id: "X2", title: "Draft 'One Thing' from the notes", priority: "X", status: "built", where: "Visit instrument → Suggest", note: "Picks the lowest-scoring item; no AI." },
    ],
  },
  {
    key: "F", title: "F. Scoring and composite", reqs: [
      { id: "F1", title: "Scoring templates per segment, product or program", priority: "P0", status: "built", where: "/admin → Scoring templates" },
      { id: "F2", title: "QA observation 50%", priority: "P0", status: "built", where: "Composite engine" },
      { id: "F3", title: "Operations QA 20%", priority: "P0", status: "built", where: "Composite engine" },
      { id: "F4", title: "Classroom 360° 20% (3+ reviewers)", priority: "P0", status: "built", where: "Composite engine, /reviews" },
      { id: "F5", title: "Accountability 10% (24/72, JD checklist, entries)", priority: "P0", status: "built", where: "Composite engine", note: "Formula is a draft for Education sign-off." },
      { id: "F6", title: "Validity gates; failed gate = provisional", priority: "P0", status: "partial", where: "Composite engine", note: "Gates work; migration 0009 stops a provisional score from unlocking Tier 1 privileges." },
      { id: "F7", title: "Role-specific rubrics", priority: "P0", status: "built", where: "Instructor, TA, class, operations" },
      { id: "F8", title: "Trainee survey view, 60% gate", priority: "P1", status: "built", where: "/me" },
      { id: "T", title: "Tiers and mandatory actions", priority: "P0", status: "partial", where: "Plans open automatically on final Tier 3/4", note: "Plans open on Tier 3/4; from migration 0010 a plan review can pass the case to HR. Tier 4 probation is not tracked yet." },
    ],
  },
  {
    key: "G", title: "G. Instructor performance view", reqs: [
      { id: "G1", title: "Dashboard: composite, tier, breakdown, 4-quarter trend", priority: "P0", status: "built", where: "/me" },
      { id: "G2", title: "Released results with The One Thing", priority: "P0", status: "built", where: "/me" },
      { id: "G3", title: "Notes private by default", priority: "P0", status: "partial", where: "Database rules", note: "Migration 0009 removes private note text from the audit log." },
      { id: "G4", title: "Quarterly Report Card (PDF), acknowledged", priority: "P1", status: "built", where: "/report-card — print or save as PDF", note: "Shows only feedback released in the quarter, with the template's real weights." },
      { id: "G5", title: "Coaching / Improvement Plan with goals and dates", priority: "P1", status: "partial", where: "/people/[id] → Plan", note: "Migration 0009 fixes plan_save; migration 0010 records every review: goals met, extended, moved to an Improvement Plan, or passed to HR." },
    ],
  },
  {
    key: "FB", title: "Feedback any time", reqs: [
      { id: "FB1", title: "Log from phone or laptop, with evidence", priority: "P0", status: "partial", where: "/feedback/new", note: "Photo attachment to private storage from migration 0010." },
      { id: "FB2", title: "Private by default; author edits until reviewed", priority: "P0", status: "partial", where: "/feedback/new → your notes", note: "From migration 0010 the author edits their own note under Your recent notes until it is reviewed." },
      { id: "FB3", title: "Release queue: approve, edit, keep private, merge", priority: "P0", status: "built", where: "/feedback/release" },
      { id: "FB4", title: "Red flags skip the queue, same day", priority: "P0", status: "built", where: "Notifications + pinned in queue" },
      { id: "FB5", title: "Approved feedback appears immediately", priority: "P0", status: "built", where: "/me" },
      { id: "FB6", title: "Acknowledge and reply; time recorded", priority: "P0", status: "built", where: "/me" },
      { id: "FB7", title: "Delivery channel recorded", priority: "P1", status: "built", where: "Release queue" },
      { id: "FB8", title: "Pattern alerts → suggest a Coaching Plan", priority: "P1", status: "built", where: "Notifications" },
      { id: "FB9", title: "Full history", priority: "P0", status: "partial", where: "Audit log, person record", note: "Audit log only; no edit history on the note." },
    ],
  },
  {
    key: "H", title: "H. CODED Certified Trainer Program", reqs: [
      { id: "H1", title: "Enrol from alumni or contractor records", priority: "P1", status: "built", where: "/cctp" },
      { id: "H2", title: "Lessons and rank from the Trainer Learning Path", priority: "P1", status: "partial", where: "/cctp", note: "Progress is entered here; the live hub feed needs an API." },
      { id: "H3", title: "Book the mock class at Path Complete", priority: "P1", status: "built", where: "/cctp" },
      { id: "H4", title: "100-point rubric with critical failures", priority: "P1", status: "built", where: "/cctp → score" },
      { id: "H5", title: "CCT / CCTA / Not Yet with retake", priority: "P1", status: "built", where: "/cctp" },
      { id: "H6", title: "Keep status only at 85+", priority: "P2", status: "built", where: "Flagged at quarter close" },
      { id: "H7", title: "Status feeds approvals and master class eligibility", priority: "P2", status: "partial", where: "People approvals, master classes", note: "CCTP status feeds level suggestions only, not master classes or the pipeline." },
    ],
  },
  {
    key: "R", title: "Records, integration and platform", reqs: [
      { id: "P1", title: "One profile per person, every contract", priority: "P0", status: "built", where: "/me, /people/[id]" },
      { id: "P2", title: "Scores per contract and segment", priority: "P0", status: "partial", where: "History table", note: "One composite per person per quarter; migration 0010 adds released results per segment on the person record." },
      { id: "P3", title: "Segment-aware rubrics (age brackets)", priority: "P1", status: "partial", where: "Kids and Youth rubric variants (drafts)", note: "Migration 0010 adds draft 6–7, 8–10 and 11–13 Kids templates, picked by hand until Education approves the wording." },
      { id: "P4", title: "Readiness flag for moving segment or role", priority: "P2", status: "partial", where: "/levels", note: "Only the TA to Instructor move is flagged; no segment-move flag." },
      { id: "WB", title: "Write-back fields to the ERPNext record", priority: "P1", status: "partial", where: "Profile → 'Written to ERPNext'", note: "Fields are computed and shown; writing into ERPNext happens in Portal v2." },
      { id: "N1", title: "Email and in-app alerts, reminder after 3 days", priority: "P0", status: "partial", where: "/notifications", note: "In-app done; a daily email run (07:00 Kuwait) goes live once the mail provider key and migration 0010 are in place." },
      { id: "N2", title: "Feedback on every action", priority: "P1", status: "built", where: "Every form" },
      { id: "R1", title: "Approval audit log", priority: "P0", status: "built", where: "/admin → Audit log" },
      { id: "R2", title: "Approvals dashboard by stage, age, approver", priority: "P1", status: "built", where: "/approvals" },
      { id: "APP", title: "CODED App signals and 24/72 alerts", priority: "P0", status: "partial", where: "/me, /ops", note: "Runs on sample App data; the live feed needs the CODED App changes (who graded, who took attendance)." },
    ],
  },
  {
    key: "X", title: "Nice to have", reqs: [
      { id: "X3", title: "Recording of mock classes", status: "built", where: "Recording link on CCTP mock classes" },
      { id: "X4", title: "Availability linked to staffing", status: "built", where: "Scheduling and /calendar" },
      { id: "X5", title: "Certified Trainer badge", status: "built", where: "Profile badge" },
      { id: "X6", title: "Batch score", status: "partial", where: "/scores → Recompute", note: "Migration 0010: the segment owner or the Education Principal scores a whole cohort's team from the cohort page." },
    ],
  },
];

export const coverage = () => {
  const all = PRD.flatMap((g) => g.reqs);
  return { total: all.length, built: all.filter((r) => r.status === "built").length, partial: all.filter((r) => r.status !== "built").length };
};
