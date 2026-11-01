import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, PageHeader, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtTime, visitLabel } from "@/lib/format";

export const metadata = { title: "Calendar" };

type Ev = { id: string; at: string; title: string; sub: string; href: string; tone: "navy" | "brand" | "green" | "amber" | "red" | "neutral"; icon: string; mine: boolean };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const kwDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuwait" }));
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ w?: string; mine?: string }> }) {
  const sp = await searchParams;
  const offset = Number(sp.w ?? 0) || 0;
  const onlyMine = sp.mine === "1";
  const me = await getMe();
  const supabase = await db();

  const today = kwDate(new Date());
  const start = new Date(today); start.setDate(today.getDate() - today.getDay() + offset * 7); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  const from = new Date(`${key(start)}T00:00:00+03:00`).toISOString(), to = new Date(`${key(end)}T00:00:00+03:00`).toISOString();

  const [visits, mcs, cctp, cohorts, away] = await Promise.all([
    supabase.from("visits").select("id, kind, qa_type, mode, status, scheduled_for, assignee_id, assignee:people!visits_assignee_id_fkey(full_name), cohort:cohorts(name), classroom:classrooms(name)").gte("scheduled_for", from).lt("scheduled_for", to).neq("status", "cancelled"),
    supabase.from("master_classes").select("id, title, kind, scheduled_for, instructor_id, instructor:people!master_classes_instructor_id_fkey(full_name), cohort:cohorts(name)").gte("scheduled_for", from).lt("scheduled_for", to),
    supabase.from("cctp_bookings").select("id, scheduled_for, person_id, status, person:people!cctp_bookings_person_id_fkey(full_name)").gte("scheduled_for", from).lt("scheduled_for", to),
    supabase.from("cohorts").select("id, name, start_date, end_date, status"),
    supabase.from("erp_availability").select("person_id, from_date, to_date, note, person:people(full_name)").lte("from_date", key(end)).gte("to_date", key(start)),
  ]);

  const ev: Ev[] = [];
  for (const v of (visits.data ?? []) as any[]) ev.push({ id: "v" + v.id, at: v.scheduled_for, title: visitLabel(v), sub: `${v.cohort?.name?.split(" — ")[0]} · ${v.classroom?.name ?? ""} · ${v.assignee?.full_name ?? "needs an observer"}`,
    href: has(me, "segment_owner", "education_principal", "senior_instructor", "education_officer", "operations") ? `/visits/${v.id}` : "#", tone: v.kind === "shadowing" ? "neutral" : v.qa_type === "operations" ? "amber" : "brand", icon: "clipboard", mine: v.assignee_id === me.id });
  for (const m of (mcs.data ?? []) as any[]) ev.push({ id: "m" + m.id, at: m.scheduled_for, title: m.kind === "master_class" ? "Master class" : "Challenge", sub: `${m.title} · ${m.instructor.full_name}`, href: "/master-classes", tone: "navy", icon: "star", mine: m.instructor_id === me.id });
  for (const b of (cctp.data ?? []) as any[]) ev.push({ id: "c" + b.id, at: b.scheduled_for, title: "CCTP mock class", sub: b.person.full_name, href: "/cctp", tone: "green", icon: "award", mine: b.person_id === me.id });
  const shown = onlyMine ? ev.filter((e) => e.mine) : ev;

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = new Map<string, Ev[]>();
  for (const e of shown) { const k = key(kwDate(new Date(e.at))); byDay.set(k, [...(byDay.get(k) ?? []), e].sort((a, b) => a.at.localeCompare(b.at))); }
  const markers = (d: string) => ((cohorts.data ?? []) as any[]).flatMap((c) => c.start_date === d ? [`${c.name.split(" — ")[0]} starts`] : c.end_date === d ? [`${c.name.split(" — ")[0]} ends`] : []);
  const awayOn = (d: string) => ((away.data ?? []) as any[]).filter((a) => a.from_date <= d && a.to_date >= d);
  const range = `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(end.getTime() - 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const q = (w: number, m = onlyMine) => `/calendar?w=${w}${m ? "&mine=1" : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="D3 · X4 · schedule" title="Calendar"
        sub="Visits, master classes and CCTP mock classes, with cohort dates and ERPNext unavailability. Add anything to Outlook or Google Calendar with the .ics download."
        actions={<>
          <a href="/calendar/ics" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13.5px] font-medium text-navy ring-1 ring-inset ring-line hover:bg-canvas"><Icon name="download" className="h-4 w-4" /> My visits (.ics)</a>
        </>} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={q(offset - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white ring-1 ring-line hover:bg-canvas" aria-label="Previous week"><Icon name="back" className="h-4 w-4" /></Link>
          <Link href={q(0)} className="h-9 rounded-lg bg-white px-3 text-[13px] font-medium leading-9 ring-1 ring-line hover:bg-canvas">Today</Link>
          <Link href={q(offset + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white ring-1 ring-line hover:bg-canvas" aria-label="Next week"><Icon name="arrow" className="h-4 w-4" /></Link>
          <span className="ml-3 text-[15px] font-semibold text-navy">{range}</span>
        </div>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          <Link href={q(offset, false)} className={cx("rounded-md px-3 py-1.5 text-[12.5px] font-medium", !onlyMine ? "bg-navy text-white" : "text-ink-600")}>Everything I can see</Link>
          <Link href={q(offset, true)} className={cx("rounded-md px-3 py-1.5 text-[12.5px] font-medium", onlyMine ? "bg-navy text-white" : "text-ink-600")}>Only mine</Link>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-line bg-line md:grid-cols-7 md:gap-px">
        {days.map((d, i) => {
          const k = key(d);
          const isToday = k === key(today);
          const weekend = i >= 5;
          const list = byDay.get(k) ?? [];
          return (
            <div key={k} className={cx("min-h-[180px] border-b border-line p-2.5 md:border-0", weekend ? "bg-zebra" : "bg-white")}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className={cx("text-[11px] font-semibold uppercase tracking-wider", weekend ? "text-ink-400" : "text-ink-500")}>{DAYS[i]}</span>
                <span className={cx("grid h-7 min-w-7 place-items-center px-1 text-[14px] font-bold tabular-nums", isToday ? "bg-navy text-white" : "text-navy")}>{d.getDate()}</span>
              </div>
              {markers(k).map((m) => <div key={m} className="mb-1.5 truncate border-l-2 border-brand bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand">{m}</div>)}
              {awayOn(k).map((a, j) => <div key={j} className="mb-1.5 truncate px-1.5 text-[11px] text-ink-500" title={a.note ?? ""}><Icon name="x" className="inline h-3 w-3" /> {a.person?.full_name} away</div>)}
              <div className="space-y-1.5">
                {list.map((e) => (
                  <Link key={e.id} href={e.href} className={cx("block rounded-md border-l-[3px] px-2 py-1.5 text-[11.5px] leading-snug transition hover:shadow-card",
                    e.tone === "navy" ? "border-navy bg-navy-100" : e.tone === "brand" ? "border-brand bg-brand-50" : e.tone === "amber" ? "border-tier3 bg-tier3-bg" : e.tone === "green" ? "border-tier1 bg-tier1-bg" : "border-ink-400 bg-canvas",
                    e.mine && "ring-1 ring-navy")}>
                    <div className="flex items-center gap-1 font-semibold text-navy"><span className="tabular-nums">{fmtTime(e.at)}</span> · {e.title}</div>
                    <div className="truncate text-ink-600">{e.sub}</div>
                  </Link>
                ))}
                {list.length === 0 && !weekend && <div className="pt-6 text-center text-[11px] text-ink-300">—</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-[12px]">
        <Badge tone="brand">Education QA</Badge><Badge tone="amber">Operations QA</Badge><Badge>Shadowing</Badge><Badge tone="navy">Master class</Badge><Badge tone="green">CCTP mock class</Badge>
        <span className="text-ink-500">Outlined = assigned to you · Fri–Sat shaded</span>
      </div>
    </div>
  );
}
