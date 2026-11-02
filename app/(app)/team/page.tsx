import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { signalLevels } from "@/lib/person";
import { Avatar, Badge, Card, CardTitle, Empty, LinkButton, PageHeader } from "@/components/ui";
import { SignalGrid } from "@/components/performance";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "My team" };

/** For lead instructors: the TAs they lead, their released feedback and the classroom's live signals. Scores follow the same rules as everywhere else. */
export default async function Team() {
  const me = await getMe();
  const supabase = await db();
  const { data: mine } = await supabase.from("classroom_staff")
    .select("role, is_lead, classroom:classrooms(id, name, room, cohort:cohorts(id, name, status), classroom_staff(role, is_lead, person:people(id, full_name)))")
    .eq("person_id", me.id).eq("role", "instructor");
  const leading = ((mine ?? []) as any[]).filter((s) => s.classroom && (s.is_lead || has(me, "lead_instructor")) && s.classroom.cohort?.status !== "closed");
  const taIds = leading.flatMap((s) => s.classroom.classroom_staff.filter((x: any) => x.role === "ta").map((x: any) => x.person.id));
  const [{ data: released }, lv, signals] = await Promise.all([
    taIds.length ? supabase.from("released_feedback").select("subject_id, title, released_at, ack_at").in("subject_id", taIds).order("released_at", { ascending: false }) : Promise.resolve({ data: [] }),
    signalLevels(),
    Promise.all(leading.filter((s) => s.classroom.cohort?.status === "live").map(async (s) => ({ cl: s.classroom, data: (await supabase.rpc("live_signals", { p_classroom: s.classroom.id })).data }))),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lead instructor" title="My team" sub="The TAs in the classrooms you lead. You see what has been released to them, not private notes." />
      {leading.length === 0 ? <Card><Empty icon="users" title="You are not leading a classroom right now" sub="When you are the lead instructor on a live or upcoming cohort, your TAs appear here." /></Card> : leading.map((s) => {
        const tas = s.classroom.classroom_staff.filter((x: any) => x.role === "ta");
        return (
          <Card key={s.classroom.id}>
            <CardTitle icon="users" sub={`${s.classroom.cohort.name} · ${s.classroom.room ?? "room tbc"}`} right={<LinkButton href="/feedback/new" variant="secondary" icon="pen">Log feedback</LinkButton>}>{s.classroom.name}</CardTitle>
            {tas.length === 0 ? <p className="text-[13.5px] text-ink-500">No TAs assigned.</p> : (
              <ul className="divide-y divide-line">
                {tas.map((t: any) => {
                  const fb = ((released ?? []) as any[]).filter((r) => r.subject_id === t.person.id);
                  const open = fb.filter((r) => !r.ack_at).length;
                  return (
                    <li key={t.person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <Link href={`/people/${t.person.id}`} className="flex items-center gap-2.5 font-semibold text-ink hover:text-brand"><Avatar name={t.person.full_name} size={30} />{t.person.full_name}</Link>
                      <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-600">
                        {fb[0] ? <>Last released {fmtDate(fb[0].released_at)}</> : "Nothing released yet"}
                        {open > 0 && <Badge tone="amber">{open} not acknowledged</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
      {signals.filter((x) => x.data).map(({ cl, data }) => (
        <Card key={cl.id}><CardTitle icon="sun" sub="CODED App, this classroom">Live signals</CardTitle><SignalGrid title={cl.name} data={data} levels={lv.levels} draft={lv.draft} /></Card>
      ))}
    </div>
  );
}
