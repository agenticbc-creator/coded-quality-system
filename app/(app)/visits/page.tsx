import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, cx, td } from "@/components/ui";
import { Icon } from "@/components/icons";
import { STATUS_LABEL, fmtDateTime, num, visitLabel } from "@/lib/format";

export const metadata = { title: "Visits" };

export default async function Visits() {
  const me = await getMe();
  const supabase = await db();
  const { data } = await supabase.from("visits")
    .select("*, cohort:cohorts(name), classroom:classrooms(name), assignee:people!visits_assignee_id_fkey(full_name), focus_person:people!visits_focus_person_id_fkey(full_name), scores:visit_scores(pct, subject_role)")
    .order("scheduled_for", { ascending: true });
  const all = (data ?? []) as any[];
  const mineOpen = all.filter((v) => v.assignee_id === me.id && !v.submitted_at && v.status !== "cancelled");
  const others = all.filter((v) => !(v.assignee_id === me.id && !v.submitted_at));
  const needs = others.filter((v) => v.status === "planned" && !v.assignee_id);
  const upcoming = others.filter((v) => ["invited", "accepted", "planned"].includes(v.status) && v.assignee_id && !v.submitted_at);
  const done = others.filter((v) => v.submitted_at).sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
  const canSchedule = has(me, "segment_owner", "education_principal", "senior_instructor", "operations", "education_coordinator");

  return (
    <div>
      <PageHeader eyebrow="Shadowing develops people · QA measures quality" title="Visits"
        sub="Planned visits come from each program's QA plan. Pop-up and pulse checks are logged separately. Education QA is never shown to the educator in advance."
        actions={canSchedule ? <LinkButton href="/visits/new" icon="plus">Schedule a visit</LinkButton> : undefined} />

      {mineOpen.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[13.5px] font-semibold uppercase tracking-wider text-brand">Assigned to you</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mineOpen.map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="group rounded-xl border border-brand-100 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-semibold text-navy">{visitLabel(v)}</div>
                    <div className="text-[13px] text-ink-500">{v.cohort?.name} · {v.classroom?.name}</div>
                  </div>
                  <Badge tone={v.status === "accepted" ? "green" : "brand"}>{v.status === "invited" ? "Invite — respond" : STATUS_LABEL[v.status]}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-[13.5px]">
                  <span className="flex items-center gap-1.5 text-ink-600"><Icon name="clock" className="h-4 w-4" /> {fmtDateTime(v.scheduled_for)}</span>
                  <span className="flex items-center gap-1 font-medium text-brand">Open instrument <Icon name="arrow" className="h-3.5 w-3.5" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {needs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[13.5px] font-semibold uppercase tracking-wider text-tier3">Needs an observer · {needs.length}</h2>
          <Card pad={false} className="px-5 pb-1 pt-3">
            <Table head={["Visit", "Cohort", "Focus", "When", ""]}>
              {needs.map((v) => (
                <tr key={v.id}><td className={td}><Link href={`/visits/${v.id}`} className="font-medium text-navy hover:text-brand">{visitLabel(v)}</Link>{v.week_no ? <span className="text-ink-500"> · week {v.week_no}</span> : ""}</td><td className={td}>{v.cohort?.name} · {v.classroom?.name}</td><td className={td}>{v.focus_person?.full_name ?? "Whole class"}</td><td className={td}>{fmtDateTime(v.scheduled_for)}</td>
                  <td className={cx(td, "text-right")}>{canSchedule && <Link href={`/visits/new?visit=${v.id}`} className="font-medium text-brand">Assign →</Link>}</td></tr>
              ))}
            </Table>
          </Card>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[13.5px] font-semibold uppercase tracking-wider text-ink-500">Upcoming · {upcoming.length}</h2>
        {upcoming.length === 0 ? <Empty title="No upcoming visits you can see" /> : (
          <Card pad={false} className="px-5 pb-1 pt-3">
            <Table head={["Visit", "Classroom", "Observer", "When", "Status"]}>
              {upcoming.map((v) => (
                <tr key={v.id}>
                  <td className={td}><Link href={`/visits/${v.id}`} className="font-medium text-navy hover:text-brand">{visitLabel(v)}</Link>{v.week_no ? <span className="text-ink-500"> · week {v.week_no}</span> : ""}</td>
                  <td className={td}>{v.cohort?.name} · {v.classroom?.name}</td><td className={td}>{v.assignee?.full_name}</td><td className={td}>{fmtDateTime(v.scheduled_for)}</td>
                  <td className={td}><Badge tone={v.status === "accepted" ? "green" : "neutral"}>{STATUS_LABEL[v.status]}</Badge></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[13.5px] font-semibold uppercase tracking-wider text-ink-500">Completed · {done.length}</h2>
        {done.length === 0 ? <Empty title="No completed visits you can see" /> : (
          <Card pad={false} className="px-5 pb-1 pt-3">
            <Table head={["Visit", "Classroom", "Observer", "Scores", "Release"]}>
              {done.map((v) => (
                <tr key={v.id}>
                  <td className={td}><Link href={`/visits/${v.id}`} className="font-medium text-navy hover:text-brand">{visitLabel(v)}</Link><div className="text-[12px] text-ink-500">{fmtDateTime(v.submitted_at)}</div></td>
                  <td className={td}>{v.cohort?.name} · {v.classroom?.name}</td><td className={td}>{v.assignee?.full_name ?? (/imported from Notion/.test((v.summary ?? "").split("\n")[0]) ? <span className="text-ink-500">From Notion</span> : "—")}</td>
                  <td className={td}><span className="tabular-nums text-[13px]">{(v.scores ?? []).map((s: any) => num(s.pct)).join(" · ") || "—"}</span></td>
                  <td className={td}><Badge tone={v.release_status === "released" ? "green" : v.release_status === "pending" ? "amber" : "neutral"}>{v.release_status === "released" ? "Released" : v.release_status === "pending" ? "Pending" : "Private"}</Badge></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
