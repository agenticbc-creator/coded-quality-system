import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

/** iCalendar feed of the signed-in person's visits, master classes and mock classes (D3). ?visit=<id> for one event. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in first", { status: 401 });
  const { data: me } = await supabase.from("people").select("id, full_name").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!me) return new Response("No profile", { status: 403 });

  const one = url.searchParams.get("visit");
  let vq = supabase.from("visits").select("id, kind, qa_type, scheduled_for, status, cohort:cohorts(name), classroom:classrooms(name, room)").neq("status", "cancelled").not("scheduled_for", "is", null);
  vq = one ? vq.eq("id", one) : vq.eq("assignee_id", me.id).gte("scheduled_for", new Date(Date.now() - 7 * 86400000).toISOString());
  const [{ data: visits }, { data: mcs }, { data: mocks }] = await Promise.all([
    vq,
    one ? Promise.resolve({ data: [] }) : supabase.from("master_classes").select("id, title, scheduled_for, cohort:cohorts(name)").eq("instructor_id", me.id),
    one ? Promise.resolve({ data: [] }) : supabase.from("cctp_bookings").select("id, scheduled_for").eq("person_id", me.id).eq("status", "booked"),
  ]);

  const events: string[] = [];
  const add = (uid: string, at: string, mins: number, summary: string, location: string, desc: string) => {
    const s = new Date(at), e = new Date(s.getTime() + mins * 60000);
    events.push(["BEGIN:VEVENT", `UID:${uid}@quality.joincoded.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(s)}`, `DTEND:${stamp(e)}`,
      `SUMMARY:${esc(summary)}`, `LOCATION:${esc(location)}`, `DESCRIPTION:${esc(desc)}`, "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", `DESCRIPTION:${esc(summary)}`, "END:VALARM", "END:VEVENT"].join("\r\n"));
  };
  for (const v of (visits ?? []) as any[]) {
    const label = v.kind === "shadowing" ? "Shadowing visit" : v.qa_type === "operations" ? "Operations QA visit" : "Education QA visit";
    add(`visit-${v.id}`, v.scheduled_for, 90, `${label} · ${v.cohort?.name ?? ""}`, [v.classroom?.name, v.classroom?.room].filter(Boolean).join(", "), `Open the visit in CODED Quality: ${url.origin}/visits/${v.id}`);
  }
  for (const m of (mcs ?? []) as any[]) add(`mc-${m.id}`, m.scheduled_for, 120, `Master class: ${m.title}`, m.cohort?.name ?? "", `${url.origin}/master-classes`);
  for (const b of (mocks ?? []) as any[]) add(`cctp-${b.id}`, b.scheduled_for, 60, "CCTP live mock class", "CODED", `${url.origin}/cctp`);

  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CODED//Quality System//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:CODED Quality · ${me.full_name}`, ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${one ? "coded-visit" : "coded-quality"}.ics"` } });
}
