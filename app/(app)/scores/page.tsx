import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Notice, PageHeader, ScoreBar, Table, TierBadge, td, tierColor } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { compositesCompute } from "@/app/actions";
import { SEGMENT, TIER, ago, currentPeriod, num, periodLabel } from "@/lib/format";

export const metadata = { title: "Scores" };

export default async function Scores({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getMe();
  const supabase = await db();
  const period = (await searchParams).period ?? currentPeriod();
  const [{ data: comps }, { data: periods }, { data: tpl }] = await Promise.all([
    supabase.from("composites").select("*, person:people!composites_person_id_fkey(id, full_name)").eq("period", period).order("total", { ascending: false }),
    supabase.from("composites").select("period"),
    supabase.from("scoring_templates").select("*").eq("active", true),
  ]);
  const list = (comps ?? []) as any[];
  const allPeriods = Array.from(new Set<string>((periods ?? []).map((p: any) => String(p.period)))).sort().reverse();
  const segs = has(me, "segment_owner") ? me.owned_segments : has(me, "education_principal", "system_owner") ? ["pro", "youth", "kids"] : [];
  const def = (tpl ?? []).find((t: any) => t.scope_type === "default");

  return (
    <div>
      <PageHeader eyebrow="F · scoring and composite" title="Scores"
        sub={`The composite is computed, not negotiated. Default weights: QA observation ${def?.weights.qa}%, operations QA ${def?.weights.ops}%, classroom 360° ${def?.weights.r360}%, accountability ${def?.weights.acc}%. Target 90, floor 85.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {allPeriods.map((p) => <Link key={p} href={`/scores?period=${p}`} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset ${p === period ? "bg-navy text-white ring-navy" : "bg-white text-ink-600 ring-line"}`}>{p}</Link>)}
          </div>
        } />

      {segs.length > 0 && period === currentPeriod() && (
        <Card className="mb-6">
          <CardTitle icon="refresh" sub="Reads QA visits, operations QA, 360° reviews and CODED App records, applies the scoring template and validity gates, and opens Coaching or Improvement Plans for final Tier 3 and 4 scores.">Quarter close in one click</CardTitle>
          <div className="flex flex-wrap gap-3">
            {segs.map((s) => (
              <ActionForm key={s} action={compositesCompute}>
                <input type="hidden" name="period" value={period} /><input type="hidden" name="segment" value={s} />
                <Submit variant="secondary" icon="refresh">Recompute {SEGMENT[s]}</Submit>
              </ActionForm>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((t) => (
          <div key={t} className="rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between"><TierBadge tier={t} /><span className="tabular-nums text-[22px] font-semibold" style={{ color: tierColor([95, 87, 80, 70][t - 1]) }}>{list.filter((c) => c.tier === t).length}</span></div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-500">{TIER[t as 1].range} · {TIER[t as 1].action}</p>
          </div>
        ))}
      </div>

      <Card pad={false} className="px-5 pb-2 pt-4">
        <div className="mb-2 text-[13px] font-semibold text-navy">{periodLabel(period)}</div>
        {list.length === 0 ? <Notice tone="brand">No scores for this period yet.</Notice> : (
          <Table head={["Person", "Role", "QA", "Ops QA", "360°", "Acc.", "Composite", "Tier"]}>
            {list.map((c) => {
              const k = c.components as any;
              return (
                <tr key={c.id} className="hover:bg-canvas/60">
                  <td className={td}><Link href={`/people/${c.person.id}`} className="font-medium text-navy hover:text-brand">{c.person.full_name}</Link><div className="text-[11px] text-ink-500">{SEGMENT[c.segment_id]} · {ago(c.computed_at)}</div></td>
                  <td className={td}>{c.role === "ta" ? "TA" : "Instructor"}</td>
                  {(["qa", "ops", "r360", "acc"] as const).map((x) => <td key={x} className={`${td} tabular-nums`} style={{ color: tierColor(k[x]?.score) }}>{k[x]?.score ?? <span className="text-ink-300">—</span>}</td>)}
                  <td className={td}><div className="flex w-36 items-center gap-2"><span className="w-10 tabular-nums font-semibold" style={{ color: tierColor(c.total) }}>{num(c.total)}</span><ScoreBar value={c.total} showMarks={false} height="h-1.5" /></div></td>
                  <td className={td}><TierBadge tier={c.tier} provisional={c.provisional} />{c.provisional && <div className="mt-1 max-w-[220px] text-[11px] text-ink-500">{c.gate_failures.join("; ")}</div>}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {!has(me, "segment_owner", "education_principal", "hr", "gm", "system_owner") && <p className="mt-4 text-[12px] text-ink-500"><Badge>Lead Instructor</Badge> You see your own score and your TAs' only.</p>}
    </div>
  );
}
