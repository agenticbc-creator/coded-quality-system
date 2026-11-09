import Link from "next/link";
import { getMe } from "@/lib/session";
import { loadPerson } from "@/lib/person";
import { Breakdown, FeedbackList, Hero, History, JDChecklist, Plans, Profile, Review360, SegmentScores, Signals, Surveys, Trend } from "@/components/performance";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "My home" };

type Ask = { tone: "late" | "soon" | "info"; icon: string; title: string; sub: string; href: string };

export default async function MyDashboard() {
  const me = await getMe();
  const d = await loadPerson(me.id);
  const today = new Date().toISOString().slice(0, 10);

  // "Needs you": the asks first, before the score and the detail.
  const asks: Ask[] = [];
  const unacked = d.released.filter((r) => !r.ack_at).length;
  if (unacked > 0) asks.push({ tone: "soon", icon: "send", title: `Acknowledge ${unacked} released feedback ${unacked === 1 ? "item" : "items"}`, sub: "Within 48 hours counts toward accountability", href: "#feedback" });
  for (const p of d.plans.filter((x) => x.status === "open")) {
    const kind = p.kind === "coaching" ? "Coaching Plan" : "Improvement Plan";
    const days = Math.round((Date.parse(today) - Date.parse(p.due)) / 864e5);
    if (days > 0) asks.push({ tone: "late", icon: "clock", title: `Your ${kind} review was due ${fmtDate(p.due)}`, sub: `${days} ${days === 1 ? "day" : "days"} late. Ask your segment owner to book it.`, href: "#plans" });
    else asks.push({ tone: "info", icon: "flag", title: `${kind} due ${fmtDate(p.due)}`, sub: `${(p.goals ?? []).filter((g: any) => !g.done).length} goals still open`, href: "#plans" });
  }
  const lateSessions = d.signals.reduce((n, s) => n + (s.data?.late_attendance?.length ?? 0), 0);
  if (lateSessions > 0) asks.push({ tone: "soon", icon: "calendar", title: `Log attendance for ${lateSessions} ${lateSessions === 1 ? "session" : "sessions"}`, sub: "Past the 24-hour window in the CODED App", href: "#signals" });

  const TONE = { late: "bg-tier4-bg text-tier4", soon: "bg-tier3-bg text-tier3", info: "bg-brand-50 text-brand" };

  return (
    <div className="space-y-6">
      <section aria-labelledby="needs-you" className="space-y-2.5">
        <h2 id="needs-you" className="label-mono">{asks.length ? `Needs you · ${asks.length}` : "Nothing needs you right now"}</h2>
        {asks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {asks.map((a) => (
              <Link key={a.title} href={a.href} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-card transition hover:border-brand">
                <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", TONE[a.tone])}><Icon name={a.icon} className="h-4 w-4" /></span>
                <span><b className="block text-[14.5px] leading-snug text-ink">{a.title}</b><span className="mt-0.5 block text-[13px] text-ink-600">{a.sub}</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Hero d={d} self />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Breakdown d={d} />
          <SegmentScores d={d} />
          <div id="signals"><Signals d={d} /></div>
          <div id="feedback"><FeedbackList d={d} self /></div>
        </div>
        <div className="space-y-6">
          <div id="plans"><Plans d={d} /></div>
          <Trend d={d} />
          <Review360 d={d} self />
          <Surveys d={d} />
        </div>
      </div>

      <details className="group rounded-2xl border border-line bg-white shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span><b className="block text-[16px] text-ink">My record</b><span className="text-[13px] text-ink-600">ERPNext profile, contracts across segments and the job description checklist</span></span>
          <Icon name="chevron" className="h-4 w-4 text-ink-500 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-line p-5">
          <Profile d={d} />
          <History d={d} />
          <JDChecklist d={d} canConfirm={false} />
        </div>
      </details>
    </div>
  );
}
