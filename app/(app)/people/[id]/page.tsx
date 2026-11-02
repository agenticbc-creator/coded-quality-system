import { notFound, redirect } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { loadPerson } from "@/lib/person";
import { db } from "@/lib/supabase";
import { Breakdown, FeedbackList, Hero, History, JDChecklist, Plans, Profile, Review360, Signals, Surveys, Trend, WriteBack } from "@/components/performance";
import { Badge, Card, CardTitle, Empty, Field, PageHeader, Table, input, td } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { accountabilityAdd, planSave } from "@/app/actions";
import { LinkButton } from "@/components/ui";
import { fmtDate, num, visitLabel } from "@/lib/format";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (id === me.id) redirect("/me");
  const d = await loadPerson(id);
  if (!d.person) notFound();
  const supabase = await db();
  const [{ data: notes }, { data: scores }] = await Promise.all([
    supabase.from("feedback").select("*, author:people!feedback_author_id_fkey(full_name), cohort:cohorts(name)").eq("subject_id", id).order("created_at", { ascending: false }),
    supabase.from("visit_scores").select("*, visit:visits(kind, qa_type, mode, week_no, submitted_at, release_status, cohort:cohorts(name))").eq("subject_person_id", id),
  ]);
  const canSeeScores = Boolean(d.current) || d.composites.length > 0;
  const isOwner = has(me, "segment_owner");
  const canConfirm = isOwner || has(me, "senior_instructor", "education_principal", "lead_instructor");
  const liveCohort = d.classrooms.find((c) => c.classroom.cohort.status === "live")?.classroom.cohort;

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/people", label: "People" }} eyebrow="Performance record" title={d.person.full_name}
        sub="Everything below is filtered by your role. Private notes stay with the segment owner and the Education Principal."
        actions={canSeeScores ? <LinkButton href={`/report-card?person=${id}`} variant="secondary" icon="printer">Report card</LinkButton> : undefined} />
      {canSeeScores ? <Hero d={d} self={false} /> : (
        <Card><Empty icon="lock" title="Scores are not visible to your role" sub="Evaluations stay with the segment, Operations and HR on specific elements (decided 25 Oct 2026)." /></Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {canSeeScores && <Breakdown d={d} />}
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
                {notes!.map((f: any) => (
                  <li key={f.id} className="rounded-lg border border-line p-3 text-[13.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={f.severity === "red_flag" ? "red" : f.type === "praise" ? "green" : f.type === "concern" ? "amber" : "neutral"}>{f.severity === "red_flag" ? `Red flag · ${f.red_flag_reason}` : f.type}</Badge>
                      <Badge>{f.status.replace("_", " ")}</Badge>
                      <span className="text-[12.5px] text-ink-500">{f.author?.full_name} · {fmtDate(f.created_at)} · {f.cohort?.name}</span>
                    </div>
                    <p className="mt-1.5 text-ink">{f.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <FeedbackList d={d} self={false} />
        </div>
        <div className="space-y-6">
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
                    {p && <Submit size="sm" variant="secondary" name="status" value="closed">Close plan</Submit>}
                  </div>
                </ActionForm>
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
