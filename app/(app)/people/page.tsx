import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, PageHeader, Stat, Table, TierBadge, td, tierColor } from "@/components/ui";
import { SEGMENT, currentPeriod, num } from "@/lib/format";

export const metadata = { title: "People" };

export default async function People() {
  const me = await getMe();
  const supabase = await db();
  const period = currentPeriod();
  const [{ data: people }, { data: comps }, { data: contracts }, { data: plans }] = await Promise.all([
    supabase.from("people").select("*").order("full_name"),
    supabase.from("composites").select("person_id, total, tier, provisional").eq("period", period),
    supabase.from("erp_contracts").select("person_id, status, rate, rate_type, segment_id").eq("status", "Active"),
    supabase.from("plans").select("person_id, kind, due").eq("status", "open"),
  ]);
  const comp = new Map((comps ?? []).map((c: any) => [c.person_id, c]));
  const con = new Map<string, any>();
  (contracts ?? []).forEach((c: any) => con.set(c.person_id, c));
  const plan = new Map((plans ?? []).map((p: any) => [p.person_id, p]));
  const educators = (people ?? []).filter((p: any) => p.erp_supplier_id);
  const staff = (people ?? []).filter((p: any) => !p.erp_supplier_id);
  const hr = has(me, "hr");

  return (
    <div>
      <PageHeader eyebrow={hr ? "HR" : "Directory"} title="People"
        sub={hr ? "Composite, tier and plans for every educator; contracts and rates from ERPNext. Private evaluator notes are never shown to HR." : "Educators and staff. What you see of each record depends on your role."} />
      {hr && (
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Educators" value={educators.length} icon="users" />
          <Stat label="Cleared to teach" value={educators.filter((p: any) => p.approval_status === "cleared").length} icon="check" tone="green" />
          <Stat label="In approval" value={educators.filter((p: any) => p.approval_status === "in_pipeline").length} icon="user-check" tone="amber" />
          <Stat label="Open plans" value={plan.size} icon="flag" tone={plan.size ? "red" : undefined} />
        </div>
      )}
      <Card pad={false} className="px-5 pb-2 pt-4">
        <Table head={["Educator", "Level", "Segment", "Approval", "This quarter", hr ? "Contract and rate" : "Plan"]}>
          {educators.map((p: any) => {
            const c: any = comp.get(p.id);
            const k = con.get(p.id);
            const pl: any = plan.get(p.id);
            return (
              <tr key={p.id} className="hover:bg-canvas/60">
                <td className={td}>
                  <Link href={`/people/${p.id}`} className="flex items-center gap-2.5">
                    <Avatar name={p.full_name} size={30} />
                    <span><span className="block font-medium text-navy hover:text-brand">{p.full_name}</span><span className="block font-mono text-[11px] text-ink-400">{p.erp_supplier_id}</span></span>
                  </Link>
                </td>
                <td className={td}>{p.erp_instructor_level ?? p.qs_instructor_level ?? p.erp_service_category}</td>
                <td className={td}>{p.home_segment ? SEGMENT[p.home_segment] : "—"}</td>
                <td className={td}><Badge tone={p.approval_status === "cleared" ? "green" : p.approval_status === "in_pipeline" ? "amber" : "neutral"}>{p.approval_status === "cleared" ? "Cleared" : p.approval_status === "in_pipeline" ? "In pipeline" : p.approval_status.replace("_", " ")}</Badge></td>
                <td className={td}>{c ? <span className="flex items-center gap-2"><span className="font-mono font-semibold" style={{ color: tierColor(c.total) }}>{num(c.total)}</span><TierBadge tier={c.tier} provisional={c.provisional} /></span> : <span className="text-ink-400">—</span>}</td>
                <td className={td}>
                  {hr ? (k ? <span className="font-mono text-[12.5px]">{k.rate ? `${k.rate} KWD / ${k.rate_type === "hourly" ? "hr" : k.rate_type === "daily" ? "day" : "contract"}` : "Fixed"}</span> : <span className="text-ink-400">No active contract</span>)
                    : pl ? <Badge tone="amber">{pl.kind === "coaching" ? "Coaching Plan" : "Improvement Plan"}</Badge> : <span className="text-ink-400">—</span>}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-navy">Staff</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((p: any) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-card">
            <Avatar name={p.full_name} size={34} tone="navy" />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-navy">{p.full_name}</div>
              <div className="truncate text-[12px] text-ink-500">{p.roles.map((r: string) => r.replace(/_/g, " ")).join(", ")}{p.owned_segments.length ? ` · ${p.owned_segments.map((s: string) => SEGMENT[s]).join(", ")}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
