import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader, Stat, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime, STATUS_LABEL, ago, visitLabel, lateLabel } from "@/lib/format";

export const metadata = { title: "Education home" };

export default async function EducationHome() {
  const me = await getMe();
  // Only these roles can book education visits (visit_schedule); the button is hidden for everyone else.
  const canBook = has(me, "segment_owner", "education_principal", "senior_instructor", "education_coordinator");
  const supabase = await db();
  const now = new Date().toISOString();
  const [myVisits, pendingContent, stages, cctp, onboarding, templates, pipes, live, recentScores] = await Promise.all([
    supabase.from("visits").select("id, kind, qa_type, mode, status, scheduled_for, cohort:cohorts(name), classroom:classrooms(name)").eq("assignee_id", me.id).in("status", ["invited", "accepted"]).order("scheduled_for"),
    supabase.from("content_versions").select("id, version, submitted_at, content:content_items(id, title)").eq("decision", "pending"),
    supabase.from("content_stages").select("id, stage, approver_role, status, content:content_items(id, title)").eq("status", "pending").order("ord"),
    supabase.from("cctp_bookings").select("id, scheduled_for, person:people!cctp_bookings_person_id_fkey(full_name)").eq("status", "booked").order("scheduled_for"),
    supabase.from("qaer_onboarding").select("template_key").eq("person_id", me.id),
    supabase.from("qa_templates").select("key").neq("status", "retired"),
    supabase.from("pipelines").select("id, person:people!pipelines_person_id_fkey(full_name), steps:pipeline_steps(step, ord, status, opened_at)").eq("status", "in_pipeline"),
    supabase.from("cohorts").select("id, name, classrooms(id, name), visits(id, kind, qa_type, status, submitted_at)").eq("status", "live"),
    supabase.from("visit_scores").select("pct, subject_role, visit:visits(submitted_at, qa_type)").limit(200),
  ]);
  const upcoming = ((myVisits.data ?? []) as any[]);
  const today = upcoming.filter((v) => v.scheduled_for && new Date(v.scheduled_for).toDateString() === new Date().toDateString());
  const eduSteps = ((pipes.data ?? []) as any[]).map((p) => ({ p, cur: (p.steps as any[]).sort((a, b) => a.ord - b.ord).find((s) => s.status !== "done") }))
    .filter((x) => x.cur && ["criteria", "vetting", "onboarding", "mock1", "mock2"].includes(x.cur.step));
  const onb = Math.round(((onboarding.data?.length ?? 0) / Math.max(1, templates.data?.length ?? 1)) * 100);
  const edScores = ((recentScores.data ?? []) as any[]).filter((s) => s.visit?.qa_type === "education" && s.subject_role !== "class");
  const avg = edScores.length ? edScores.reduce((a, s) => a + Number(s.pct), 0) / edScores.length : null;
  const mineStages = ((stages.data ?? []) as any[]).filter((s) => has(me, s.approver_role));
  const firstName = me.full_name.split(" ")[0];

  return (
    <div className="space-y-6">
      <section className="blueprint overflow-hidden rounded-2xl p-6 text-white md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Education · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kuwait" })}</div>
        <h1 className="mt-2 text-[32px] font-extrabold tracking-tight">Good to see you, {firstName}.</h1>
        <p className="mt-1 max-w-2xl text-[14.5px] text-white/70">
          {today.length ? `You have ${today.length} visit${today.length > 1 ? "s" : ""} today.` : "No visits on your calendar today."}{" "}
          {has(me, "education_principal") && (pendingContent.data?.length ?? 0) > 0 ? `${pendingContent.data!.length} content ${pendingContent.data!.length === 1 ? "version is" : "versions are"} waiting for your approval.` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {canBook && <Link href="/visits/new" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-semibold text-navy hover:bg-brand-50"><Icon name="plus" className="h-4 w-4" /> Schedule a visit</Link>}
          <Link href="/feedback/new" className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"><Icon name="pen" className="h-4 w-4" /> Log feedback</Link>
          <Link href="/approvals" className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"><Icon name="inbox" className="h-4 w-4" /> Waiting on me</Link>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="My open visits" value={upcoming.length} sub={today.length ? `${today.length} today` : "none today"} icon="clipboard" />
        <Stat label="Approvals with Education" value={eduSteps.length + (pendingContent.data?.length ?? 0) + mineStages.length} sub="people steps, content, stages" icon="user-check" tone={eduSteps.length ? "amber" : undefined} />
        <Stat label="Mock classes booked" value={cctp.data?.length ?? 0} icon="award" />
        <Stat label="Average education QA" value={avg ? avg.toFixed(1) : "—"} sub={`${edScores.length} scored observations`} icon="chart" tone={avg && avg >= 85 ? "green" : "amber"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle icon="calendar" sub="Invites to answer and visits to run." right={<Link href="/calendar?mine=1" className="text-[13px] font-medium text-brand hover:underline">Calendar</Link>}>My visits</CardTitle>
            {upcoming.length === 0 ? <Empty title="No open visits" /> : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 6).map((v) => (
                  <li key={v.id}>
                    <Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand">
                      <span className="flex items-center gap-3">
                        <span className="grid w-12 shrink-0 place-items-center border-2 border-navy py-1 text-center leading-none">
                          <span className="text-[11px] font-bold uppercase text-brand">{new Date(v.scheduled_for).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Kuwait" })}</span>
                          <span className="text-[17px] font-extrabold text-navy">{new Date(v.scheduled_for).toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Kuwait" })}</span>
                        </span>
                        <span><span className="block text-[14px] font-semibold text-navy">{visitLabel(v)}</span><span className="block text-[12.5px] text-ink-500">{v.cohort?.name} · {v.classroom?.name} · {fmtDateTime(v.scheduled_for)}</span></span>
                      </span>
                      <Badge tone={v.status === "invited" ? "amber" : "green"}>{v.status === "invited" ? "Respond" : STATUS_LABEL[v.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle icon="grid" sub="Visits held against the plan, per live cohort.">QA coverage</CardTitle>
            {((live.data ?? []) as any[]).map((c) => {
              const qa = (c.visits as any[]).filter((v) => v.kind === "qa" && v.status !== "cancelled");
              const done = qa.filter((v) => v.submitted_at).length;
              const pct = qa.length ? Math.round((done / qa.length) * 100) : 0;
              return (
                <Link key={c.id} href={`/cohorts/${c.id}`} className="block rounded-lg border border-line p-3 transition hover:border-navy">
                  <div className="flex items-center justify-between text-[14px]"><b className="text-navy">{c.name}</b><span className="tabular-nums text-ink-500">{done}/{qa.length} QA visits</span></div>
                  <div className="mt-2 h-2 overflow-hidden bg-canvas"><div className="h-full bg-navy" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1.5 text-[12.5px] text-ink-500">{c.classrooms.length} classrooms · {(c.visits as any[]).filter((v) => v.kind === "shadowing" && v.submitted_at).length} shadowing visits filed</div>
                </Link>
              );
            })}
            {(live.data?.length ?? 0) === 0 && <Empty title="No live cohorts" />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle icon="inbox" sub="Steps owned by Education.">Approvals with Education</CardTitle>
            <ul className="space-y-2">
              {has(me, "education_principal") && ((pendingContent.data ?? []) as any[]).map((v) => (
                <li key={v.id}><Link href={`/approvals/content/${v.content.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13.5px] hover:border-navy"><span><Icon name="book" className="mr-1.5 inline h-3.5 w-3.5 text-brand" />{v.content.title} · v{v.version}</span><span className="text-[12px] text-ink-500">{ago(v.submitted_at)}{lateLabel(v.submitted_at) && <b className="ml-1.5 text-tier4">· {lateLabel(v.submitted_at)}</b>}</span></Link></li>
              ))}
              {mineStages.slice(0, 3).map((s) => (
                <li key={s.id}><Link href={`/approvals/content/${s.content.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13.5px] hover:border-navy"><span><Icon name="layers" className="mr-1.5 inline h-3.5 w-3.5 text-brand" />{s.content.title}</span><span className="text-[12px] capitalize text-ink-500">{s.stage.replace("_", " ")}</span></Link></li>
              ))}
              {eduSteps.map(({ p, cur }) => (
                <li key={p.id}><Link href={`/approvals/people/${p.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13.5px] hover:border-navy"><span className="flex items-center gap-2"><Avatar name={p.person.full_name} size={22} />{p.person.full_name}</span><span className="text-[12px] text-ink-500">{cur.step.replace(/(\d)/, " $1")}{cur.opened_at ? ` · ${ago(cur.opened_at)}{lateLabel(cur.opened_at) && <b className="ml-1.5 text-tier4">· {lateLabel(cur.opened_at)}</b>}` : ""}</span></Link></li>
              ))}
              {eduSteps.length + mineStages.length + (has(me, "education_principal") ? pendingContent.data?.length ?? 0 : 0) === 0 && <Empty title="Nothing waiting on Education" icon="check" />}
            </ul>
          </Card>

          <Card>
            <CardTitle icon="award" right={<Link href="/cctp" className="text-[13px] font-medium text-brand hover:underline">CCTP</Link>}>Mock classes booked</CardTitle>
            {(cctp.data?.length ?? 0) === 0 ? <p className="text-[13.5px] text-ink-500">None booked.</p> : ((cctp.data ?? []) as any[]).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 text-[13.5px]"><span className="font-medium text-navy">{b.person.full_name}</span><span className="text-ink-500">{fmtDateTime(b.scheduled_for)}</span></div>
            ))}
          </Card>

          <Card>
            <CardTitle icon="target" right={<Link href="/onboarding" className="text-[13px] font-medium text-brand hover:underline">Open</Link>}>Your QAer onboarding</CardTitle>
            <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden bg-canvas"><div className={cx("h-full", onb === 100 ? "bg-tier1" : "bg-brand")} style={{ width: `${onb}%` }} /></div><span className="text-[13.5px] font-bold tabular-nums">{onb}%</span></div>
          </Card>
        </div>
      </div>
      <p className="text-[12px] text-ink-400">Updated {ago(now)}.</p>
    </div>
  );
}
