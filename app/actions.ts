"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { adminDb, hasServiceKey } from "@/lib/supabase-admin";
import type { ActionResult } from "@/components/forms";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return v === null || v === "" ? null : String(v);
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  return v === null ? null : Number(v);
};
const json = (f: FormData, k: string) => {
  const v = s(f, k);
  return v ? JSON.parse(v) : null;
};

/** The database's migration level, from the settings table (0009 writes it). Lets the screens light up new features once a migration is applied. */
export async function schemaVersion(): Promise<number> {
  const supabase = await db();
  const { data } = await supabase.from("settings").select("value").eq("key", "schema_version").maybeSingle();
  return Number((data?.value as any)?.v ?? 8);
}

async function call(fn: string, args: Record<string, unknown>, paths: string[], message: string): Promise<ActionResult & { data?: unknown }> {
  const supabase = await db();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  paths.forEach((p) => revalidatePath(p, p.includes("[") ? "page" : undefined));
  return { ok: true, message, data };
}

// ── Sign in / out ─────────────────────────────────────────
export async function signIn(_: ActionResult, f: FormData): Promise<ActionResult> {
  const supabase = await db();
  const persona = s(f, "persona");
  const email = persona ? `${persona}@demo.coded.test` : s(f, "email");
  const password = persona ? process.env.DEMO_PASSWORD : s(f, "password");
  if (!email || !password) return { ok: false, error: persona ? "Demo sign-in is turned off on this deployment." : "Enter your email and password." };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: persona && ["muna", "omar"].includes(persona) && /invalid/i.test(error.message)
    ? "The coordinator sample people are not loaded on this database yet (supabase/seed/coordinators_seed.sql)." : error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await db();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── A. Content ────────────────────────────────────────────
export async function contentCreate(_: ActionResult, f: FormData): Promise<ActionResult> {
  const hours = n(f, "hours"), rate = n(f, "rate");
  const r = await call("content_create", {
    p_program: s(f, "program"), p_title: s(f, "title"), p_kind: s(f, "kind") ?? "new", p_audience: s(f, "audience"),
    p_outcomes: s(f, "outcomes"), p_deadline: s(f, "deadline"),
    p_budget: hours && rate ? { hours, rate, total: hours * rate } : null,
  }, ["/approvals/content"], "Content request created.");
  return r.ok ? { ...r, redirect: `/approvals/content/${r.data}` } : r;
}
export async function contentSubmit(_: ActionResult, f: FormData) {
  const id = s(f, "content")!;
  const checks = ["seventy_thirty", "arc", "productive_struggle", "real_life", "time_boxed", "outcomes_mapped"];
  const precheck = Object.fromEntries(checks.filter((c) => f.has(`pc_${c}`) || f.has("precheck_on")).map((c) => [c, f.get(`pc_${c}`) === "on"]));
  return call("content_submit", { p_content: id, p_summary: s(f, "summary"), p_link: s(f, "link"), p_precheck: Object.keys(precheck).length ? precheck : null }, [`/approvals/content/${id}`, "/approvals/content"],
    "Submitted for approval. The approver has been notified.");
}
export async function contentDecide(_: ActionResult, f: FormData) {
  const id = s(f, "content")!;
  return call("content_decide", { p_version: s(f, "version"), p_decision: s(f, "decision"), p_comments: s(f, "comments") },
    [`/approvals/content/${id}`, "/approvals/content"], s(f, "decision") === "approved" ? "Approved and recorded." : "Changes requested. The creator has been notified.");
}
export async function cohortAttachContent(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("cohort_attach_content", { p_cohort: id, p_content: s(f, "content") }, [`/cohorts/${id}`], "Approved content locked to this cohort.");
}

// ── B. People approvals ───────────────────────────────────
export async function pipelineStart(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await call("pipeline_start", { p_person: s(f, "person"), p_role: s(f, "role"), p_segment: s(f, "segment"), p_program: s(f, "program") },
    ["/approvals/people"], "Approval started.");
  return r.ok ? { ...r, redirect: `/approvals/people/${r.data}` } : r;
}
export async function pipelineStep(_: ActionResult, f: FormData) {
  const id = s(f, "pipeline")!;
  const data: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith("score_")) ((data.scores ??= {}) as Record<string, number>)[k.slice(6)] = Number(v);
    if (k.startsWith("check_")) ((data.checklist ??= {}) as Record<string, boolean>)[k.slice(6)] = true;
  }
  if (data.scores) data.total = Object.values(data.scores as Record<string, number>).reduce((a, b) => a + b, 0);
  if (s(f, "rate")) { data.rate = n(f, "rate"); data.rate_type = s(f, "rate_type") ?? "hourly"; }
  if (s(f, "recommend")) data.recommend = s(f, "recommend") === "yes";
  return call("pipeline_step_complete", { p_step: s(f, "step"), p_status: s(f, "status") ?? "done", p_data: data, p_notes: s(f, "notes") },
    [`/approvals/people/${id}`, "/approvals/people"], s(f, "status") === "failed" ? "Recorded as not passed." : "Step complete.");
}
export async function pipelineMock(_: ActionResult, f: FormData) {
  const id = s(f, "pipeline")!;
  const scores: Record<string, number> = {};
  const critical: string[] = [];
  for (const [k, v] of f.entries()) {
    if (k.startsWith("score_")) scores[k.slice(6)] = Number(v);
    if (k.startsWith("crit_")) critical.push(k.slice(5));
  }
  const r = await call("pipeline_record_mock", { p_step: s(f, "step"), p_scores: scores, p_critical: critical, p_feedback: s(f, "feedback") },
    [`/approvals/people/${id}`], "");
  if (!r.ok) return r;
  const d = r.data as { total: number; result: string; passed: boolean };
  return { ok: true, message: `${d.total}/100 — ${d.result === "not_yet" ? "Not Yet" : d.result}. ${d.passed ? "Step complete." : "Not passed: the candidate can retake."}` };
}

// ── C. Cohorts and classrooms ─────────────────────────────
export async function cohortCreate(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await call("cohort_create", { p_program: s(f, "program"), p_name: s(f, "name"), p_start: s(f, "start"), p_end: s(f, "end"), p_classrooms: n(f, "classrooms") ?? 1 },
    ["/cohorts"], "Cohort created.");
  return r.ok ? { ...r, redirect: `/cohorts/${r.data}` } : r;
}
export async function classroomAdd(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("classroom_add", { p_cohort: id, p_name: s(f, "name"), p_room: s(f, "room") }, [`/cohorts/${id}`], "Classroom added.");
}
export async function classroomAssign(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("classroom_assign", { p_classroom: s(f, "classroom"), p_person: s(f, "person"), p_role: s(f, "role"), p_is_lead: s(f, "lead") === "on" },
    [`/cohorts/${id}`], "Assigned.");
}
export async function classroomUnassign(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("classroom_unassign", { p_classroom: s(f, "classroom"), p_person: s(f, "person") }, [`/cohorts/${id}`], "Removed.");
}
export async function classroomReady(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("classroom_set_ready", { p_classroom: s(f, "classroom"), p_ready: s(f, "ready") === "true", p_room: s(f, "room") },
    [`/cohorts/${id}`, "/ops"], s(f, "ready") === "true" ? "Marked ready." : "Marked not ready.");
}
export async function cohortRole(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("cohort_set_role", { p_cohort: id, p_person: s(f, "person"), p_role: s(f, "role"), p_on: s(f, "on") !== "false" }, [`/cohorts/${id}`], "Updated.");
}
export async function cohortBackup(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("cohort_set_backup", { p_cohort: id, p_person: s(f, "person") }, [`/cohorts/${id}`], "Backup instructor recorded.");
}
export async function qaPlanGenerate(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  const r = await call("qa_plan_generate", { p_cohort: id }, [`/cohorts/${id}`, "/visits"], "");
  return r.ok ? { ok: true, message: `QA plan generated: ${(r.data as { visits: number }).visits} visits added to the program checklist.` } : r;
}
export async function cohortGoLive(_: ActionResult, f: FormData): Promise<ActionResult> {
  const id = s(f, "cohort")!;
  const r = await call("cohort_go_live", { p_cohort: id }, [`/cohorts/${id}`, "/cohorts"], "");
  if (!r.ok) return r;
  const d = r.data as { ok: boolean; blockers: string[] };
  return d.ok ? { ok: true, message: "The cohort is live." } : { ok: false, error: "Not ready: " + d.blockers.join("; ") };
}
export async function cohortClose(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  return call("cohort_close", { p_cohort: id, p_final_report: s(f, "report") }, [`/cohorts/${id}`, "/cohorts"], "Cohort closed. 360° reviews are open for 14 days.");
}

// ── D/E. Visits ───────────────────────────────────────────
export async function visitSchedule(_: ActionResult, f: FormData): Promise<ActionResult> {
  const when = s(f, "date") && s(f, "time") ? `${s(f, "date")}T${s(f, "time")}:00+03:00` : null;
  const kind = s(f, "kind");
  const r = await call("visit_schedule", {
    p_visit: s(f, "visit"), p_cohort: s(f, "cohort"), p_classroom: s(f, "classroom"), p_kind: kind === "shadowing" ? "shadowing" : "qa",
    p_qa_type: kind === "shadowing" ? null : kind, p_mode: s(f, "mode") ?? "planned", p_focus: s(f, "focus") ?? "class",
    p_focus_person: s(f, "focus_person"), p_template: s(f, "template"), p_assignee: s(f, "assignee"), p_when: when,
  }, ["/visits", `/cohorts/${s(f, "cohort")}`], "Visit scheduled. The observer has a calendar invite with a reminder.");
  return r.ok ? { ...r, redirect: `/visits/${r.data}` } : r;
}
export async function visitRespond(_: ActionResult, f: FormData) {
  const id = s(f, "visit")!;
  const when = s(f, "date") && s(f, "time") ? `${s(f, "date")}T${s(f, "time")}:00+03:00` : null;
  const action = s(f, "action")!;
  return call("visit_respond", { p_visit: id, p_action: action, p_when: when, p_reason: s(f, "reason") }, [`/visits/${id}`, "/visits"],
    { accept: "Accepted.", reschedule: "Rescheduled. The scheduler has been notified.", decline: "Declined. It goes to the next free observer, or back to the scheduler if there is none.", cancel: "Visit cancelled." }[action] ?? "Updated.");
}
export async function visitSubmit(_: ActionResult, f: FormData): Promise<ActionResult> {
  const id = s(f, "visit")!;
  const r = await call("visit_submit", {
    p_visit: id, p_attendance: s(f, "attendance"), p_unobserved: json(f, "unobserved") ?? [], p_interventions: json(f, "interventions") ?? [],
    p_checklist: json(f, "checklist"), p_scores: json(f, "scores") ?? [], p_action_points: s(f, "action_points"), p_flags: json(f, "flags") ?? [],
    p_summary: s(f, "summary"), p_one_thing: s(f, "one_thing"),
  }, [`/visits/${id}`, "/visits", "/feedback/release"], "Report filed. It stays private until the segment owner releases it.");
  return r;
}
export async function visitRelease(_: ActionResult, f: FormData) {
  const args: Record<string, unknown> = { p_visit: s(f, "visit"), p_decision: s(f, "decision"), p_summary: s(f, "summary"), p_one_thing: s(f, "one_thing"),
    p_action_points: s(f, "action_points"), p_channel: s(f, "channel") };
  // Migration 0009 adds per-person One Thing and action points. Only send them once the database has it.
  const people = String(f.get("people") ?? "").split(",").filter(Boolean);
  if (people.length && (await schemaVersion()) >= 9) {
    args.p_people = people.map((id) => ({ person: id, one_thing: s(f, `one_thing_${id}`), action_points: s(f, `action_points_${id}`), channel: s(f, `channel_${id}`) || s(f, "channel") }));
  }
  return call("visit_release", args, ["/feedback/release", "/owner"],
    s(f, "decision") === "keep_private" ? "Kept private (record only)." : "Released. Each person sees their own feedback on their dashboard now.");
}

// ── Feedback any time ─────────────────────────────────────
export async function feedbackLog(_: ActionResult, f: FormData) {
  const sev = s(f, "severity");
  return call("feedback_log", { p_subject: s(f, "subject"), p_cohort: s(f, "cohort"), p_classroom: s(f, "classroom"), p_type: s(f, "type"),
    p_severity: sev, p_body: s(f, "body"), p_red_flag_reason: s(f, "red_flag_reason"), p_attachment: s(f, "attachment") }, ["/feedback/release", "/feedback/new"],
    sev === "red_flag" ? "Logged. The segment owner was alerted for a same-day review." : "Logged privately. It reaches the educator only if the segment owner releases it.");
}
export async function feedbackReview(_: ActionResult, f: FormData) {
  const d = s(f, "decision");
  return call("feedback_review", { p_id: s(f, "id"), p_decision: d, p_text: s(f, "text"), p_channel: s(f, "channel"), p_merge_into: s(f, "merge_into") },
    ["/feedback/release", "/owner"], d === "keep_private" ? "Kept private." : d === "merge" ? "Merged." : "Released to the educator.");
}
export async function feedbackAck(_: ActionResult, f: FormData) {
  return call("feedback_ack", { p_released: s(f, "id"), p_reply: s(f, "reply") }, ["/me"], "Acknowledged. Thank you.");
}

// ── 360°, JD, accountability ──────────────────────────────
export async function reviewSubmit(_: ActionResult, f: FormData) {
  const items: Record<string, number> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("item_") && v) items[k.slice(5)] = Number(v);
  return call("review_submit", { p_cohort: s(f, "cohort"), p_classroom: s(f, "classroom"), p_subject: s(f, "subject"), p_items: items, p_comment: s(f, "comment") },
    ["/reviews"], "Review saved. Only the aggregate is ever shown.");
}
export async function jdConfirm(_: ActionResult, f: FormData) {
  const p = s(f, "person")!;
  return call("jd_confirm", { p_person: p, p_cohort: s(f, "cohort"), p_item: s(f, "item"), p_done: s(f, "done") === "true" }, [`/people/${p}`], "Checklist updated.");
}
export async function accountabilityAdd(_: ActionResult, f: FormData) {
  const p = s(f, "person")!;
  return call("accountability_add", { p_person: p, p_cohort: s(f, "cohort"), p_label: s(f, "label"), p_score: n(f, "score") }, [`/people/${p}`], "Entry added.");
}

// ── Scores and jobs ───────────────────────────────────────
export async function compositesCompute(_: ActionResult, f: FormData) {
  const r = await call("composites_compute", { p_period: s(f, "period"), p_segment: s(f, "segment") }, ["/scores", "/owner", "/me"], "");
  if (!r.ok) return r;
  const d = r.data as { people: number; ms: number };
  return { ok: true, message: `Recomputed ${d.people} people in ${(d.ms / 1000).toFixed(2)} s.` };
}
export async function runDailyJobs(_: ActionResult, _f: FormData) {
  const r = await call("run_daily_jobs_ext", {}, ["/admin", "/ops", "/levels"], "");
  if (!r.ok) return r;
  const d = r.data as Record<string, number>;
  const total = Object.values(d).reduce((a, b) => a + (Number(b) || 0), 0);
  return { ok: true, message: `Daily jobs ran: ${d.attendance_reminders} attendance and ${d.grading_reminders} grading reminders, ${d.escalations} escalations, ${d.approval_reminders} approval reminders, ${d.visit_reminders} visit reminders, ${d.pulse_triggers} pulse triggers, ${d.level_suggestions ?? 0} level checks (${total} actions).` };
}
export async function remind(_: ActionResult, f: FormData) {
  return call("remind_person", { p_person: s(f, "person"), p_title: s(f, "title"), p_body: s(f, "body"), p_link: s(f, "link") ?? "/me" }, ["/ops"], "Reminder sent.");
}

// ── Admin ─────────────────────────────────────────────────
export async function settingsSet(_: ActionResult, f: FormData) {
  let value: unknown;
  try { value = JSON.parse(s(f, "value") ?? "null"); } catch { return { ok: false, error: "That is not valid JSON." }; }
  return call("settings_set", { p_key: s(f, "key"), p_value: value, p_status: s(f, "status") }, ["/admin"], "Setting saved and logged.");
}
export async function scoringTemplateSave(_: ActionResult, f: FormData) {
  return call("scoring_template_save", {
    p_id: s(f, "id"), p_name: s(f, "name"), p_scope_type: s(f, "scope_type"), p_scope_id: s(f, "scope_id"),
    p_weights: { qa: n(f, "qa"), ops: n(f, "ops"), r360: n(f, "r360"), acc: n(f, "acc") },
    p_gates: { min_edu_qa: n(f, "min_edu_qa"), min_360_reviewers: n(f, "min_360_reviewers"), min_ops_qa: n(f, "min_ops_qa") },
  }, ["/admin"], "Scoring template saved as a new version.");
}
export async function personRoles(_: ActionResult, f: FormData) {
  return call("person_set_roles", { p_person: s(f, "person"), p_roles: f.getAll("roles").map(String), p_owned: f.getAll("owned").map(String), p_full_timer: s(f, "full_timer") === "on" },
    ["/admin"], "Access updated and logged.");
}
export async function notificationsRead(_: ActionResult, _f: FormData) {
  return call("notifications_read", { p_ids: null }, ["/notifications"], "All caught up.");
}
export async function qaTemplateSave(_: ActionResult, f: FormData) {
  let rubric: unknown;
  try { rubric = JSON.parse(s(f, "rubric") ?? "null"); } catch { return { ok: false, error: "The rubric is not valid JSON." }; }
  return call("qa_template_save", { p_key: s(f, "key"), p_name: s(f, "name"), p_kind: s(f, "kind"), p_focus: s(f, "focus"),
    p_subjects: (s(f, "subjects") ?? "").split(",").map((x) => x.trim()).filter(Boolean), p_rubric: rubric, p_special: s(f, "special") === "on" },
    ["/admin"], "Template saved as a new version.");
}


// ── A6/A7. Staged review ─────────────────────────────────
export async function contentEnableStages(_: ActionResult, f: FormData) {
  const id = s(f, "content")!;
  return call("content_enable_stages", { p_content: id }, [`/approvals/content/${id}`], "Staged review turned on: Outline → Beta.");
}
export async function contentStageDecide(_: ActionResult, f: FormData) {
  const id = s(f, "content")!;
  return call("content_stage_decide", { p_stage: s(f, "stage"), p_decision: s(f, "decision"), p_comments: s(f, "comments") }, [`/approvals/content/${id}`, "/approvals"], "Stage decision recorded.");
}

// ── H. CCTP ───────────────────────────────────────────────
export async function cctpEnrol(_: ActionResult, f: FormData) {
  return call("cctp_enrol", { p_person: s(f, "person"), p_source: s(f, "source") }, ["/cctp"], "Enrolled. They have been welcomed to the path.");
}
export async function cctpProgress(_: ActionResult, f: FormData) {
  const r = await call("cctp_progress", { p_person: s(f, "person"), p_lessons: n(f, "lessons") }, ["/cctp"], "");
  return r.ok ? { ...r, message: `Progress saved · rank: ${r.data}` } : r;
}
export async function cctpBook(_: ActionResult, f: FormData) {
  const when = s(f, "when");
  return call("cctp_book", { p_when: when ? new Date(when + "+03:00").toISOString() : null, p_person: s(f, "person") }, ["/cctp", "/calendar"], "Mock class booked. The Education Principal has been notified.");
}
export async function cctpRecord(_: ActionResult, f: FormData) {
  const keys = ["arc", "struggle", "mentorship", "collaborative", "supportive", "real_life"];
  const scores = Object.fromEntries(keys.map((k) => [k, Number(f.get(`s_${k}`) ?? 0)]));
  const r = await call("cctp_record", { p_booking: s(f, "booking"), p_scores: scores, p_critical: f.getAll("critical").map(String), p_feedback: s(f, "feedback"), p_recording: s(f, "recording") }, ["/cctp"], "");
  if (!r.ok) return r;
  const d = r.data as { total: number; result: string };
  return { ...r, message: d.result === "not_yet" ? `Scored ${d.total}/100 · Not Yet. A retake can be booked.` : `Scored ${d.total}/100 · certified ${d.result}.` };
}

// ── G4/G5. Report card and plans ──────────────────────────
export async function reportCardAck(_: ActionResult, f: FormData) {
  return call("report_card_ack", { p_period: s(f, "period"), p_comment: s(f, "comment") }, ["/report-card", "/me"], "Report card acknowledged.");
}
export async function planSave(_: ActionResult, f: FormData) {
  const person = s(f, "person");
  const goals = String(f.get("goals") ?? "").split("\n").map((g) => g.trim()).filter(Boolean)
    .map((g) => ({ goal: g.replace(/^\[x\]\s*/i, ""), done: /^\[x\]/i.test(g) }));
  return call("plan_save", { p_plan: s(f, "plan"), p_person: person, p_kind: s(f, "kind"), p_due: s(f, "due"), p_goals: goals, p_status: s(f, "status") },
    [`/people/${person}`, "/me", "/owner"], "Plan saved and the educator can see it.");
}

// ── B7/P4. Levels ─────────────────────────────────────────
export async function levelDecide(_: ActionResult, f: FormData) {
  const r = await call("level_change_decide", { p_id: s(f, "id"), p_decision: s(f, "decision") }, ["/levels"], "");
  return r.ok ? { ...r, message: r.data === "approved" ? "Approved by both sides. HR has been asked to update ERPNext." : r.data === "rejected" ? "Rejected." : "Your approval is recorded. Waiting for the other approver." } : r;
}
export async function levelSuggest(_: ActionResult, _f: FormData) {
  const r = await call("level_suggestions_run", {}, ["/levels"], "");
  return r.ok ? { ...r, message: `Checked every educator · ${r.data} suggestion${r.data === 1 ? "" : "s"} (existing ones are not duplicated).` } : r;
}

// ── E7. QAer onboarding ───────────────────────────────────
export async function onboardingComplete(_: ActionResult, f: FormData) {
  return call("qaer_onboarding_complete", { p_template_key: s(f, "key") }, ["/onboarding", "/education"], "Marked as complete. You are ready to use this template.");
}

// ── C5/D7. Master classes ─────────────────────────────────
export async function masterClassSchedule(_: ActionResult, f: FormData) {
  const when = s(f, "when");
  const supabase = await db();
  const { data: cl } = await supabase.from("classrooms").select("cohort_id").eq("id", s(f, "classroom")).maybeSingle();
  return call("master_class_schedule", {
    p_cohort: cl?.cohort_id ?? null, p_classroom: s(f, "classroom"), p_kind: s(f, "kind"), p_title: s(f, "title"), p_instructor: s(f, "instructor"),
    p_when: when ? new Date(when + "+03:00").toISOString() : null, p_assignee: s(f, "assignee"),
  }, ["/master-classes", "/visits", "/calendar"], "Scheduled. The instructor and the evaluator have been notified.");
}

// ── Migration 0010 ────────────────────────────────────────
// Cohort sign-offs (C3): the segment owner approves the staffing and the QA plan before Day 1.
export async function cohortApprove(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  const what = s(f, "what")!;
  return call("cohort_approve", { p_cohort: id, p_what: what }, [`/cohorts/${id}`], what === "staffing" ? "Staffing approved." : "QA plan approved.");
}
export async function cohortScore(_: ActionResult, f: FormData) {
  const id = s(f, "cohort")!;
  const r = await call("cohort_score", { p_cohort: id, p_period: s(f, "period") }, [`/cohorts/${id}`, "/scores"], "");
  return r.ok ? { ...r, message: `Scored ${(r.data as any)?.people ?? 0} people on this cohort.` } : r;
}
// Plan reviews (P3): every plan ends with an outcome.
export async function planReview(_: ActionResult, f: FormData) {
  const person = s(f, "person");
  const outcome = s(f, "outcome");
  return call("plan_review", { p_plan: s(f, "plan"), p_outcome: outcome, p_note: s(f, "note"), p_new_due: s(f, "due") },
    [`/people/${person}`, "/me", "/owner"],
    { met: "Recorded: goals met. The plan is closed.", extended: "Plan extended to the new date.", escalated: "Moved to an Improvement Plan.", hr_review: "Recorded. HR has been asked to step in." }[outcome ?? ""] ?? "Recorded.");
}
// Authors correct their own note until it is reviewed.
export async function feedbackUpdateOwn(_: ActionResult, f: FormData) {
  return call("feedback_update_own", { p_id: s(f, "id"), p_type: s(f, "type"), p_severity: s(f, "severity"), p_body: s(f, "body"), p_red_flag_reason: s(f, "red_flag_reason") },
    ["/feedback/new"], "Note updated.");
}
// Evidence: the browser uploads the file to private storage, then records it on the visit.
export async function visitEvidenceAdd(path: string, visit: string, kind: string, label: string | null): Promise<ActionResult> {
  return call("visit_evidence_add", { p_visit: visit, p_path: path, p_kind: kind, p_label: label }, [`/visits/${visit}`], "Evidence attached.");
}

// People (system owner): a record first, then an invite email when the service key is set.
export async function personAdd(_: ActionResult, f: FormData): Promise<ActionResult> {
  const supabase = await db();
  const roles = f.getAll("roles").map(String).filter(Boolean);
  const owned = f.getAll("owned").map(String).filter(Boolean);
  const email = (s(f, "email") ?? "").trim().toLowerCase();
  const { error } = await supabase.rpc("person_add", { p_full_name: s(f, "full_name"), p_email: email, p_roles: roles, p_home_segment: s(f, "segment"),
    p_owned: owned, p_full_timer: f.get("full_timer") === "on", p_arabic: s(f, "arabic_name") });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  if (f.get("invite") !== "on") return { ok: true, message: "Record added. They can sign in once they have an account with this email." };
  if (!hasServiceKey()) return { ok: true, message: "Record added. The invite email is off until SUPABASE_SERVICE_ROLE_KEY is set in Vercel; send the invite from Supabase (Authentication > Users > Invite) for now." };
  const base = (process.env.APP_URL || "https://coded-quality-system.vercel.app").replace(/\/$/, "");
  const { error: inv } = await adminDb().auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/login` });
  return inv ? { ok: true, message: `Record added, but the invite failed: ${inv.message}` } : { ok: true, message: "Record added and the invite email is on its way." };
}

/** Minimal CSV reader: first row is the header; quoted fields and commas inside quotes are handled. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
async function csvFrom(f: FormData): Promise<string> {
  const file = f.get("file");
  if (file && typeof file === "object" && "text" in file && (file as File).size > 0) return (file as File).text();
  return String(f.get("csv") ?? "");
}
export async function importContractors(_: ActionResult, f: FormData) {
  const rows = parseCsv(await csvFrom(f));
  if (!rows.length) return { ok: false, error: "No rows found. The first line must be the header." };
  const r = await call("import_contractors", { p_rows: rows }, ["/admin", "/people"], "");
  return r.ok ? { ...r, message: `Imported: ${(r.data as any)?.new ?? 0} new, ${(r.data as any)?.updated ?? 0} updated.` } : r;
}
export async function importSessions(_: ActionResult, f: FormData) {
  const rows = parseCsv(await csvFrom(f));
  if (!rows.length) return { ok: false, error: "No rows found. The first line must be the header." };
  const r = await call("import_sessions", { p_rows: rows }, ["/admin", "/calendar"], "");
  return r.ok ? { ...r, message: `Imported ${(r.data as any)?.new ?? 0} sessions (${(r.data as any)?.skipped ?? 0} already there).` } : r;
}

// Interface language (the shell only for now; see lib/i18n.ts).
export async function setLang(f: FormData) {
  const store = await cookies();
  store.set("lang", s(f, "lang") === "ar" ? "ar" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
