import { db } from "@/lib/supabase";
import { getMe } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { ScheduleForm } from "@/components/schedule-form";

export const metadata = { title: "Schedule a visit" };

export default async function NewVisit({ searchParams }: { searchParams: Promise<{ visit?: string; cohort?: string }> }) {
  const { visit, cohort } = await searchParams;
  await getMe();
  const supabase = await db();
  const [{ data: cohorts }, { data: people }, { data: templates }, { data: avail }, existing] = await Promise.all([
    supabase.from("cohorts").select("id, name, status, start_date, classrooms(id, name, classroom_staff(role, person:people(id, full_name))), cohort_roles(role, person:people(id, full_name))").in("status", ["live", "setup"]).order("start_date"),
    supabase.from("people").select("id, full_name, roles, is_full_timer").order("full_name"),
    supabase.from("qa_templates").select("id, name, kind, focus, is_special, status").neq("status", "retired"),
    supabase.from("erp_availability").select("*"),
    visit ? supabase.from("visits").select("*").eq("id", visit).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const staffPeople = (people ?? []).filter((p: any) => p.roles.some((r: string) => ["education_officer", "senior_instructor", "education_principal", "operations", "segment_owner"].includes(r)));
  const v: any = existing.data;
  const initial = v ? {
    ...v,
    date: v.scheduled_for ? new Date(new Date(v.scheduled_for).getTime() + 3 * 36e5).toISOString().slice(0, 10) : "",
    time: v.scheduled_for ? new Date(new Date(v.scheduled_for).getTime() + 3 * 36e5).toISOString().slice(11, 16) : "09:30",
  } : cohort ? { cohort_id: cohort } : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/visits", label: "Visits" }} eyebrow="D3 · schedule a visit" title={v ? "Assign or reschedule a visit" : "Schedule a visit"}
        sub="Pick the observer, the type, the focus and the template. Availability comes from ERPNext." />
      <Card>
        <ScheduleForm
          initial={initial}
          cohorts={(cohorts ?? []).map((c: any) => ({
            id: c.id, name: c.name,
            classrooms: c.classrooms.sort((a: any, b: any) => (a.name > b.name ? 1 : -1)).map((cl: any) => ({ id: cl.id, name: cl.name, staff: cl.classroom_staff.map((s: any) => ({ id: s.person.id, name: s.person.full_name, role: s.role })) })),
            overseers: c.cohort_roles.filter((r: any) => r.role === "overseer").map((r: any) => ({ id: r.person.id, name: r.person.full_name })),
          }))}
          people={staffPeople.map((p: any) => ({ id: p.id, name: p.full_name, roles: p.roles, full_timer: p.is_full_timer,
            unavailable: (avail ?? []).filter((a: any) => a.person_id === p.id).map((a: any) => ({ from: a.from_date, to: a.to_date })) }))}
          templates={(templates ?? []).map((t: any) => ({ id: t.id, name: t.name, kind: t.kind, focus: t.focus, special: t.is_special, status: t.status }))}
        />
      </Card>
    </div>
  );
}
