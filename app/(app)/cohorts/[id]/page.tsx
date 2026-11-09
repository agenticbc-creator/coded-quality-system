import Link from "next/link";
import { notFound } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Field, KV, LinkButton, Notice, PageHeader, cx, input } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { SignalGrid } from "@/components/performance";
import { signalLevels } from "@/lib/person";
import { classroomAdd, classroomAssign, classroomReady, classroomUnassign, cohortAttachContent, cohortBackup, cohortApprove, cohortClose, cohortGoLive, cohortRole, cohortScore, qaPlanGenerate, schemaVersion } from "@/app/actions";
import { SEGMENT, currentPeriod, fmtDate, fmtDateTime, fmtDay, periodLabel } from "@/lib/format";

export default async function CohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const supabase = await db();
  const [{ data: c }, { data: people }, { data: content }, { data: visits }, { data: contracts }, readiness, v, lv] = await Promise.all([
    supabase.from("cohorts").select("*, program:programs(*), content:content_items(id, title, approved_version), backup:people!cohorts_backup_instructor_id_fkey(full_name), classrooms(*, classroom_staff(role, is_lead, person:people(id, full_name, approval_status))), cohort_roles(role, person:people(id, full_name, roles))").eq("id", id).maybeSingle(),
    supabase.from("people").select("id, full_name, roles, approval_status, erp_supplier_id, erp_contractor_status").order("full_name"),
    supabase.from("content_items").select("id, title, approved_version, program_id").not("approved_version", "is", null),
    supabase.from("visits").select("*, assignee:people!visits_assignee_id_fkey(full_name), focus_person:people!visits_focus_person_id_fkey(full_name)").eq("cohort_id", id).order("scheduled_for"),
    supabase.from("erp_contracts").select("person_id, status"),
    supabase.rpc("cohort_readiness", { p_cohort: id }),
    schemaVersion(),
    signalLevels(),
  ]);
  if (!c) notFound();
  const owner = me.roles.includes("segment_owner") && me.owned_segments.includes(c.program.segment_id);
  const ops = has(me, "operations");
  const canStaff = owner || ops;
  const r = readiness.data as { ok: boolean; blockers: string[]; warnings: string[] };
  const classrooms = (c.classrooms ?? []).sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
  const cleared = (people ?? []).filter((p: any) => p.approval_status === "cleared" && !["Inactive", "Blacklisted", "Duplicate"].includes(p.erp_contractor_status));
  const active = new Set((contracts ?? []).filter((k: any) => k.status === "Active").map((k: any) => k.person_id));
  const overseers = c.cohort_roles.filter((x: any) => x.role === "overseer");
  const seniors = c.cohort_roles.filter((x: any) => x.role === "senior_instructor");
  // Imported history has no week number: place it by date (week 0 = before Day 1).
  const weekOf = (v: any): number => {
    if (v.week_no) return v.week_no;
    const at = v.scheduled_for ?? v.submitted_at;
    if (!at) return 1;
    return Math.max(0, Math.floor((new Date(at).getTime() - new Date(`${c?.start_date}T00:00:00+03:00`).getTime()) / (7 * 864e5)) + 1);
  };
  // A visit with no classroom (or one no longer in the cohort) gets its own column instead of being shown under another class.
  const planCols: { id: string | null; name: string }[] = [...(c?.classrooms ?? []).slice().sort((a: any, b: any) => (a.name > b.name ? 1 : -1)).map((cl: any) => ({ id: cl.id, name: cl.name }))];
  if ((visits ?? []).some((v: any) => !planCols.some((col) => col.id === v.classroom_id))) planCols.push({ id: null, name: "No classroom" });
  const weeks = Array.from(new Set((visits ?? []).map(weekOf))).sort((a: any, b: any) => a - b) as number[];
  const signals = c.status === "live" ? await Promise.all(classrooms.map(async (cl: any) => ({ cl, data: (await supabase.rpc("live_signals", { p_classroom: cl.id })).data }))) : [];
  const hid = <input type="hidden" name="cohort" value={id} />;
  const nameOf = (pid: string | null) => (people ?? []).find((p: any) => p.id === pid)?.full_name ?? "";
  const scorer = owner || has(me, "education_principal");
  const period = currentPeriod();
  const signOffs = [
    { what: "staffing", label: "Staffing", sub: "Every classroom's instructors and TAs", at: c.staffing_approved_at, by: c.staffing_approved_by },
    { what: "qa_plan", label: "QA plan", sub: "Education, operations and shadowing visits, by week", at: c.qa_plan_approved_at, by: c.qa_plan_approved_by },
  ];

  return (
    <div>
      <PageHeader back={{ href: "/cohorts", label: "Cohorts" }} eyebrow={`${c.program.name} · ${SEGMENT[c.program.segment_id]} · ${c.program.program_type}`} title={c.name}
        sub={`${fmtDate(c.start_date)} – ${fmtDate(c.end_date)} · ${classrooms.length} ${classrooms.length === 1 ? "classroom" : "classrooms"} on the same content`}
        actions={<>
          <Badge tone={c.status === "live" ? "green" : c.status === "setup" ? "amber" : "neutral"}>{c.status === "setup" ? "In setup" : c.status}</Badge>
          {owner && c.status !== "closed" && <LinkButton href={`/visits/new?cohort=${id}`} variant="secondary" icon="plus">Schedule a visit</LinkButton>}
        </>} />

      {c.status === "setup" && (
        <Card className={cx("mb-6", r.ok ? "border-[#BFE5D5]" : "border-[#F5DDAF]")}>
          <CardTitle icon={r.ok ? "check" : "lock"} sub="The cohort starts only when content is approved, every classroom is staffed and cleared, and an overseer is named.">Go-live gate</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.blockers.map((b) => <div key={b} className="flex items-start gap-2 rounded-lg bg-tier4-bg px-3 py-2 text-[13.5px] text-[#7A1F1A]"><Icon name="x" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{b}</div>)}
            {r.warnings.map((w) => <div key={w} className="flex items-start gap-2 rounded-lg bg-tier3-bg px-3 py-2 text-[13.5px] text-[#6B4300]"><Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</div>)}
            {r.ok && !r.warnings.length && <div className="flex items-center gap-2 rounded-lg bg-tier1-bg px-3 py-2 text-[13.5px] text-[#0A5A3E]"><Icon name="check" className="h-3.5 w-3.5" />Everything is in place.</div>}
          </div>
          {v >= 10 && (
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              {signOffs.map((s) => (
                <div key={s.what} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
                  <div>
                    <div className="text-[14px] font-bold text-ink">{s.label} sign-off</div>
                    <div className="text-[12.5px] text-ink-600">{s.at ? `Approved by ${nameOf(s.by) || "the segment owner"} · ${fmtDateTime(s.at)}` : s.sub}</div>
                  </div>
                  {s.at ? <Badge tone="green">Approved</Badge> : owner ? (
                    <ActionForm action={cohortApprove}>{hid}<input type="hidden" name="what" value={s.what} /><Submit size="sm" variant="secondary" icon="check">Approve</Submit></ActionForm>
                  ) : <Badge tone="amber">Waiting for the segment owner</Badge>}
                </div>
              ))}
              <p className="text-[12.5px] text-ink-600 sm:col-span-2">A change to the team or the QA plan before Day 1 asks for the sign-off again.
                {(owner || has(me, "education_coordinator")) && <> <Link href={`/visits/new?cohort=${id}&focus=alignment`} className="font-semibold text-brand">Book the alignment visit</Link> before Day 1.</>}
              </p>
            </div>
          )}
          {owner && <ActionForm action={cohortGoLive} className="mt-4">{hid}<Submit icon="arrow" variant={r.ok ? "primary" : "secondary"}>Start the cohort</Submit></ActionForm>}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {classrooms.map((cl: any) => (
              <Card key={cl.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div><div className="text-[15px] font-semibold text-navy">{cl.name}</div><div className="text-[12.5px] text-ink-500">{cl.room ?? "Room not set"}</div></div>
                  <Badge tone={cl.ready ? "green" : "amber"}>{cl.ready ? "Ready" : "Not confirmed ready"}</Badge>
                </div>
                <ul className="space-y-1.5">
                  {cl.classroom_staff.sort((a: any, b: any) => (a.role > b.role ? 1 : -1)).map((s: any) => (
                    <li key={s.person.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                      <Link href={`/people/${s.person.id}`} className="flex items-center gap-2 hover:text-brand"><Avatar name={s.person.full_name} size={24} />{s.person.full_name}</Link>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={s.role === "instructor" ? "brand" : "neutral"}>{s.role === "ta" ? "TA" : s.is_lead ? "Lead instructor" : "Instructor"}</Badge>
                        {canStaff && c.status !== "closed" && (
                          <ActionForm action={classroomUnassign} className="contents">{hid}<input type="hidden" name="classroom" value={cl.id} /><input type="hidden" name="person" value={s.person.id} />
                            <button className="text-ink-400 hover:text-tier4" title="Remove"><Icon name="x" className="h-3.5 w-3.5" /></button>
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                  {cl.classroom_staff.length === 0 && <li className="text-[13.5px] text-tier4">No one assigned yet</li>}
                </ul>
                {canStaff && c.status !== "closed" && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                    <Disclosure label="Assign">
                      <ActionForm action={classroomAssign} className="space-y-2">
                        {hid}<input type="hidden" name="classroom" value={cl.id} />
                        <select name="person" className={input} required>
                          {cleared.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}{(contracts ?? []).length && !active.has(p.id) ? " — no Active contract" : ""}</option>)}
                        </select>
                        <div className="flex items-center gap-3">
                          <select name="role" className={cx(input, "w-auto")}><option value="instructor">Instructor</option><option value="ta">TA</option></select>
                          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="lead" /> Lead</label>
                        </div>
                        <p className="text-[12px] text-ink-500">Only people cleared to teach are listed. Not there? Open their record and clear them first.</p>
                        <Submit size="sm">Assign</Submit>
                      </ActionForm>
                    </Disclosure>
                    <ActionForm action={classroomReady} className="contents">{hid}<input type="hidden" name="classroom" value={cl.id} /><input type="hidden" name="ready" value={cl.ready ? "false" : "true"} />
                      <Submit size="sm" variant="ghost" icon={cl.ready ? "x" : "check"}>{cl.ready ? "Mark not ready" : "Confirm ready"}</Submit>
                    </ActionForm>
                  </div>
                )}
              </Card>
            ))}
            {canStaff && c.status !== "closed" && (
              <Card className="grid place-items-center border-dashed">
                <ActionForm action={classroomAdd} className="w-full space-y-2">{hid}
                  <input name="name" required placeholder={`Classroom ${String.fromCharCode(65 + classrooms.length)}`} className={input} />
                  <input name="room" placeholder="Room" className={input} />
                  <Submit size="sm" variant="secondary" icon="plus">Add classroom</Submit>
                </ActionForm>
              </Card>
            )}
          </div>

          <Card>
            <CardTitle icon="clipboard" sub={c.qa_plan ? `Generated from the ${c.program.program_type} default · education QA weeks ${c.qa_plan.education_weeks?.join(", ")} · operations QA weeks ${c.qa_plan.operations_weeks?.join(", ")}` : "Default plan from the program type, created ahead on the program checklist, then edited if needed"}
              right={(owner || (ops && overseers.some((o: any) => o.person.id === me.id))) && c.status !== "closed" ? (
                v >= 14
                  ? <ActionForm action={qaPlanGenerate}>{hid}<Submit size="sm" variant="secondary" icon="refresh">{c.qa_plan ? "Regenerate" : "Generate QA plan"}</Submit></ActionForm>
                  : <span className="text-[12.5px] text-tier3">Generating waits for database migration 0014</span>
              ) : undefined}>
              QA plan
            </CardTitle>
            {(visits ?? []).length === 0 ? (c.status === "closed" ? <p className="text-[13.5px] text-ink-500">No visits were recorded for this cohort.</p> : <Notice tone="amber">No QA plan yet. A program cannot go live without at least one QA visit.</Notice>) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-500"><th className="py-2 pr-3 font-semibold">Week</th>{planCols.map((cl) => <th key={cl.id ?? "none"} className="py-2 pr-3 font-semibold">{cl.name}</th>)}</tr></thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w} className="border-t border-line/70 align-top">
                        <td className="py-2 pr-3 tabular-nums text-ink-500">{w === 0 ? "Before Day 1" : `W${w}`}</td>
                        {planCols.map((cl) => (
                          <td key={cl.id ?? "none"} className="py-2 pr-3">
                            <div className="flex flex-col gap-1">
                              {(visits ?? []).filter((v: any) => weekOf(v) === w && (cl.id ? v.classroom_id === cl.id : !planCols.some((x) => x.id && x.id === v.classroom_id))).map((v: any) => (
                                <Link key={v.id} href={`/visits/${v.id}`} className={cx("rounded-md px-2 py-1 ring-1 ring-inset hover:brightness-95",
                                  v.status === "completed" ? "bg-tier1-bg text-tier1 ring-[#BFE5D5]" : v.status === "cancelled" ? "bg-canvas text-ink-400 line-through ring-line" : !v.assignee_id ? "bg-tier3-bg text-tier3 ring-[#F5DDAF]" : "bg-brand-50 text-brand ring-brand-100")}>
                                  <span className="font-medium">{v.kind === "shadowing" ? "Shadow" : v.qa_type === "education" ? "Edu QA" : "Ops QA"}{v.kind === "shadowing" && v.focus_person ? ` ${v.focus_person.full_name.split(" ")[0]}` : ""}{v.mode !== "planned" ? ` · ${v.mode}` : ""}</span>
                                  <span className="block text-[11px] opacity-80">{v.assignee?.full_name?.split(" ")[0] ?? (v.submitted_at ? "from Notion" : "needs observer")} · {fmtDay(v.scheduled_for)}</span>
                                </Link>
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {signals.length > 0 && (
            <Card>
              <CardTitle icon="sun" sub="CODED App, per classroom">Live signals</CardTitle>
              <div className="space-y-5">{signals.map(({ cl, data }) => <SignalGrid key={cl.id} title={cl.name} data={data} levels={lv.levels} draft={lv.draft} />)}</div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle icon="lock" sub="Nothing unapproved is taught. The approved version is locked to the cohort.">Content</CardTitle>
            {c.content ? (
              <>
                <KV k="Content" v={<Link href={`/approvals/content/${c.content.id}`} className="text-brand">{c.content.title}</Link>} />
                <KV k="Locked version" v={<span className="flex items-center gap-1"><Icon name="lock" className="h-3.5 w-3.5" /> v{c.content_version}</span>} />
              </>
            ) : <Notice tone="amber">No approved content locked to this cohort.</Notice>}
            {owner && c.status === "setup" && (
              <ActionForm action={cohortAttachContent} className="mt-3 space-y-2">{hid}
                <select name="content" className={input}>{(content ?? []).filter((x: any) => x.program_id === c.program_id).map((x: any) => <option key={x.id} value={x.id}>{x.title} · v{x.approved_version}</option>)}</select>
                <Submit size="sm" variant="secondary">Lock approved content</Submit>
              </ActionForm>
            )}
          </Card>
          <Card>
            <CardTitle icon="eye" sub="At least one operations officer or program lead oversees every classroom">Oversight</CardTitle>
            <KV k="Overseer" v={overseers.length ? overseers.map((o: any) => o.person.full_name).join(", ") : <span className="text-tier4">Not named</span>} />
            <KV k="Senior Instructor" v={seniors.map((o: any) => o.person.full_name).join(", ") || "—"} />
            <KV k="Backup instructor" v={c.backup?.full_name ?? <span className="text-tier3">Not recorded</span>} />
            {owner && c.status !== "closed" && (
              <div className="mt-3 space-y-2">
                <ActionForm action={cohortRole} className="flex gap-2">{hid}<input type="hidden" name="role" value="overseer" />
                  <select name="person" className={input}>{(people ?? []).filter((p: any) => p.roles.includes("operations") || p.roles.includes("instructor")).map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
                  <Submit size="sm" variant="secondary">Add overseer</Submit>
                </ActionForm>
                <ActionForm action={cohortRole} className="flex gap-2">{hid}<input type="hidden" name="role" value="senior_instructor" />
                  <select name="person" className={input}>{(people ?? []).filter((p: any) => p.roles.includes("senior_instructor")).map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
                  <Submit size="sm" variant="secondary">Assign senior</Submit>
                </ActionForm>
                <ActionForm action={cohortBackup} className="flex gap-2">{hid}
                  <select name="person" className={input}>{cleared.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
                  <Submit size="sm" variant="secondary">Set backup</Submit>
                </ActionForm>
              </div>
            )}
          </Card>
          {owner && c.status === "live" && (
            <Card>
              <CardTitle icon="doc" sub="Closing opens 360° reviews for 14 days. Scores are recomputed at quarter close.">Close the cohort</CardTitle>
              <ActionForm action={cohortClose} className="space-y-2">{hid}
                <Field label="Final report"><textarea name="report" rows={3} className={input} /></Field>
                <Submit size="sm" variant="secondary">Close and open 360° reviews</Submit>
              </ActionForm>
            </Card>
          )}
          {scorer && v >= 10 && c.status !== "setup" && (
            <Card>
              <CardTitle icon="chart" sub="Recomputes the composite for everyone teaching on this cohort, from released visits only">Score this cohort</CardTitle>
              <ActionForm action={cohortScore} className="flex flex-wrap items-end gap-2">{hid}
                <Field label="Quarter"><select name="period" defaultValue={period} className={cx(input, "w-auto")}>
                  {[0, 1].map((k) => { const [y, q] = period.split("-Q").map(Number); const qq = q - k > 0 ? q - k : 4; const yy = q - k > 0 ? y : y - 1; const pv = `${yy}-Q${qq}`; return <option key={pv} value={pv}>{periodLabel(pv)}</option>; })}
                </select></Field>
                <Submit size="sm" variant="secondary" icon="refresh">Score the team</Submit>
              </ActionForm>
            </Card>
          )}
          {c.final_report && <Card><CardTitle icon="doc">Final report</CardTitle><p className="text-[13.5px]">{c.final_report}</p></Card>}
        </div>
      </div>
    </div>
  );
}

