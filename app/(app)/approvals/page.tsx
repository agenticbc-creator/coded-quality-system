import Link from "next/link";
import { getMe, has, isOwner } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { STEP, hoursSince, visitLabel } from "@/lib/format";

export const metadata = { title: "Waiting on me" };

type Item = { key: string; area: string; icon: string; title: string; sub: string; stage: string; since: string | null; owner: string; href: string; mine: boolean };

const STEP_ROLES: Record<string, string[]> = {
  criteria: ["education_principal", "senior_instructor"], vetting: ["education_principal", "senior_instructor"], onboarding: ["education_principal", "senior_instructor"],
  mock1: ["education_principal", "senior_instructor"], mock2: ["education_principal", "senior_instructor"], contract: ["hr"],
};

function Age({ since }: { since: string | null }) {
  if (!since) return <span className="text-ink-400">—</span>;
  const h = hoursSince(since) ?? 0;
  const label = h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`;
  return <span className={cx("inline-flex min-w-[42px] justify-center rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums", h < 24 ? "bg-tier1-bg text-tier1" : h < 72 ? "bg-tier3-bg text-tier3" : "bg-tier4-bg text-tier4")}>{label}</span>;
}

export default async function Approvals() {
  const me = await getMe();
  const supabase = await db();
  const owner = isOwner(me);
  const [versions, stages, pipes, queue, visitsMine, releases, levels, cctp, unacked] = await Promise.all([
    supabase.from("content_versions").select("id, version, submitted_at, content:content_items(id, title, staged, creator:people!content_items_creator_id_fkey(full_name))").eq("decision", "pending"),
    supabase.from("content_stages").select("id, stage, ord, approver_role, status, content:content_items(id, title, status)").neq("status", "approved").order("ord"),
    supabase.from("pipelines").select("id, segment_id, target_role, person:people!pipelines_person_id_fkey(full_name), steps:pipeline_steps(step, ord, status, opened_at)").eq("status", "in_pipeline"),
    owner || has(me, "education_principal") ? supabase.from("feedback").select("id, severity, created_at, subject:people!feedback_subject_id_fkey(full_name)").eq("status", "private").is("reviewed_at", null) : Promise.resolve({ data: [] }),
    supabase.from("visits").select("id, kind, qa_type, mode, status, scheduled_for, created_at, submitted_at, cohort:cohorts(name), classroom:classrooms(name)").eq("assignee_id", me.id).in("status", ["invited", "accepted"]),
    owner ? supabase.from("visits").select("id, kind, qa_type, mode, submitted_at, cohort:cohorts(name), classroom:classrooms(name)").eq("release_status", "pending") : Promise.resolve({ data: [] }),
    supabase.from("level_changes").select("id, kind, to_level, owner_at, hrgm_at, created_at, person:people!level_changes_person_id_fkey(full_name)").eq("status", "suggested"),
    supabase.from("cctp_bookings").select("id, scheduled_for, created_at, person:people!cctp_bookings_person_id_fkey(full_name)").eq("status", "booked"),
    supabase.from("released_feedback").select("id, title, released_at").eq("subject_id", me.id).is("ack_at", null),
  ]);

  const items: Item[] = [];
  for (const v of (versions.data ?? []) as any[]) {
    const stagesOpen = ((stages.data ?? []) as any[]).some((s) => s.content?.id === v.content?.id);
    items.push({ key: "cv" + v.id, area: "Content", icon: "book", title: v.content?.title, sub: `Version ${v.version} by ${v.content?.creator?.full_name}`, stage: stagesOpen ? "Final approval (stages open)" : "Final approval",
      since: v.submitted_at, owner: "Education Principal", href: `/approvals/content/${v.content?.id}`, mine: has(me, "education_principal") });
  }
  const firstOpen = new Map<string, any>();
  for (const s of (stages.data ?? []) as any[]) if (!firstOpen.has(s.content.id)) firstOpen.set(s.content.id, s);
  for (const s of firstOpen.values()) items.push({ key: "cs" + s.id, area: "Content", icon: "layers", title: s.content.title, sub: "Staged review", stage: s.stage.replace("_", " "),
    since: null, owner: s.approver_role === "education_principal" ? "Education Principal" : "Senior Instructor", href: `/approvals/content/${s.content.id}`, mine: has(me, s.approver_role) });
  for (const p of (pipes.data ?? []) as any[]) {
    const cur = (p.steps as any[]).sort((a, b) => a.ord - b.ord).find((s) => s.status !== "done");
    if (!cur) continue;
    const mine = cur.step === "selection_rate" || cur.step === "cleared" ? me.owned_segments.includes(p.segment_id) : has(me, ...(STEP_ROLES[cur.step] ?? []));
    items.push({ key: "pl" + p.id, area: "People", icon: "user-check", title: p.person.full_name, sub: p.target_role === "ta" ? "TA approval" : "Instructor approval", stage: STEP[cur.step].label,
      since: cur.opened_at, owner: STEP[cur.step].owner, href: `/approvals/people/${p.id}`, mine });
  }
  for (const f of (queue.data ?? []) as any[]) items.push({ key: "fb" + f.id, area: "Feedback", icon: f.severity === "red_flag" ? "flag" : "send", title: f.subject.full_name, sub: f.severity === "red_flag" ? "Red flag — same day" : "Private note to review",
    stage: "Release queue", since: f.created_at, owner: "Segment owner", href: "/feedback/release", mine: owner });
  for (const v of (releases.data ?? []) as any[]) items.push({ key: "vr" + v.id, area: "Visits", icon: "send", title: `${visitLabel(v)} · ${v.cohort?.name}`, sub: v.classroom?.name ?? "", stage: "Release results",
    since: v.submitted_at, owner: "Segment owner", href: `/visits/${v.id}`, mine: true });
  for (const v of (visitsMine.data ?? []) as any[]) {
    const overdue = v.status === "accepted" && new Date(v.scheduled_for) < new Date();
    if (v.status === "accepted" && !overdue) continue;
    items.push({ key: "vm" + v.id, area: "Visits", icon: "clipboard", title: `${visitLabel(v)} · ${v.cohort?.name}`, sub: v.classroom?.name ?? "", stage: v.status === "invited" ? "Respond to invite" : "Submit the visit",
      since: v.status === "invited" ? v.created_at : v.scheduled_for, owner: "You", href: `/visits/${v.id}`, mine: true });
  }
  for (const l of (levels.data ?? []) as any[]) {
    const mine = (owner && !l.owner_at) || (has(me, "hr", "gm") && !l.hrgm_at);
    items.push({ key: "lv" + l.id, area: "Levels", icon: "trending", title: l.person.full_name, sub: `${l.kind} → ${l.to_level}`, stage: !l.owner_at ? "Segment owner sign-off" : "HR or GM sign-off",
      since: l.created_at, owner: !l.owner_at ? "Segment owner" : "HR or GM", href: "/levels", mine });
  }
  for (const b of (cctp.data ?? []) as any[]) items.push({ key: "cc" + b.id, area: "CCTP", icon: "award", title: b.person.full_name, sub: "Live mock class", stage: "Score the mock class",
    since: b.created_at, owner: "Education", href: "/cctp", mine: has(me, "education_principal", "senior_instructor") });
  for (const r of (unacked.data ?? []) as any[]) items.push({ key: "ak" + r.id, area: "Feedback", icon: "check", title: r.title, sub: "Released to you", stage: "Acknowledge", since: r.released_at, owner: "You", href: "/me", mine: true });

  const mine = items.filter((i) => i.mine).sort((a, b) => (hoursSince(b.since) ?? 0) - (hoursSince(a.since) ?? 0));
  const others = items.filter((i) => !i.mine);
  const over3 = items.filter((i) => (hoursSince(i.since) ?? 0) > 72).length;
  const areas = Array.from(new Set(items.map((i) => i.area)));

  const Row = ({ i }: { i: Item }) => (
    <Link href={i.href} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-zebra md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-canvas text-navy"><Icon name={i.icon} className="h-4 w-4" /></span>
      <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-navy">{i.title}</span><span className="block truncate text-[12px] text-ink-500">{i.area} · {i.sub}</span></span>
      <span className="hidden truncate text-[13px] capitalize text-ink-600 md:block">{i.stage}</span>
      <span className="hidden truncate text-[12.5px] text-ink-500 md:block">{i.owner}</span>
      <Age since={i.since} />
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="R2 · approvals dashboard" title="Waiting on me"
        sub="Everything that needs a decision, by stage, age and approver. Anything older than three working days also sends a reminder to the approver." />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Waiting on you" value={mine.length} icon="inbox" tone={mine.length ? "amber" : "green"} />
        <Stat label="In flight across CODED" value={items.length} icon="layers" />
        <Stat label="Older than 3 days" value={over3} icon="clock" tone={over3 ? "red" : "green"} />
        <Stat label="Areas" value={areas.length} sub={areas.join(" · ") || "—"} icon="grid" />
      </div>
      <Card pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-[15px] font-semibold text-navy">Your queue</h2><span className="text-[12px] text-ink-500">oldest first</span></div>
        {mine.length === 0 ? <div className="p-5"><Empty icon="check" title="Nothing is waiting on you" sub="New requests appear here and in your notifications." /></div> : <div className="divide-y divide-line">{mine.map((i) => <Row key={i.key} i={i} />)}</div>}
      </Card>
      {others.length > 0 && (
        <Card pad={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-[15px] font-semibold text-navy">With someone else</h2><Badge>{others.length}</Badge></div>
          <div className="divide-y divide-line">{others.map((i) => <Row key={i.key} i={i} />)}</div>
        </Card>
      )}
      <CardTitle sub="Green under a day · amber under three days · red over three days.">{""}</CardTitle>
    </div>
  );
}
