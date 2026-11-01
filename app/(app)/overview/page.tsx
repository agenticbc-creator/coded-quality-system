import Link from "next/link";
import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, TierBadge, tierColor } from "@/components/ui";
import { SEGMENT, STEP, currentPeriod, fmtDateTime, num } from "@/lib/format";

export const metadata = { title: "Overview" };

const ACTION: Record<string, string> = {
  "content.approved": "Approved content", "content.changes_requested": "Requested content changes", "content.submit": "Submitted content",
  "pipeline.step.done": "Completed an approval step", "pipeline.step.failed": "Did not approve a step", "pipeline.mock": "Scored a mock class", "pipeline.start": "Started an approval",
  "cohort.go_live": "Started a cohort", "cohort.close": "Closed a cohort", "visit.submit": "Filed a visit report", "visit.release": "Released visit feedback",
  "visit.schedule": "Scheduled a visit", "feedback.approve": "Released a note", "feedback.edit": "Released an edited note", "feedback.keep_private": "Kept a note private",
  "composites.compute": "Recomputed scores", "scoring_template.save": "Changed scoring weights", "qa_template.save": "Changed a QA template", "access.roles": "Changed access",
  "jobs.daily": "Ran daily jobs", "qa_plan.generate": "Generated a QA plan", "classroom.assign": "Staffed a classroom",
};

export default async function Overview() {
  await getMe();
  const supabase = await db();
  const period = currentPeriod();
  const [{ data: audit }, { data: comps }, { data: steps }, { data: content }, { data: cohorts }] = await Promise.all([
    supabase.from("audit_log").select("*, actor:people(full_name)").order("at", { ascending: false }).limit(40),
    supabase.from("composites").select("segment_id, tier, total, provisional, person:people(id, full_name)").eq("period", period),
    supabase.from("pipeline_steps").select("step, opened_at, pipeline:pipelines(id, status, segment_id, person:people(full_name))").eq("status", "pending").not("opened_at", "is", null),
    supabase.from("content_items").select("id, title, status").eq("status", "submitted"),
    supabase.from("cohorts").select("id, name, status, program:programs(segment_id)"),
  ]);
  const openSteps = (steps ?? []).filter((s: any) => s.pipeline?.status === "in_pipeline");
  const bySeg = ["kids", "youth", "pro"].map((s) => {
    const list = (comps ?? []).filter((c: any) => c.segment_id === s);
    const avg = list.length ? list.reduce((a: number, c: any) => a + Number(c.total), 0) / list.length : null;
    return { s, list, avg };
  });

  return (
    <div>
      <PageHeader eyebrow="GM · observer" title="Overview across segments"
        sub="You see every queue and every decision, read only. You approve nothing here, except instructor-level changes as an alternative to HR." />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Live cohorts" value={(cohorts ?? []).filter((c: any) => c.status === "live").length} icon="layers" />
        <Stat label="People approvals open" value={openSteps.length} icon="user-check" />
        <Stat label="Content waiting" value={(content ?? []).length} icon="book" tone={(content ?? []).length ? "amber" : undefined} />
        <Stat label={`Below floor (${period})`} value={(comps ?? []).filter((c: any) => Number(c.total) < 85).length} icon="flag" tone="red" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle icon="chart" sub="Average composite and tier spread this quarter">Quality by segment</CardTitle>
            {bySeg.map(({ s, list, avg }) => (
              <div key={s} className="border-b border-line/70 py-3 last:border-0">
                <div className="flex items-center justify-between"><span className="text-[14px] font-semibold text-navy">{SEGMENT[s]}</span><span className="font-mono text-[18px] font-semibold" style={{ color: tierColor(avg) }}>{avg ? num(avg) : "—"}</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{[1, 2, 3, 4].map((t) => { const n = list.filter((c: any) => c.tier === t).length; return n ? <TierBadge key={t} tier={t} /> : null; })}{!list.length && <span className="text-[12px] text-ink-500">No scores this quarter</span>}</div>
              </div>
            ))}
          </Card>
          <Card>
            <CardTitle icon="user-check" sub="Who the pipeline is waiting on">Approvals in progress</CardTitle>
            {openSteps.length === 0 ? <Empty title="Nothing open" /> : openSteps.map((s: any) => (
              <Link key={s.pipeline.id + s.step} href={`/approvals/people/${s.pipeline.id}`} className="flex items-center justify-between border-b border-line/70 py-2 text-[13px] last:border-0">
                <span>{s.pipeline.person.full_name} · {STEP[s.step].label}</span><Badge>{STEP[s.step].owner}</Badge>
              </Link>
            ))}
            {(content ?? []).map((c: any) => (
              <Link key={c.id} href={`/approvals/content/${c.id}`} className="flex items-center justify-between border-b border-line/70 py-2 text-[13px] last:border-0">
                <span>{c.title}</span><Badge tone="amber">Content approval</Badge>
              </Link>
            ))}
          </Card>
        </div>
        <Card>
          <CardTitle icon="eye" sub="Approval audit log: who approved what, when, with which version">Decisions</CardTitle>
          <ul className="divide-y divide-line/70">
            {(audit ?? []).map((a: any) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
                <span><b className="text-navy">{a.actor?.full_name ?? "System"}</b> · {ACTION[a.action] ?? a.action}{a.data?.step ? ` (${STEP[a.data.step]?.label ?? a.data.step})` : ""}{a.data?.version ? ` · v${a.data.version}` : ""}</span>
                <span className="shrink-0 text-[11.5px] text-ink-500">{fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
