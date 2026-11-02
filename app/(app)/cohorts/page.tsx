import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, Field, PageHeader, input } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { cohortCreate } from "@/app/actions";
import { SEGMENT, fmtDate } from "@/lib/format";

export const metadata = { title: "Cohorts" };

export default async function Cohorts() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: cohorts }, { data: programs }] = await Promise.all([
    supabase.from("cohorts").select("*, program:programs(name, segment_id, program_type), classrooms(id, classroom_staff(role)), cohort_roles(role, person:people(full_name)), content:content_items(title)").order("start_date", { ascending: false }),
    supabase.from("programs").select("*").order("name"),
  ]);
  const canCreate = has(me, "segment_owner", "operations");
  const groups: [string, string][] = [["live", "Live"], ["setup", "In setup"], ["closed", "Closed"]];
  return (
    <div>
      <PageHeader eyebrow="Setting up a cohort" title="Cohorts"
        sub="A cohort can run several classrooms on the same content, each with its own instructor and TAs, and at least one overseer for all of them."
        actions={canCreate ? (
          <Disclosure label="New cohort" variant="primary">
            <Card className="w-[min(92vw,520px)]">
              <ActionForm action={cohortCreate} className="space-y-3">
                <Field label="Program"><select name="program" required className={input}>{(programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {SEGMENT[p.segment_id]} · {p.program_type}</option>)}</select></Field>
                <Field label="Name"><input name="name" required className={input} placeholder="e.g. Full Stack — Cohort 4 (Jan 2027)" /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Starts"><input type="date" name="start" required className={input} /></Field>
                  <Field label="Ends"><input type="date" name="end" required className={input} /></Field>
                  <Field label="Classrooms"><input type="number" name="classrooms" min={1} max={8} defaultValue={1} className={input} /></Field>
                </div>
                <Submit>Create cohort</Submit>
              </ActionForm>
            </Card>
          </Disclosure>
        ) : undefined} />
      {groups.map(([st, label]) => {
        const list = (cohorts ?? []).filter((c: any) => c.status === st);
        if (!list.length) return null;
        return (
          <section key={st} className="mb-8">
            <h2 className="mb-3 text-[13.5px] font-semibold uppercase tracking-wider text-ink-500">{label} · {list.length}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((c: any) => {
                const overseer = c.cohort_roles.find((r: any) => r.role === "overseer");
                const instructors = c.classrooms.reduce((a: number, cl: any) => a + cl.classroom_staff.filter((s: any) => s.role === "instructor").length, 0);
                return (
                  <Link key={c.id} href={`/cohorts/${c.id}`} className="rounded-xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[15px] font-semibold text-navy">{c.name}</div>
                        <div className="text-[13px] text-ink-500">{c.program.name} · {SEGMENT[c.program.segment_id]} · {fmtDate(c.start_date, { day: "numeric", month: "short" })} – {fmtDate(c.end_date)}</div>
                      </div>
                      <Badge tone={st === "live" ? "green" : st === "setup" ? "amber" : "neutral"}>{label}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-[12.5px]">
                      <span className="flex items-center gap-1.5 text-ink-600"><Icon name="layers" className="h-3.5 w-3.5" /> {c.classrooms.length} classroom{c.classrooms.length === 1 ? "" : "s"}</span>
                      <span className="flex items-center gap-1.5 text-ink-600"><Icon name="users" className="h-3.5 w-3.5" /> {instructors} instructor{instructors === 1 ? "" : "s"}</span>
                      <span className="flex items-center gap-1.5 text-ink-600"><Icon name={c.content ? "lock" : "alert"} className="h-3.5 w-3.5" /> {c.content ? `v${c.content_version} locked` : "No content"}</span>
                    </div>
                    <div className="mt-2 text-[12.5px] text-ink-500">Overseer: {overseer?.person.full_name ?? <span className="text-tier4">not named</span>}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
