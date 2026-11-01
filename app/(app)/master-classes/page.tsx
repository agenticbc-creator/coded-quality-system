import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Empty, Field, Notice, PageHeader, TierBadge, input } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { masterClassSchedule } from "@/app/actions";
import { fmtDateTime, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Master classes" };

export default async function MasterClasses() {
  const me = await getMe();
  const supabase = await db();
  const canSchedule = has(me, "segment_owner", "education_principal");
  const [{ data: mcs }, { data: cohorts }, { data: comps }, { data: evaluators }] = await Promise.all([
    supabase.from("master_classes").select("*, instructor:people!master_classes_instructor_id_fkey(id, full_name, cctp_cert), cohort:cohorts(id, name), classroom:classrooms(name), visit:visits(id, status, submitted_at, assignee:people!visits_assignee_id_fkey(full_name))").order("scheduled_for", { ascending: false }),
    canSchedule ? supabase.from("cohorts").select("id, name, status, classrooms(id, name)").in("status", ["live", "setup"]) : Promise.resolve({ data: [] }),
    supabase.from("composites").select("person_id, period, tier, total, provisional, person:people!composites_person_id_fkey(id, full_name, roles, cctp_cert)").order("period", { ascending: false }),
    canSchedule ? supabase.from("people").select("id, full_name, roles, is_full_timer").or("roles.cs.{education_officer},roles.cs.{senior_instructor}") : Promise.resolve({ data: [] }),
  ]);
  const latest = new Map<string, any>();
  for (const c of (comps ?? []) as any[]) if (!latest.has(c.person_id) && c.person?.roles?.includes("instructor")) latest.set(c.person_id, c);
  const instructors = [...latest.values()].sort((a, b) => Number(b.total) - Number(a.total));
  const tier1 = instructors.filter((c) => c.tier === 1);
  const list = (mcs ?? []) as any[];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="C5 · D7 · special sessions" title="Master classes and challenges"
        sub="Master classes go to Tier 1 instructors only. Every session is evaluated with the master-class template, so it feeds the composite like any other QA visit."
        actions={canSchedule ? (
          <Disclosure label="Schedule a session" variant="primary">
            <Card className="w-[min(92vw,560px)]">
              <ActionForm action={masterClassSchedule} className="space-y-3">
                <Field label="Title"><input name="title" required className={input} placeholder="e.g. Debugging like a senior engineer" /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Type"><select name="kind" className={input}><option value="master_class">Master class (Tier 1 only)</option><option value="challenge">Challenge session</option></select></Field>
                  <Field label="When (Kuwait time)"><input type="datetime-local" name="when" required className={input} /></Field>
                </div>
                <Field label="Cohort and classroom">
                  <select name="classroom" required className={input}>
                    {((cohorts ?? []) as any[]).flatMap((c) => c.classrooms.map((cl: any) => <option key={cl.id} value={cl.id}>{c.name} · {cl.name}</option>))}
                  </select>
                </Field>
                <Field label="Instructor" hint="Only Tier 1 instructors can lead a master class.">
                  <select name="instructor" required className={input}>
                    {instructors.map((c) => <option key={c.person_id} value={c.person_id}>{c.person.full_name} · Tier {c.tier ?? "—"}{c.tier === 1 ? " ✓" : ""}</option>)}
                  </select>
                </Field>
                <Field label="Evaluator"><select name="assignee" required className={input}>{((evaluators ?? []) as any[]).filter((e) => e.is_full_timer).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
                <Submit icon="calendar">Schedule and invite</Submit>
              </ActionForm>
            </Card>
          </Disclosure>
        ) : undefined} />

      <Card>
        <CardTitle icon="star" sub="Based on the latest quarter's composite.">Eligible to lead a master class</CardTitle>
        {tier1.length === 0 ? <Empty title="No Tier 1 instructors this quarter" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tier1.map((c) => (
              <Link key={c.person_id} href={`/people/${c.person_id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-navy">
                <Avatar name={c.person.full_name} size={38} tone="navy" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-navy">{c.person.full_name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5"><TierBadge tier={c.tier} provisional={c.provisional} />{c.person.cctp_cert && <Badge tone="green">{c.person.cctp_cert}</Badge>}</div>
                </div>
                <span className="text-[20px] font-bold tabular-nums text-tier1">{Number(c.total).toFixed(0)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle icon="calendar">Sessions</CardTitle>
        {list.length === 0 ? <Empty title="No master classes scheduled" /> : (
          <div className="space-y-3">
            {list.map((m) => (
              <div key={m.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid w-14 shrink-0 place-items-center border-2 border-navy py-1.5 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-brand">{new Date(m.scheduled_for).toLocaleString("en-GB", { month: "short", timeZone: "Asia/Kuwait" })}</div>
                    <div className="text-[20px] font-extrabold leading-none text-navy">{new Date(m.scheduled_for).toLocaleString("en-GB", { day: "numeric", timeZone: "Asia/Kuwait" })}</div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold text-navy">{m.title}</span><Badge tone={m.kind === "master_class" ? "navy" : "brand"}>{m.kind === "master_class" ? "Master class" : "Challenge"}</Badge></div>
                    <div className="mt-1 text-[13px] text-ink-500">{m.instructor.full_name} · {m.cohort.name}{m.classroom ? ` · ${m.classroom.name}` : ""} · {fmtDateTime(m.scheduled_for)}</div>
                    {m.visit && <div className="mt-1 text-[12.5px] text-ink-500"><Icon name="clipboard" className="inline h-3.5 w-3.5" /> Evaluated by {m.visit.assignee?.full_name} · {STATUS_LABEL[m.visit.status] ?? m.visit.status}</div>}
                  </div>
                </div>
                {m.visit && (has(me, "segment_owner", "education_principal", "senior_instructor", "education_officer")) && (
                  <Link href={`/visits/${m.visit.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">Open visit <Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {!canSchedule && <Notice>Master classes are scheduled by the segment owner or the Education Principal.</Notice>}
    </div>
  );
}
