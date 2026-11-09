import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, PageHeader, StatusBadge, cx } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { onboardingComplete } from "@/app/actions";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "QAer onboarding" };

const STEPS = [
  { icon: "doc", t: "Before", d: "Open the visit page: classroom, team, session plan and App signals. Earlier QA scores are hidden on purpose so you walk in without a bias." },
  { icon: "eye", t: "During", d: "Score what you see. Mark anything you could not observe as unobserved — it is left out of the score, not counted as zero. Signal or Intervene only when trainees are at risk." },
  { icon: "star", t: "The One Thing", d: "Close with one change that would make the biggest difference. 'Suggest' drafts it from the lowest-scoring item; edit it in your own words." },
  { icon: "send", t: "After", d: "Submit within 24 hours. Notes stay private: the segment owner releases a summary to the educator, never your raw notes." },
];

export default async function Onboarding() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: templates }, { data: done }, { data: people }] = await Promise.all([
    supabase.from("qa_templates").select("key, name, kind, focus, subjects, rubric, status, segment_id, is_special, version").neq("status", "retired").order("kind").order("name"),
    supabase.from("qaer_onboarding").select("person_id, template_key, completed_at"),
    supabase.from("people").select("id, full_name, roles").or("roles.cs.{education_officer},roles.cs.{senior_instructor},roles.cs.{operations},roles.cs.{education_principal}"),
  ]);
  const mine = new Map(((done ?? []) as any[]).filter((d) => d.person_id === me.id).map((d) => [d.template_key, d.completed_at]));
  const relevant = ((templates ?? []) as any[]).filter((t) => has(me, "operations") && !has(me, "education_principal", "senior_instructor", "education_officer") ? t.kind !== "education_qa" : true);
  const progress = relevant.length ? Math.round((relevant.filter((t) => mine.has(t.key)).length / relevant.length) * 100) : 0;
  const lead = has(me, "education_principal", "senior_instructor");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Before a first visit" title="QAer onboarding"
        sub="Walk through each template you will use, then mark it complete. From migration 0010 you cannot accept your first visit of a kind until you have finished onboarding on its template." />

      <section className="blueprint rounded-2xl p-6 text-white md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Your onboarding</div>
            <div className="mt-2 text-[40px] font-extrabold leading-none tabular-nums">{progress}%</div>
            <div className="mt-1 text-[14px] text-white/70">{relevant.filter((t) => mine.has(t.key)).length} of {relevant.length} templates complete</div>
          </div>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[#8DA4FF]" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.t} className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold"><span className="grid h-6 w-6 place-items-center bg-white text-[11px] font-bold text-navy">{i + 1}</span>{s.t}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {relevant.map((t) => {
          const roles = Object.keys(t.rubric ?? {});
          const completed = mine.get(t.key);
          return (
            <Card key={t.key} className={cx(completed && "border-[#BFE5D5]")}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold text-navy">{t.name}</h2><StatusBadge status={t.status} />{t.segment_id && <Badge tone="brand">{t.segment_id}</Badge>}</div>
                  <div className="mt-0.5 text-[13px] text-ink-500">Scores: {roles.join(", ")} · v{t.version}</div>
                </div>
                {completed ? <Badge tone="green"><Icon name="check" className="h-3 w-3" />Done {fmtDate(completed)}</Badge> : <Badge tone="amber">To do</Badge>}
              </div>
              <details className="group rounded-lg border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13.5px] font-medium text-navy">Walk through the rubric <Icon name="arrow" className="h-3.5 w-3.5 transition group-open:rotate-90" /></summary>
                <div className="space-y-3 border-t border-line p-3">
                  {roles.map((r) => (
                    <div key={r}>
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-brand">{t.rubric[r].label ?? r}</div>
                      {(t.rubric[r].sections ?? []).map((sec: any) => (
                        <div key={sec.key} className="mt-1.5">
                          <div className="text-[13px] font-semibold text-ink-600">{sec.label}</div>
                          <ul className="mt-1 space-y-1">
                            {sec.items.map((it: any) => <li key={it.key} className="flex justify-between gap-3 text-[13px]"><span>{it.label}</span><span className="tabular-nums text-ink-500">{it.max ?? "✓"}</span></li>)}
                          </ul>
                        </div>
                      ))}
                      {(t.rubric[r].items ?? []).map((it: any) => <div key={it.key} className="mt-1 text-[13px]">• {it.label}</div>)}
                    </div>
                  ))}
                </div>
              </details>
              {!completed && (
                <ActionForm action={onboardingComplete} className="mt-3">
                  <input type="hidden" name="key" value={t.key} />
                  <label className="mb-3 flex items-start gap-2 text-[13px] text-ink-600"><input type="checkbox" required className="mt-0.5 accent-[#14243F]" /> I have read every item and know how to mark areas I cannot observe.</label>
                  <Submit size="sm" icon="check">Mark complete</Submit>
                </ActionForm>
              )}
            </Card>
          );
        })}
      </div>

      {lead && (
        <Card>
          <CardTitle icon="users" sub="Who has completed which template.">Team readiness</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-ink-500"><th className="py-2 pr-3 font-semibold">QAer</th>{relevant.map((t) => <th key={t.key} className="px-2 py-2 font-semibold">{t.name.replace(/^Education QA — |^Operations QA — /, "")}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {((people ?? []) as any[]).map((p) => {
                  const set = new Set(((done ?? []) as any[]).filter((d) => d.person_id === p.id).map((d) => d.template_key));
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-3"><span className="flex items-center gap-2 font-medium text-navy"><Avatar name={p.full_name} size={24} />{p.full_name}</span></td>
                      {relevant.map((t) => <td key={t.key} className="px-2 py-2 text-center">{set.has(t.key) ? <Icon name="check" className="mx-auto h-4 w-4 text-tier1" /> : <span className="text-ink-300">·</span>}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
