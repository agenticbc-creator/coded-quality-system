import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, LinkButton, Notice, PageHeader, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { STATUS_LABEL, fmtDateTime, visitLabel } from "@/lib/format";

export const metadata = { title: "QA calendar" };

/** Education coordinator home: book, reassign and chase visits. Status only, never scores or private notes. */
export default async function Coordinator() {
  const me = await getMe();
  if (!has(me, "education_coordinator", "segment_owner", "education_principal")) redirect("/");
  const supabase = await db();
  const { data } = await supabase.from("visits")
    .select("id, kind, qa_type, mode, week_no, status, scheduled_for, submitted_at, release_status, assignee_id, cohort:cohorts(id, name), classroom:classrooms(name), assignee:people!visits_assignee_id_fkey(full_name)")
    .order("scheduled_for", { ascending: true });
  const all = (data ?? []) as any[];
  const now = new Date();
  // Kuwait working week: Sunday to Thursday.
  const sun = new Date(now); sun.setHours(0, 0, 0, 0); sun.setDate(sun.getDate() - sun.getDay());
  const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(sun); d.setDate(sun.getDate() + i); return d; });
  const weekEnd = new Date(sun); weekEnd.setDate(sun.getDate() + 5);
  const week = all.filter((v) => v.scheduled_for && new Date(v.scheduled_for) >= sun && new Date(v.scheduled_for) < weekEnd && v.status !== "cancelled");
  const needs = all.filter((v) => !v.assignee_id && !v.submitted_at && v.status !== "cancelled");
  const unanswered = all.filter((v) => v.status === "invited" && !v.submitted_at);
  const overdueReports = all.filter((v) => !v.submitted_at && v.status === "accepted" && v.scheduled_for && now.getTime() - new Date(v.scheduled_for).getTime() > 24 * 36e5);
  const load = new Map<string, { name: string; n: number }>();
  week.forEach((v) => { if (v.assignee) load.set(v.assignee_id, { name: v.assignee.full_name, n: (load.get(v.assignee_id)?.n ?? 0) + 1 }); });

  const asks = [
    needs.length && { tone: "late", title: `${needs.length} ${needs.length === 1 ? "visit has" : "visits have"} no observer`, sub: needs.slice(0, 2).map((v) => `${visitLabel(v)} · ${v.classroom?.name} · ${fmtDateTime(v.scheduled_for)}`).join(" · "), href: `/visits/new?visit=${needs[0]?.id}` },
    unanswered.length && { tone: "soon", title: `${unanswered.length} ${unanswered.length === 1 ? "invite" : "invites"} not answered`, sub: Array.from(new Set(unanswered.map((v) => v.assignee?.full_name).filter(Boolean))).join(", "), href: "/visits" },
    overdueReports.length && { tone: "late", title: `${overdueReports.length} ${overdueReports.length === 1 ? "report" : "reports"} not filed after 24 hours`, sub: "Chase the observer", href: "/visits" },
  ].filter(Boolean) as { tone: "late" | "soon"; title: string; sub: string; href: string }[];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Education coordinator" title="QA calendar"
        sub="Book, reassign and chase visits. You see the status of each visit, never scores or private notes."
        actions={<LinkButton href="/visits/new" icon="plus">Book a visit</LinkButton>} />

      <section className="space-y-2.5">
        <h2 className="label-mono">{asks.length ? `Needs you · ${asks.length}` : "Nothing needs you right now"}</h2>
        {asks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {asks.map((a) => (
              <Link key={a.title} href={a.href} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-brand">
                <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", a.tone === "late" ? "bg-tier4-bg text-tier4" : "bg-tier3-bg text-tier3")}><Icon name={a.tone === "late" ? "alert" : "send"} className="h-4 w-4" /></span>
                <span><b className="block text-[14.5px] text-ink">{a.title}</b><span className="mt-0.5 block text-[13px] text-ink-600">{a.sub}</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle icon="calendar" sub="Sunday to Thursday, this week">This week</CardTitle>
          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-5 gap-2.5">
              {days.map((d) => {
                const items = week.filter((v) => new Date(v.scheduled_for).toDateString() === d.toDateString());
                const today = d.toDateString() === now.toDateString();
                return (
                  <div key={d.toISOString()} className="space-y-2">
                    <div className={cx("label-mono", today && "!text-brand")}>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}{today ? " · today" : ""}</div>
                    {items.length === 0 && <div className="rounded-xl border border-dashed border-hairline p-3 text-[13px] text-ink-500">No visits</div>}
                    {items.map((v) => (
                      <Link key={v.id} href={`/visits/${v.id}`} className={cx("block space-y-1 rounded-xl border p-3", !v.assignee_id ? "border-[#F3C3C7] bg-tier4-bg" : "border-hairline bg-white hover:border-brand")}>
                        <b className="block text-[13.5px] text-ink">{visitLabel(v)} · {v.classroom?.name}</b>
                        <span className="block font-mono text-[12px] text-ink-600">{new Date(v.scheduled_for).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {v.assignee?.full_name?.split(" ")[0] ?? "no observer"}</span>
                        <Badge tone={v.status === "accepted" ? "green" : v.status === "invited" ? "amber" : v.submitted_at ? "brand" : "neutral"}>{v.submitted_at ? (v.release_status === "released" ? "Released" : "Filed") : STATUS_LABEL[v.status] ?? v.status}</Badge>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle icon="users" sub="Visits booked this week, per observer">QAers this week</CardTitle>
            {load.size === 0 ? <Empty title="No visits booked this week" /> : (
              <ul className="divide-y divide-line">
                {Array.from(load.values()).sort((a, b) => b.n - a.n).map((q) => (
                  <li key={q.name} className="flex items-center justify-between py-2.5 text-[14px]"><span className="font-semibold text-ink">{q.name}</span><span className="font-mono text-[12.5px] text-ink-600">{q.n} {q.n === 1 ? "visit" : "visits"}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Notice tone="brand" title="Status only">Coordinators book and chase. Scores, private notes and composites stay with Education and the segment owner.</Notice>
        </div>
      </div>
    </div>
  );
}
