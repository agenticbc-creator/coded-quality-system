const TZ = "Asia/Kuwait";

export function fmtDate(v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T00:00:00+03:00" : v) : v;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
}
export const fmtDay = (v: string | Date | null | undefined) => fmtDate(v, { weekday: "short", day: "numeric", month: "short" });
export const fmtDateTime = (v: string | Date | null | undefined) =>
  fmtDate(v, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtTime = (v: string | Date | null | undefined) => fmtDate(v, { hour: "2-digit", minute: "2-digit", hour12: false });

export function ago(v: string | null | undefined) {
  if (!v) return "—";
  const ms = Date.now() - new Date(v).getTime();
  const h = Math.round(ms / 36e5);
  if (Math.abs(h) < 1) return "just now";
  if (h < 0) return `in ${Math.abs(h) < 24 ? Math.abs(h) + "h" : Math.round(-h / 24) + "d"}`;
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function hoursSince(v: string | null | undefined) {
  if (!v) return 0;
  return (Date.now() - new Date(v).getTime()) / 36e5;
}

export const num = (v: unknown, digits = 1) => (v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(digits).replace(/\.0$/, ""));

export const TIER = {
  1: { label: "Tier 1", name: "Exemplary", range: "90+", action: "Eligible for master class assignments, rate increase consideration, public recognition" },
  2: { label: "Tier 2", name: "On Track", range: "85–89", action: "Minor tweaks via the Quarterly Report Card" },
  3: { label: "Tier 3", name: "Improvement Needed", range: "75–84", action: "Coaching Plan opened within 14 calendar days" },
  4: { label: "Tier 4", name: "At Risk", range: "Under 75", action: "Formal Improvement Plan and probation" },
} as const;

export function currentPeriod(d = new Date()) {
  const k = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return `${k.getFullYear()}-Q${Math.floor(k.getMonth() / 3) + 1}`;
}
export function periodLabel(p: string) {
  const [y, q] = p.split("-Q");
  const months = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][Number(q) - 1];
  return `Q${q} ${y} · ${months}`;
}

export const SEGMENT: Record<string, string> = { kids: "Kids", youth: "Youth", pro: "Professionals" };

export const STEP: Record<string, { label: string; owner: string }> = {
  criteria: { label: "Criteria", owner: "Education lead" },
  vetting: { label: "Vetting scorecard", owner: "Senior Instructor" },
  selection_rate: { label: "Selection and rate", owner: "Segment owner" },
  contract: { label: "Contract signed", owner: "HR (ERPNext)" },
  onboarding: { label: "Curriculum onboarding", owner: "Education lead" },
  mock1: { label: "Mock class 1", owner: "Senior Instructor" },
  mock2: { label: "Mock class 2", owner: "Senior Instructor" },
  cleared: { label: "Cleared to teach", owner: "Segment owner" },
};

export const COMPONENT: Record<string, { label: string; hint: string }> = {
  qa: { label: "QA observation", hint: "Education QA visits on your role's rubric" },
  ops: { label: "Operations QA", hint: "Classroom operations visits" },
  r360: { label: "Classroom 360°", hint: "Your classroom team's reviews (3+ reviewers)" },
  acc: { label: "Accountability", hint: "24/72 records, feedback acknowledged, JD checklist" },
};

export const ACC_PART: Record<string, string> = {
  attendance_24h: "Attendance logged within 24h",
  grading_72h: "Grading within 72h",
  ack_48h: "Feedback acknowledged within 48h",
  jd_checklist: "JD checklist",
  coordinator: "Coordinator entries",
};

export const CHANNEL: Record<string, string> = {
  email: "Email (went well)",
  call_email: "Call, then email (minor issues)",
  face_email: "Face to face, then email (went badly)",
};

export const FOCUS: Record<string, string> = {
  class: "The class overall",
  instructor: "A specific instructor",
  tas: "The TAs",
  classroom_management: "Classroom management",
  content: "The content",
  alignment: "Alignment before Day 1",
};

export function visitLabel(v: { kind: string; qa_type?: string | null; mode?: string | null }) {
  if (v.kind === "shadowing") return "Shadowing";
  const base = v.qa_type === "operations" ? "Operations QA" : "Education QA";
  return v.mode === "pulse" ? `${base} · pulse check` : v.mode === "popup" ? `${base} · pop-up` : base;
}

export const STATUS_LABEL: Record<string, string> = {
  planned: "Needs an observer",
  invited: "Invite sent",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Working days since a moment (Kuwait weekend: Friday and Saturday), as the approvals turnaround counts them. */
export function workingDaysSince(v: string | null | undefined) {
  if (!v) return 0;
  let n = 0;
  const d = new Date(v);
  const end = new Date();
  d.setHours(0, 0, 0, 0);
  while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (d <= end && w !== 5 && w !== 6) n++; }
  return n;
}
/** " · N days late" against the 3-working-day turnaround, or "". */
export function lateLabel(v: string | null | undefined, turnaround = 3) {
  const over = workingDaysSince(v) - turnaround;
  return over > 0 ? `${over} ${over === 1 ? "day" : "days"} late` : "";
}
