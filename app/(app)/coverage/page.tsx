import { PRD, coverage } from "@/lib/prd";
import { Badge, Card, PageHeader, cx } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "PRD coverage" };

export default function Coverage() {
  const c = coverage();
  const pct = Math.round((c.built / c.total) * 100);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Audit · PRD 25 Oct 2026" title="PRD coverage"
        sub="Every requirement in the Education Quality and Approvals PRD, where it lives in this build, and what still depends on Portal v2, ERPNext or the CODED App." />
      <section className="blueprint grid gap-6 rounded-2xl p-6 text-white md:grid-cols-[auto_minmax(0,1fr)] md:p-8">
        <div className="grid h-36 w-36 place-items-center border-2 border-white">
          <div className="text-center"><div className="text-[44px] font-extrabold leading-none tabular-nums">{pct}%</div><div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/60">built</div></div>
        </div>
        <div className="self-center">
          <div className="text-[20px] font-bold">{c.built} of {c.total} requirements are working in this build.</div>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/70">The {c.partial} partial items work end to end here, on sample data, and need an outside system for the last step: the live Portal v2 feed, writing into ERPNext, email delivery, the Trainer Learning Path API and the CODED App changes for who graded and who took attendance.</p>
          <div className="mt-4 h-2 max-w-xl overflow-hidden bg-white/15"><div className="h-full bg-[#8DA4FF]" style={{ width: `${pct}%` }} /></div>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        {PRD.map((g) => (
          <Card key={g.key} pad={false}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-[14.5px] font-semibold text-navy">{g.title}</h2>
              <span className="text-[12.5px] tabular-nums text-ink-500">{g.reqs.filter((r) => r.status === "built").length}/{g.reqs.length}</span>
            </div>
            <ul className="divide-y divide-line">
              {g.reqs.map((r) => (
                <li key={r.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-2.5">
                  <span className="pt-0.5 text-[12px] font-bold tabular-nums text-brand">{r.id}</span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink">{r.title}</div>
                    <div className="text-[12px] text-ink-500">{r.where}{r.note ? ` — ${r.note}` : ""}</div>
                  </div>
                  <span className="flex items-center gap-1.5">
                    {r.priority && <span className="text-[11px] font-semibold text-ink-400">{r.priority}</span>}
                    <span className={cx("grid h-5 w-5 place-items-center", r.status === "built" ? "bg-tier1 text-white" : "bg-tier3-bg text-tier3")} title={r.status}>
                      <Icon name={r.status === "built" ? "check" : "clock"} className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="flex gap-3 text-[12.5px] text-ink-500"><Badge tone="green">Built</Badge> works here end to end · <Badge tone="amber">Partial</Badge> works here; the last step needs an outside system</div>
    </div>
  );
}
