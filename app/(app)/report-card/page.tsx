import { notFound } from "next/navigation";
import { getMe } from "@/lib/session";
import { loadPerson } from "@/lib/person";
import { db } from "@/lib/supabase";
import { Badge, Empty, Field, Notice, input, tierColor } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand";
import { PrintButton } from "@/components/print-button";
import { reportCardAck } from "@/app/actions";
import { COMPONENT, SEGMENT, TIER, fmtDate, num, periodLabel } from "@/lib/format";

export const metadata = { title: "Report card" };

export default async function ReportCard({ searchParams }: { searchParams: Promise<{ person?: string; period?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  const personId = sp.person ?? me.id;
  const d = await loadPerson(personId);
  if (!d.person) notFound();
  const self = personId === me.id;
  const periods = d.composites.map((c) => c.period).reverse();
  const period = sp.period ?? periods[0];
  const c = d.composites.find((x) => x.period === period);
  const supabase = await db();
  const { data: visits } = await supabase.from("released_feedback").select("title, one_thing, body, released_at, visit:visits(qa_type, kind, week_no)").eq("subject_id", personId).order("released_at", { ascending: false }).limit(6);
  const card = d.reportCards.find((r) => r.period === period);
  const comps = (c?.components ?? {}) as Record<string, any>;
  const segs = Array.from(new Set(d.contracts.map((x) => x.segment_id).filter(Boolean))) as string[];
  const plan = d.plans.find((p) => p.status === "open");

  if (!c) return <div className="space-y-4"><Empty title="No report card yet" sub="A report card appears once a quarter's composite is computed." /></div>;
  const t = c.tier ? TIER[c.tier as 1 | 2 | 3 | 4] : null;

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <form className="flex items-center gap-2">
          {sp.person && <input type="hidden" name="person" value={sp.person} />}
          <select name="period" defaultValue={period} className={`${input} w-auto`}>{periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}</select>
          <button className="h-9 rounded-lg px-3 text-[13px] font-medium text-navy ring-1 ring-line hover:bg-white">Show</button>
        </form>
        <PrintButton />
      </div>

      <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
        <header className="blueprint flex flex-wrap items-center justify-between gap-6 px-8 py-7 text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
          <div className="flex items-center gap-4">
            <Logo className="w-[110px]" />
            <div className="border-l border-white/20 pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Quarterly Report Card</div>
              <div className="text-[18px] font-bold">{periodLabel(period)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-extrabold tracking-tight">{d.person.full_name}</div>
            <div className="text-[12.5px] text-white/65">{d.person.erp_instructor_level ?? d.person.qs_instructor_level ?? d.person.erp_service_category ?? "Educator"}{segs.length ? ` · ${segs.map((s) => SEGMENT[s]).join(", ")}` : ""}</div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line px-8 py-7 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center border-2 border-navy py-5 text-center">
            <div className="text-[56px] font-extrabold leading-none tabular-nums" style={{ color: tierColor(c.total) }}>{num(c.total)}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Composite{c.provisional ? " · provisional" : ""}</div>
            {t && <div className="mt-3 text-[14px] font-bold text-navy">{t.label} · {t.name}</div>}
          </div>
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">How it was built</h2>
            <table className="mt-3 w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {(["qa", "ops", "r360", "acc"] as const).map((k) => (
                  <tr key={k}>
                    <td className="py-2 font-medium text-navy">{COMPONENT[k].label}</td>
                    <td className="py-2 text-ink-500">{comps[k]?.weight ?? 0}%</td>
                    <td className="w-1/3 py-2"><div className="h-1.5 w-full rounded-full bg-canvas"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Number(comps[k]?.score ?? 0))}%`, background: tierColor(comps[k]?.score) }} /></div></td>
                    <td className="py-2 text-right font-bold tabular-nums">{comps[k]?.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t && <p className="mt-4 text-[12.5px] text-ink-600"><b>What this tier means:</b> {t.action}.</p>}
            {c.provisional && <p className="mt-2 text-[12.5px] text-tier3">Provisional: {c.gate_failures.join("; ")}.</p>}
          </div>
        </section>

        <section className="grid gap-6 border-b border-line px-8 py-7 md:grid-cols-2">
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">The One Thing</h2>
            {visits && visits.find((v: any) => v.one_thing) ? (
              <p className="mt-2 text-[16px] font-semibold leading-snug text-navy">“{(visits as any[]).find((v) => v.one_thing).one_thing}”</p>
            ) : <p className="mt-2 text-[13px] text-ink-500">No released QA feedback this quarter.</p>}
            <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Released feedback</h2>
            <ul className="mt-2 space-y-2 text-[12.5px]">
              {((visits ?? []) as any[]).slice(0, 4).map((v, i) => <li key={i} className="border-l-2 border-line pl-3"><b className="text-navy">{v.title}</b> · {fmtDate(v.released_at)}<div className="line-clamp-2 text-ink-600">{v.body}</div></li>)}
            </ul>
          </div>
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Trend</h2>
            <div className="mt-3 flex h-[120px] items-end gap-3">
              {d.composites.slice(-4).map((x) => (
                <div key={x.period} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[11.5px] font-bold tabular-nums">{num(x.total, 0)}</span>
                  <div className="w-full" style={{ height: `${Math.max(6, Number(x.total ?? 0) - 40)}px`, background: x.period === period ? "#14243F" : "#D5DBE6" }} />
                  <span className="text-[10.5px] text-ink-500">{x.period.replace("20", "").replace("-", " ")}</span>
                </div>
              ))}
            </div>
            {plan && (
              <div className="mt-6 rounded-lg border border-[#F5DDAF] bg-tier3-bg p-3 text-[12.5px]">
                <b>{plan.kind === "coaching" ? "Coaching Plan" : "Formal Improvement Plan"}</b> · due {fmtDate(plan.due)}
                <ul className="mt-1 list-disc pl-4">{(plan.goals as any[]).map((g, i) => <li key={i} className={g.done ? "line-through opacity-60" : ""}>{g.goal}</li>)}</ul>
              </div>
            )}
            {d.person.cctp_cert && <div className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-tier1"><Icon name="award" className="h-4 w-4" /> CODED Certified {d.person.cctp_cert === "CCT" ? "Trainer" : "Trainer Associate"}</div>}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 px-8 py-5 text-[11.5px] text-ink-500">
          <span>Computed {fmtDate(c.computed_at)} · weights QA 50 · Ops 20 · 360° 20 · Accountability 10</span>
          <span>{card?.acknowledged_at ? <span className="inline-flex items-center gap-1 font-semibold text-tier1"><Icon name="check" className="h-3.5 w-3.5" /> Acknowledged {fmtDate(card.acknowledged_at)}</span> : "Not yet acknowledged"}</span>
        </footer>
      </article>

      {card?.comment && <Notice tone="green" title="Educator's comment">{card.comment}</Notice>}
      {self && !card?.acknowledged_at && (
        <div className="no-print rounded-xl border border-line bg-white p-5">
          <ActionForm action={reportCardAck} className="space-y-3">
            <input type="hidden" name="period" value={period} />
            <Field label="Comment (optional)"><textarea name="comment" rows={2} className={input} placeholder="Anything you would like your segment owner to know" /></Field>
            <Submit icon="check">Acknowledge report card</Submit>
          </ActionForm>
        </div>
      )}
      {!self && <Badge tone="neutral">Viewing as {me.full_name}</Badge>}
    </div>
  );
}
