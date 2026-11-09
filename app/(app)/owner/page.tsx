import Link from "next/link";
import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, LinkButton, PageHeader, ScoreBar, Stat, TierBadge, cx, tierColor } from "@/components/ui";
import { SignalGrid } from "@/components/performance";
import { signalLevels } from "@/lib/person";
import { Icon } from "@/components/icons";
import { SEGMENT, STEP, TIER, currentPeriod, fmtDate, fmtDateTime, num, periodLabel, visitLabel } from "@/lib/format";

export const metadata = { title: "Segment overview" };

export default async function OwnerHome() {
  const me = await getMe();
  const supabase = await db();
  const period = currentPeriod();
  const segs = me.owned_segments;
  const [{ data: cohorts }, { data: comps }, { data: visits }, { data: notes }, { data: steps }, { data: plans }] = await Promise.all([
    supabase.from("cohorts").select("*, program:programs(name, segment_id, program_type), classrooms(id, name, classroom_staff(role, person:people(id, full_name)))").order("start_date", { ascending: false }),
    supabase.from("composites").select("*, person:people!composites_person_id_fkey(id, full_name)").eq("period", period),
    supabase.from("visits").select("*, cohort:cohorts(name), classroom:classrooms(name), assignee:people!visits_assignee_id_fkey(full_name), scores:visit_scores(pct, subject_role, subject_person_id)").order("scheduled_for"),
    supabase.from("feedback").select("id, severity, created_at, subject:people!feedback_subject_id_fkey(full_name), red_flag_reason").eq("status", "private"),
    supabase.from("pipeline_steps").select("*, pipeline:pipelines(id, segment_id, target_role, status, person:people!pipelines_person_id_fkey(full_name))").eq("status", "pending").not("opened_at", "is", null).in("step", ["selection_rate", "cleared"]),
    supabase.from("plans").select("*, person:people!plans_person_id_fkey(id, full_name)").eq("status", "open"),
  ]);
  const mine = (cohorts ?? []).filter((c: any) => segs.includes(c.program.segment_id));
  const live = mine.filter((c: any) => c.status === "live");
  const setup = mine.filter((c: any) => c.status === "setup").sort((a: any, b: any) => (a.start_date > b.start_date ? 1 : -1));
  const myComps = (comps ?? []).filter((c: any) => segs.includes(c.segment_id));
  const pendingRelease = (visits ?? []).filter((v: any) => v.release_status === "pending").length + (notes ?? []).filter((n: any) => n.severity !== "red_flag").length;
  const reds = (notes ?? []).filter((n: any) => n.severity === "red_flag");
  const myApprovals = (steps ?? []).filter((s: any) => s.pipeline?.status === "in_pipeline" && segs.includes(s.pipeline.segment_id));
  const unassigned = (visits ?? []).filter((v: any) => v.status === "planned" && !v.assignee_id && mine.some((c: any) => c.id === v.cohort_id && c.status !== "closed"));
  const SHOW = 8;
  const upcoming = (visits ?? []).filter((v: any) => ["invited", "accepted"].includes(v.status) && new Date(v.scheduled_for) > new Date()).slice(0, 5);
  const tiers = [1, 2, 3, 4].map((t) => myComps.filter((c: any) => c.tier === t).length);
  const lv = await signalLevels();
  const signals = await Promise.all(live.flatMap((c: any) => c.classrooms).map(async (cl: any) => ({ cl, data: (await supabase.rpc("live_signals", { p_classroom: cl.id })).data })));

  return (
    <div>
      <PageHeader eyebrow={`Segment owner · ${segs.map((s) => SEGMENT[s]).join(" & ")}`} title={`Good day, ${me.full_name.split(" ")[0]}`}
        sub="Final say on approvals and releases in one place. Red flags reach you the same day."
        actions={<><LinkButton href="/visits/new" icon="plus" variant="secondary">Schedule a visit</LinkButton><LinkButton href="/feedback/release" icon="send">Release queue</LinkButton></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Red flags open" value={reds.length} tone={reds.length ? "red" : "green"} icon="flag" sub={reds[0] ? `${reds[0].subject.full_name} · ${reds[0].red_flag_reason}` : "None"} />
        <Stat label="Waiting for release" value={pendingRelease} tone={pendingRelease ? "amber" : undefined} icon="send" sub="Visit reports and notes" />
        <Stat label="Approvals on you" value={myApprovals.length} icon="user-check" sub="Selection, rate and clearance" />
        <Stat label="Open plans" value={(plans ?? []).length} icon="flag" sub="Coaching and Improvement Plans" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle icon="chart" sub={`${periodLabel(period)} · target 90, floor 85`} right={<Link href="/scores" className="text-[13px] font-medium text-brand">All scores →</Link>}>Tier spread</CardTitle>
            <div className="grid grid-cols-4 gap-2">
              {tiers.map((n, i) => (
                <div key={i} className="rounded-lg border border-line p-3 text-center">
                  <div className="tabular-nums text-[24px] font-semibold" style={{ color: tierColor([95, 87, 80, 70][i]) }}>{n}</div>
                  <div className="text-[12px] text-ink-500">{TIER[(i + 1) as 1].label}</div>
                </div>
              ))}
            </div>
            <ul className="mt-4 divide-y divide-line/70">
              {myComps.sort((a: any, b: any) => Number(a.total) - Number(b.total)).map((c: any) => (
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3 py-2.5">
                  <Link href={`/people/${c.person.id}`} className="truncate text-[14px] font-medium text-navy hover:text-brand">{c.person.full_name} <span className="text-[12px] font-normal text-ink-500">{c.role === "ta" ? "TA" : "Instructor"}</span></Link>
                  <ScoreBar value={c.total} />
                  <span className="flex items-center gap-2"><span className="w-10 text-right tabular-nums text-[13.5px] font-semibold" style={{ color: tierColor(c.total) }}>{num(c.total)}</span><TierBadge tier={c.tier} provisional={c.provisional} /></span>
                </li>
              ))}
            </ul>
          </Card>

          {live.map((c: any) => {
            const cls = signals.filter((s) => c.classrooms.some((x: any) => x.id === s.cl.id));
            const qa = (cl: any) => {
              const vs = (visits ?? []).filter((v: any) => v.classroom_id === cl.id && v.qa_type === "education" && v.status === "completed");
              const all = vs.flatMap((v: any) => v.scores.filter((s: any) => s.subject_role === "class"));
              return all.length ? all.reduce((a: number, s: any) => a + Number(s.pct), 0) / all.length : null;
            };
            return (
              <Card key={c.id}>
                <CardTitle icon="layers" sub={`${c.classrooms.length} classrooms on the same content · live signals and QA side by side`} right={<Link href={`/cohorts/${c.id}`} className="text-[13px] font-medium text-brand">Open cohort →</Link>}>{c.name}</CardTitle>
                <div className="mb-5 grid gap-2 sm:grid-cols-3">
                  {c.classrooms.sort((a: any, b: any) => (a.name > b.name ? 1 : -1)).map((cl: any) => {
                    const q = qa(cl);
                    const s = cls.find((x) => x.cl.id === cl.id)?.data;
                    const alerts = s ? Object.values(s.alerts ?? {}).filter(Boolean).length : 0;
                    return (
                      <div key={cl.id} className="rounded-lg border border-line p-3">
                        <div className="text-[13.5px] font-semibold text-navy">{cl.name}</div>
                        <div className="text-[12px] text-ink-500">{cl.classroom_staff.find((x: any) => x.role === "instructor")?.person.full_name}</div>
                        <div className="mt-2 flex items-baseline justify-between"><span className="text-[12px] text-ink-500">Class QA</span><span className="tabular-nums font-semibold" style={{ color: tierColor(q) }}>{num(q)}</span></div>
                        <div className="flex items-baseline justify-between"><span className="text-[12px] text-ink-500">App alerts</span><span className={cx("tabular-nums font-semibold", alerts ? "text-tier4" : "text-tier1")}>{alerts}</span></div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-5">{cls.map(({ cl, data }) => <SignalGrid key={cl.id} title={cl.name} data={data} levels={lv.levels} draft={lv.draft} />)}</div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          {reds.length > 0 && (
            <Card className="border-[#F6C9C6]">
              <CardTitle icon="flag" sub="Outside the 48-hour feedback SLA">Red flags</CardTitle>
              <ul className="space-y-2">
                {reds.map((r: any) => (
                  <li key={r.id} className="rounded-lg bg-tier4-bg px-3 py-2 text-[13.5px]"><b>{r.subject.full_name}</b> — {r.red_flag_reason}<div className="text-[12px] text-ink-500">{fmtDateTime(r.created_at)}</div></li>
                ))}
              </ul>
              <div className="mt-3"><LinkButton href="/feedback/release" variant="secondary">Review now</LinkButton></div>
            </Card>
          )}
          <Card>
            <CardTitle icon="user-check" sub="Final approval of people (selection, rate, clearance)">Waiting on you</CardTitle>
            {myApprovals.length === 0 ? <Empty title="Nothing waiting" icon="check" /> : (
              <ul className="divide-y divide-line/70">
                {myApprovals.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between py-2.5 text-[13.5px]">
                    <span><b className="text-navy">{s.pipeline.person.full_name}</b> · {STEP[s.step].label}</span>
                    <Link href={`/approvals/people/${s.pipeline.id}`} className="text-brand">Open →</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle icon="layers" sub="A cohort starts only when content is locked and every classroom is cleared">Cohorts in setup</CardTitle>
            {setup.length === 0 ? <Empty title="No cohorts in setup" /> : setup.slice(0, SHOW).map((c: any) => (
              <Link key={c.id} href={`/cohorts/${c.id}`} className="mb-2 flex items-center justify-between rounded-lg border border-line p-3 hover:bg-canvas">
                <span><span className="block text-[14px] font-semibold text-navy">{c.name}</span><span className="text-[12.5px] text-ink-500">Starts {fmtDate(c.start_date)} · {c.classrooms.length} classrooms</span></span>
                <Badge tone="amber">Setup</Badge>
              </Link>
            ))}
            {setup.length > SHOW && <Link href="/cohorts" className="text-[13px] font-semibold text-brand">All {setup.length} cohorts in setup →</Link>}
          </Card>
          <Card>
            <CardTitle icon="clipboard" sub="Visits the rotation could not fill or an observer declined">Visits needing an observer</CardTitle>
            {unassigned.length === 0 ? <Empty title="Every visit has an observer" icon="check" /> : unassigned.slice(0, SHOW).map((v: any) => (
              <Link key={v.id} href={`/visits/new?visit=${v.id}`} className="mb-2 flex items-center justify-between rounded-lg border border-dashed border-[#F5DDAF] bg-tier3-bg/50 p-3 text-[13.5px]">
                <span>{visitLabel(v)} · {v.cohort?.name}<span className="block text-[12px] text-ink-500">{fmtDateTime(v.scheduled_for)}</span></span>
                <span className="text-brand">Assign →</span>
              </Link>
            ))}
            {unassigned.length > SHOW && <Link href="/visits" className="text-[13px] font-semibold text-brand">All {unassigned.length} visits needing an observer →</Link>}
            {upcoming.length > 0 && (
              <>
                <div className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-500">Upcoming</div>
                <ul className="divide-y divide-line/70">
                  {upcoming.map((v: any) => (
                    <li key={v.id} className="flex items-center justify-between py-2 text-[13px]">
                      <span>{visitLabel(v)} · {v.cohort?.name}<span className="block text-ink-500">{v.assignee?.full_name} · {fmtDateTime(v.scheduled_for)}</span></span>
                      <Badge tone={v.status === "accepted" ? "green" : "neutral"}>{v.status}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          {(plans ?? []).length > 0 && (
            <Card>
              <CardTitle icon="flag">Open plans</CardTitle>
              {(plans ?? []).map((p: any) => (
                <Link key={p.id} href={`/people/${p.person.id}`} className="flex items-center justify-between py-1.5 text-[13.5px]">
                  <span>{p.person.full_name} · {p.kind === "coaching" ? "Coaching Plan" : "Improvement Plan"}</span>
                  <span className={cx("text-[12.5px]", new Date(p.due) < new Date() ? "text-tier4" : "text-ink-500")}>due {fmtDate(p.due)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
      <p className="mt-8 flex items-center gap-1.5 text-[12.5px] text-ink-500"><Icon name="eye" className="h-3.5 w-3.5" /> The GM sees every decision you make here, read only.</p>
    </div>
  );
}
