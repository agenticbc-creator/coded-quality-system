import Link from "next/link";
import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, Notice, PageHeader, Stat, cx } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { classroomReady, remind } from "@/app/actions";
import { fmtDateTime, fmtTime, visitLabel } from "@/lib/format";

export const metadata = { title: "Today" };

export default async function Ops() {
  const me = await getMe();
  const supabase = await db();
  const { data: roles } = await supabase.from("cohort_roles").select("cohort:cohorts(id, name, status, classrooms(id, name, room, ready, classroom_staff(role, person:people(id, full_name))))").eq("person_id", me.id).eq("role", "overseer");
  const cohorts = ((roles ?? []) as any[]).map((r) => r.cohort).filter((c) => c && c.status !== "closed");
  const classrooms = cohorts.flatMap((c) => c.classrooms.map((cl: any) => ({ ...cl, cohort: c })));
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 864e5);
  const [{ data: today }, { data: visits }, signals] = await Promise.all([
    supabase.from("app_sessions").select("*").in("classroom_id", classrooms.map((c) => c.id)).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    supabase.from("visits").select("*, classroom:classrooms(name), cohort:cohorts(name)").in("cohort_id", cohorts.map((c) => c.id)).neq("status", "completed").neq("status", "cancelled").order("scheduled_for"),
    Promise.all(classrooms.map(async (cl) => ({ cl, data: (await supabase.rpc("live_signals", { p_classroom: cl.id })).data as any }))),
  ]);
  const gaps = signals.filter((s) => s.data && ((s.data.late_attendance?.length ?? 0) > 0 || s.data.ungraded_backlog > 0));
  const mine = (visits ?? []).filter((v: any) => v.assignee_id === me.id);
  const toBook = (visits ?? []).filter((v: any) => !v.assignee_id && (v.kind === "shadowing" || v.qa_type === "operations"));

  return (
    <div>
      <PageHeader eyebrow="Operations · overseer of every classroom" title="Today"
        sub="Readiness, record gaps and visits across the classrooms you oversee. You see when a record is missing — never educator scores or education QA results." />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Classes today" value={(today ?? []).length} icon="sun" />
        <Stat label="Classrooms with record gaps" value={gaps.length} tone={gaps.length ? "red" : "green"} icon="alert" />
        <Stat label="Your visits" value={mine.length} icon="clipboard" />
        <Stat label="Visits to book" value={toBook.length} tone={toBook.length ? "amber" : undefined} icon="plus" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle icon="sun" sub="From the CODED App roster and calendar">Today&apos;s classes</CardTitle>
            {classrooms.length === 0 ? <Empty title="You are not overseeing any live cohort" /> : (
              <ul className="divide-y divide-line/70">
                {classrooms.map((cl) => {
                  const s = (today ?? []).filter((x: any) => x.classroom_id === cl.id);
                  const instr = cl.classroom_staff.find((x: any) => x.role === "instructor")?.person.full_name;
                  return (
                    <li key={cl.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <div className="text-[14.5px] font-semibold text-navy">{cl.cohort.name} · {cl.name}</div>
                        <div className="text-[13px] text-ink-500">{cl.room ?? "Room not set"} · {instr ?? "no instructor"} · {s.length ? s.map((x: any) => `${fmtTime(x.starts_at)} ${x.topic}`).join(", ") : "no session today"}</div>
                      </div>
                      <ActionForm action={classroomReady} className="contents">
                        <input type="hidden" name="cohort" value={cl.cohort.id} /><input type="hidden" name="classroom" value={cl.id} /><input type="hidden" name="ready" value={cl.ready ? "false" : "true"} />
                        <Submit size="sm" variant={cl.ready ? "ghost" : "secondary"} icon={cl.ready ? "check" : "alert"}>{cl.ready ? "Room ready" : "Confirm room ready"}</Submit>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle icon="alert" sub="Attendance must be logged within 24 hours and submissions graded within 72 hours (CCTP 24/72 protocol). Send a reminder; escalation to the Senior Instructor is automatic.">Record gaps</CardTitle>
            {gaps.length === 0 ? <Empty title="No record gaps" icon="check" /> : (
              <div className="space-y-4">
                {gaps.map(({ cl, data }) => {
                  const instr = cl.classroom_staff.find((x: any) => x.role === "instructor")?.person;
                  return (
                    <div key={cl.id} className="rounded-xl border border-[#F6C9C6] bg-tier4-bg/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[14.5px] font-semibold text-navy">{cl.cohort.name} · {cl.name}</div>
                        {instr && (
                          <ActionForm action={remind}>
                            <input type="hidden" name="person" value={instr.id} />
                            <input type="hidden" name="title" value="Reminder: CODED App records" />
                            <input type="hidden" name="body" value={`${cl.name}: ${data.late_attendance?.length ?? 0} session${(data.late_attendance?.length ?? 0) === 1 ? "" : "s"} without attendance, ${data.ungraded_backlog} {data.ungraded_backlog === 1 ? "submission" : "submissions"} ungraded over 72h.`} />
                            <Submit size="sm" icon="bell">Remind {instr.full_name.split(" ")[0]}</Submit>
                          </ActionForm>
                        )}
                      </div>
                      <ul className="mt-2 space-y-1 text-[13.5px]">
                        {data.late_attendance?.map((l: any) => <li key={l.session} className="flex items-center gap-2"><Icon name="clock" className="h-3.5 w-3.5 text-tier4" /> Attendance not logged · {fmtDateTime(l.starts_at)} · {l.hours_late}h</li>)}
                        {data.ungraded_backlog > 0 && <li className="flex items-center gap-2"><Icon name="doc" className="h-3.5 w-3.5 text-tier4" /> {data.ungraded_backlog} {data.ungraded_backlog === 1 ? "submission" : "submissions"} ungraded over 72h</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle icon="clipboard" sub="Shadowing and operations QA visits assigned to you">Your visits</CardTitle>
            {mine.length === 0 ? <Empty title="No visits assigned" /> : mine.map((v: any) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="mb-2 flex items-center justify-between rounded-lg border border-line p-3 text-[13.5px] hover:bg-canvas">
                <span><b className="text-navy">{visitLabel(v)}</b> · {v.classroom?.name}<span className="block text-[12.5px] text-ink-500">{fmtDateTime(v.scheduled_for)}</span></span>
                <Badge tone={v.status === "accepted" ? "green" : "brand"}>{v.status === "invited" ? "Respond" : v.status}</Badge>
              </Link>
            ))}
          </Card>
          <Card>
            <CardTitle icon="plus" sub="Shadowing and operations QA slots without an observer">Visits to book</CardTitle>
            {toBook.length === 0 ? <Empty title="Nothing to book" icon="check" /> : toBook.map((v: any) => (
              <Link key={v.id} href={`/visits/new?visit=${v.id}`} className={cx("mb-2 flex items-center justify-between rounded-lg border border-dashed border-[#F5DDAF] bg-tier3-bg/50 p-3 text-[13.5px]")}>
                <span>{visitLabel(v)} · {v.classroom?.name}<span className="block text-[12.5px] text-ink-500">{fmtDateTime(v.scheduled_for)}</span></span>
                <span className="font-medium text-brand">Book →</span>
              </Link>
            ))}
          </Card>
          <Notice tone="brand" title="Operations never scores teaching">You run operations QA when assigned and shadowing visits. Education QA results stay with Education and the segment owner.</Notice>
        </div>
      </div>
    </div>
  );
}
