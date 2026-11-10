import { notFound, redirect } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { loadPerson } from "@/lib/person";
import { db } from "@/lib/supabase";
import { Breakdown, FeedbackList, Hero, History, JDChecklist, Plans, Profile, Review360, SegmentScores, Signals, Surveys, Trend, WriteBack } from "@/components/performance";
import { Badge, Card, CardTitle, Empty, Field, PageHeader, Table, input, td } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { accountabilityAdd, personSetApproval, personSetEmail, planReview, planSave, schemaVersion } from "@/app/actions";
import { LinkButton } from "@/components/ui";
import Link from "next/link";
import { STATUS_LABEL, fmtDate, fmtDateTime, num, visitLabel } from "@/lib/format";

/** Notes brought in from Notion carry their own header; show who observed instead of the importing account. */
const imported = (body: string) => /imported from Notion/.test(body.split("\n")[0] ?? "");
const observedBy = (body: string) => body.match(/^Observed by: (.+)$/m)?.[1] ?? "";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (id === me.id) redirect("/me");
  const d = await loadPerson(id);
  if (!d.person) notFound();
  const supabase = await db();
  const [{ data: notes }, { data: scores }, v, { data: focusVisits }, { data: allowed }] = await Promise.all([
    supabase.from("feedback").select("*, author:people!feedback_author_id_fkey(full_name), cohort:cohorts(name)").eq("subject_id", id).order("created_at", { ascending: false }),
    supabase.from("visit_scores").select("*, visit:visits(kind, qa_type, mode, week_no, submitted_at, release_status, cohort:cohorts(name))").eq("subject_person_id", id),
    schemaVersion(),
    // Visits that focus on this person: RLS shows them to owners, the Education Principal and the observer only.
    supabase.from("visits").select("id, kind, qa_type, mode, status, scheduled_for, submitted_at, assignee_id, cohort:cohorts(name)").eq("focus_person_id", id).neq("status", "cancelled").order("scheduled_for", { ascending: false }),
    supabase.rpc("can_see_scores", { p: id }),
  ]);
  const canSeeScores = Boolean(d.current) || d.composites.length > 0;
  const isOwner = has(me, "segment_owner");
  const p = d.person;
  const ownsSeg = isOwner && [p.home_segment, ...d.classrooms.map((c) => c.classroom.cohort.program?.segment_id)].some((sg) => sg && me.owned_segments.includes(sg));
  const canClear = (ownsSeg || has(me, "education_principal", "system_owner")) && v >= 13;
  const isSystemOwner = has(me, "system_owner") && v >= 13;
  const clearable = p.approval_status === "cleared" || (p.approval_status === "not_started" && (p.erp_contractor_status ?? "Active") === "Active");
  const upcomingVisits = (focusVisits ?? []).filter((x: any) => !x.submitted_at);
  const pastVisits = (focusVisits ?? []).filter((x: any) => x.submitted_at);
  const canConfirm = isOwner || has(me, "senior_instructor", "education_principal", "lead_instructor");
  const liveCohort = d.classrooms.find((c) => c.classroom.cohort.status === "live")?.classroom.cohort;

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/people", label: "People" }} eyebrow="Performance record" title={d.person.full_name}
        sub="Everything below is filtered by your role. Private notes stay with the segment owner and the Education Principal."
        actions={canSeeScores ? <LinkButton href={`/report-card?person=${id}`} variant="secondary" icon="printer">Report card</LinkButton> : undefined} />
      {canSeeScores ? <Hero d={d} self={false} /> : (
        allowed
          ? <Card><Empty icon="chart" title="No score yet" sub="A score appears once released QA visits, reviews and App signals add up for a quarter." /></Card>
          : <Card><Empty icon="lock" title="Scores are not visible to your role" sub="Evaluations stay with the segment, Operations and HR on specific elements (decided 25 Oct 2026)." /></Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {canSeeScores && <Breakdown d={d} />}
          <SegmentScores d={d} />
          <Signals d={d} />
          {(scores?.length ?? 0) > 0 && (
            <Card>
              <CardTitle icon="clipboard" sub="Scores on the rubric of the role observed">Visit scores</CardTitle>
              <Table head={["Visit", "Cohort", "Role", "Score", "Status"]}>
                {scores!.sort((a: any, b: any) => (a.visit.submitted_at < b.visit.submitted_at ? 1 : -1)).map((s: any) => (
                  <tr key={s.id}>
                    <td className={td}><div className="font-medium text-navy">{visitLabel(s.visit)}</div><div className="text-[12px] text-ink-500">Week {s.visit.week_no} · {fmtDate(s.visit.submitted_at)}</div></td>
                    <td className={td}>{s.visit.cohort?.name}</td>
                    <td className={td}>{s.subject_role === "ta" ? "TA" : "Instructor"}</td>
                    <td className={td}><span className={`tabular-nums font-semibold ${Number(s.pct) < 75 ? "text-tier4" : "text-navy"}`}>{num(s.pct)}</span></td>
                    <td className={td}><Badge tone={s.visit.release_status === "released" ? "green" : "amber"}>{s.visit.release_status === "released" ? "Released" : "Not released"}</Badge></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          {(notes?.length ?? 0) > 0 && (
            <Card>
              <CardTitle icon="lock" sub="Private by default. Only released notes reach the educator, as a separate copy.">Notes (private)</CardTitle>
              <ul className="space-y-2.5">
                {notes!.map((f: any) => {
                  const imp = imported(f.body);
                  const who = imp ? `From Notion · observed by ${observedBy(f.body) || "not recorded"}` : f.author?.full_name;
                  const long = f.body.length > 480;
                  const cut = long ? (f.body.lastIndexOf("\n", 420) > 200 ? f.body.lastIndexOf("\n", 420) : 420) : 0;
                  return (
                    <li key={f.id} className="rounded-lg border border-line p-3 text-[13.5px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={f.severity === "red_flag" ? "red" : f.type === "praise" ? "green" : f.type === "concern" ? "amber" : "neutral"}>{f.severity === "red_flag" ? `Red flag · ${f.red_flag_reason}` : f.type}</Badge>
                        <Badge>{f.status.replace("_", " ")}</Badge>
                        <span className="text-[12.5px] text-ink-500">{[who, fmtDate(f.created_at), f.cohort?.name].filter(Boolean).join(" · ")}</span>
                      </div>
                      {long ? (
                        <details className="group mt-1.5">
                          <summary className="cursor-pointer list-none text-ink"><span className="whitespace-pre-line">{f.body.slice(0, cut)}</span><span className="group-open:hidden">…</span> <span className="font-semibold text-brand group-open:hidden">Read all</span></summary>
                          <p className="whitespace-pre-line text-ink">{f.body.slice(cut).replace(/^\n/, "")}</p>
                        </details>
                      ) : <p className="mt-1.5 whitespace-pre-line text-ink">{f.body}</p>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <FeedbackList d={d} self={false} />
        </div>
        <div className="space-y-6">
          {(canClear || isSystemOwner) && (
            <Card>
              <CardTitle icon="user-check" sub="Nobody teaches without approval. Clearing here records who approved it and why.">Clearance and sign-in</CardTitle>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
                <Badge tone={p.approval_status === "cleared" ? "green" : p.approval_status === "in_pipeline" ? "amber" : "neutral"}>
                  {p.approval_status === "cleared" ? "Cleared to teach" : p.approval_status === "in_pipeline" ? "In the approval pipeline" : p.approval_status === "not_approved" ? "Not approved" : "Not cleared yet"}
                </Badge>
                {p.erp_instructor_level && <Badge>{p.erp_instructor_level}</Badge>}
                {p.erp_contractor_status === "Inactive" && <Badge tone="amber">Inactive</Badge>}
              </div>
              {canClear && clearable && (
                <Disclosure label={p.approval_status === "cleared" ? "Take clearance back" : "Clear to teach"}>
                  <ActionForm action={personSetApproval} className="space-y-2">
                    <input type="hidden" name="person" value={id} />
                    <input type="hidden" name="status" value={p.approval_status === "cleared" ? "not_started" : "cleared"} />
                    <Field label="Why"><input name="reason" required minLength={5} className={input} placeholder={p.approval_status === "cleared" ? "e.g. Contract ended" : "e.g. Hired as TA and approved in ERPNext"} /></Field>
                    <Submit size="sm" variant={p.approval_status === "cleared" ? "secondary" : "primary"} icon="check">{p.approval_status === "cleared" ? "Take back" : "Clear to teach"}</Submit>
                  </ActionForm>
                </Disclosure>
              )}
              {isSystemOwner && (
                <div className="mt-3 border-t border-line pt-3 text-[13.5px]">
                  {p.auth_user_id ? <p className="text-ink-600">Signs in as <b>{p.email}</b>.</p> : (
                    <ActionForm action={personSetEmail} className="space-y-2">
                      <input type="hidden" name="person" value={id} />
                      <Field label={p.email ? "Sign-in email (not signed in yet)" : "Sign-in email"}><input name="email" type="email" required defaultValue={p.email ?? ""} className={input} placeholder="name@joincoded.com" /></Field>
                      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="invite" defaultChecked /> Send the invite email</label>
                      <p className="text-[12px] text-ink-500">Their first sign-in with this email links to this record, so nothing is duplicated.</p>
                      <Submit size="sm" variant="secondary">Save email</Submit>
                    </ActionForm>
                  )}
                </div>
              )}
            </Card>
          )}
          {(focusVisits ?? []).length > 0 && (
            <Card>
              <CardTitle icon="eye" sub="Visits that focus on this person, booked and done">Shadowing and visits</CardTitle>
              <ul className="divide-y divide-line/70 text-[13.5px]">
                {[...upcomingVisits.slice().reverse(), ...pastVisits].map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/visits/${x.id}`} className="min-w-0 hover:text-brand">
                      <span className="block truncate font-medium text-navy">{visitLabel(x)} · {x.cohort?.name}</span>
                      <span className="block text-[12px] text-ink-500">{x.submitted_at ? fmtDate(x.submitted_at) : fmtDateTime(x.scheduled_for)}</span>
                    </Link>
                    <Badge tone={x.submitted_at ? "neutral" : !x.assignee_id ? "amber" : "brand"}>{x.submitted_at ? "Done" : STATUS_LABEL[x.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Plans d={d} />
          {isOwner && (
            <Card>
              <CardTitle icon="flag" sub="Plans open automatically on a final Tier 3 or 4. Edit goals and dates here; the educator sees changes straight away. Start a goal with [x] to mark it done.">
                {d.plans.some((p) => p.status === "open") ? "Manage the plan" : "Open a plan"}
              </CardTitle>
              {(d.plans.filter((p) => p.status === "open").length ? d.plans.filter((p) => p.status === "open") : [null]).map((p: any) => (
                <ActionForm key={p?.id ?? "new"} action={planSave} className="space-y-3">
                  <input type="hidden" name="person" value={id} />
                  {p && <input type="hidden" name="plan" value={p.id} />}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Type"><select name="kind" defaultValue={p?.kind ?? "coaching"} className={input}><option value="coaching">Coaching Plan</option><option value="improvement">Formal Improvement Plan</option></select></Field>
                    <Field label="Due"><input type="date" name="due" required defaultValue={p?.due ?? ""} className={input} /></Field>
                  </div>
                  <Field label="Goals (one per line)">
                    <textarea name="goals" rows={4} className={input} defaultValue={(p?.goals ?? []).map((g: any) => (g.done ? "[x] " : "") + g.goal).join("\n")} placeholder={"Time-box every activity\nAct on the One Thing from the last debrief"} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Submit size="sm" icon="check">{p ? "Save plan" : "Open plan"}</Submit>
                    {p && v < 10 && <Submit size="sm" variant="secondary" name="status" value="closed">Close plan</Submit>}
                  </div>
                </ActionForm>
              ))}
              {v >= 10 && d.plans.filter((p) => p.status === "open").map((p: any) => (
                <div key={`review-${p.id}`} className="mt-4 border-t border-line pt-3">
                  <Disclosure label={`Record the ${p.kind === "coaching" ? "Coaching" : "Improvement"} Plan review`}>
                    <ActionForm action={planReview} className="space-y-3">
                      <input type="hidden" name="person" value={id} /><input type="hidden" name="plan" value={p.id} />
                      <Field label="Outcome">
                        <select name="outcome" className={input} defaultValue="met">
                          <option value="met">Goals met: close the plan</option>
                          <option value="extended">Not yet: extend to a new date</option>
                          {p.kind === "coaching" ? <option value="escalated">Not met: move to an Improvement Plan</option> : <option value="hr_review">Not met: ask HR to step in</option>}
                        </select>
                      </Field>
                      <Field label="New review date (for an extension or a new plan)"><input type="date" name="due" className={input} /></Field>
                      <Field label="What you saw"><textarea name="note" rows={3} required className={input} placeholder="Two of three goals met; time-boxing now consistent across sessions." /></Field>
                      <p className="text-[12px] text-ink-500">The educator sees the outcome and your note. An Improvement Plan carries over the goals not yet met.</p>
                      <Submit size="sm" icon="check">Record the review</Submit>
                    </ActionForm>
                  </Disclosure>
                </div>
              ))}
            </Card>
          )}
          {canSeeScores && <Trend d={d} />}
          {canSeeScores && <Review360 d={d} self={false} />}
          <Surveys d={d} />
          <Profile d={d} />
          <WriteBack d={d} showLastQa={has(me, "segment_owner", "hr", "education_principal", "system_owner")} />
          {(isOwner || has(me, "operations")) && liveCohort && (
            <Card>
              <CardTitle icon="pen" sub="For what the system cannot see. Feeds accountability (coordinator entries).">Accountability entry</CardTitle>
              {d.acc.length > 0 && <ul className="mb-3 space-y-1 text-[13px]">{d.acc.map((a) => <li key={a.id} className="flex justify-between"><span>{a.label}</span><span className="tabular-nums">{a.score}</span></li>)}</ul>}
              <Disclosure label="Add entry">
                <ActionForm action={accountabilityAdd} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="person" value={id} />
                  <input type="hidden" name="cohort" value={liveCohort.id} />
                  <Field label="What happened"><input name="label" required className={input} placeholder="e.g. Covered a session at short notice" /></Field>
                  <Field label="Score (0–100)"><input name="score" type="number" min={0} max={100} required className={input} /></Field>
                  <Submit size="sm">Add</Submit>
                </ActionForm>
              </Disclosure>
            </Card>
          )}
        </div>
      </div>
      <History d={d} />
      <JDChecklist d={d} canConfirm={canConfirm} />
    </div>
  );
}
