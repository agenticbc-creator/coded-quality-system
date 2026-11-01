import { notFound } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Field, KV, Notice, PageHeader, cx, input } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { pipelineMock, pipelineStep } from "@/app/actions";
import { SEGMENT, STEP, fmtDate, fmtDateTime } from "@/lib/format";

function canAct(me: any, step: string, segment: string) {
  const owner = me.roles.includes("segment_owner") && me.owned_segments.includes(segment);
  const edu = me.roles.includes("education_principal") || me.roles.includes("senior_instructor");
  return { criteria: edu, vetting: edu, onboarding: edu, mock1: edu, mock2: edu, selection_rate: owner, cleared: owner, contract: me.roles.includes("hr") }[step] ?? false;
}

export default async function Pipeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const supabase = await db();
  const [{ data: p }, { data: settings }, { data: mocks }, { data: contracts }] = await Promise.all([
    supabase.from("pipelines").select("*, person:people(*), program:programs(name), steps:pipeline_steps(*, by:people!pipeline_steps_done_by_fkey(full_name))").eq("id", id).maybeSingle(),
    supabase.from("settings").select("key, value, status").in("key", ["vetting_scorecard", "cctp_mock_rubric", "ta_checklist"]),
    supabase.from("mock_results").select("*, assessor:people!mock_results_assessor_id_fkey(full_name)").eq("pipeline_id", id).order("created_at"),
    supabase.from("erp_contracts").select("*"),
  ]);
  if (!p) notFound();
  const S = Object.fromEntries((settings ?? []).map((s: any) => [s.key, s])) as Record<string, any>;
  const steps = (p.steps ?? []).sort((a: any, b: any) => a.ord - b.ord);
  const current = steps.find((s: any) => s.status !== "done");
  const myStep = current && p.status === "in_pipeline" && canAct(me, current.step, p.segment_id);
  const contract = (contracts ?? []).filter((c: any) => c.person_id === p.person_id).sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1))[0];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={{ href: "/approvals/people", label: "People approvals" }} eyebrow={`${p.target_role === "ta" ? "TA" : "Instructor"} · ${SEGMENT[p.segment_id]}${p.program ? " · " + p.program.name : ""}`}
        title={<span className="flex items-center gap-3"><Avatar name={p.person.full_name} size={40} tone="navy" />{p.person.full_name}</span>}
        actions={<Badge tone={p.status === "cleared" ? "green" : p.status === "not_approved" ? "red" : "amber"}>{p.status === "cleared" ? "Cleared to teach" : p.status === "not_approved" ? "Not approved" : "In pipeline"}</Badge>} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle icon="user-check" sub="Nobody teaches without every step complete">Approval pipeline</CardTitle>
            <ol className="space-y-0">
              {steps.map((s: any, i: number) => {
                const active = current?.id === s.id && p.status === "in_pipeline";
                return (
                  <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < steps.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" />}
                    <span className={cx("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-4 ring-white",
                      s.status === "done" ? "bg-tier1 text-white" : s.status === "failed" ? "bg-tier4 text-white" : active ? "bg-tier3 text-white" : "bg-canvas text-ink-400")}>
                      {s.status === "done" ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> : s.status === "failed" ? <Icon name="x" className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cx("text-[14px] font-semibold", active ? "text-navy" : "text-ink")}>{STEP[s.step].label}</span>
                        <span className="text-[12px] text-ink-500">{STEP[s.step].owner}</span>
                        {active && <Badge tone="amber">Waiting since {fmtDate(s.opened_at)}</Badge>}
                      </div>
                      {s.done_at && <div className="text-[12px] text-ink-500">{s.status === "failed" ? "Not passed" : "Done"} by {s.by?.full_name} · {fmtDateTime(s.done_at)}</div>}
                      {s.notes && <p className="mt-1 text-[13px] text-ink-600">{s.notes}</p>}
                      {s.data?.total !== undefined && s.step === "vetting" && <p className="mt-1 text-[12.5px]">Scorecard <b className="font-mono">{s.data.total}</b>/100 · {s.data.recommend ? "recommended" : "not recommended"}</p>}
                      {s.data?.rate && <p className="mt-1 text-[12.5px]">Rate <b className="font-mono">{s.data.rate} KWD</b> / {s.data.rate_type === "hourly" ? "hour" : s.data.rate_type}</p>}
                      {s.data?.erp_contract && <p className="mt-1 text-[12.5px]">ERPNext {s.data.erp_contract} · {s.data.erp_status} · signed {fmtDate(s.data.signed_at)}</p>}
                      {s.data?.result && <p className="mt-1 text-[12.5px]">Mock class <b className="font-mono">{s.data.total}</b>/100 · {s.data.result === "not_yet" ? "Not Yet" : s.data.result}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {myStep && <StepForm step={current} pipeline={p} S={S} contract={contract} />}
          {current && p.status === "in_pipeline" && !myStep && (
            <Notice tone="brand" title={`Waiting for ${STEP[current.step].owner}`}>Reminders go out after 3 working days. {has(me, "gm") ? "As GM you are informed of every decision and approve nothing here." : ""}</Notice>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle icon="database" sub="From the Portal v2 contractor record (ERPNext)">Candidate record</CardTitle>
            <KV k="Supplier" v={<span className="font-mono">{p.person.erp_supplier_id}</span>} />
            <KV k="Category" v={p.person.erp_service_category ?? "—"} />
            <KV k="ERPNext status" v={p.person.erp_contractor_status} />
            <KV k="Approval status" v={p.person.approval_status.replace("_", " ")} />
            {contract && <KV k="Contract" v={`${contract.id} · ${contract.status}`} />}
          </Card>
          {(mocks ?? []).length > 0 && (
            <Card>
              <CardTitle icon="star" sub="CCTP 100-point rubric · written feedback within 24 hours">Mock classes</CardTitle>
              {(mocks ?? []).map((m: any) => (
                <div key={m.id} className="mb-3 rounded-lg border border-line p-3 last:mb-0">
                  <div className="flex items-center justify-between"><b className="text-[13px] text-navy">{m.context === "mock1" ? "Mock class 1" : "Mock class 2"}</b><span className="font-mono text-[15px] font-semibold">{m.total}</span></div>
                  <Badge tone={m.result === "not_yet" ? "red" : "green"}>{m.result === "not_yet" ? "Not Yet" : m.result}</Badge>
                  <p className="mt-2 text-[12.5px] text-ink-600">{m.feedback}</p>
                  <div className="mt-1 text-[11.5px] text-ink-500">{m.assessor?.full_name} · {fmtDateTime(m.created_at)}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StepForm({ step, pipeline, S, contract }: { step: any; pipeline: any; S: Record<string, any>; contract: any }) {
  const hidden = <><input type="hidden" name="pipeline" value={pipeline.id} /><input type="hidden" name="step" value={step.id} /></>;
  if (step.step === "mock1" || step.step === "mock2") {
    const r = S.cctp_mock_rubric?.value;
    return (
      <Card className="border-brand-100 ring-1 ring-brand-100">
        <CardTitle icon="star" sub="Any critical failure forces Not Yet. CCT at 90+, CCTA at 80–89. Written feedback is required.">{STEP[step.step].label} — score</CardTitle>
        <ActionForm action={pipelineMock} className="space-y-4">
          {hidden}
          <div className="grid gap-3 sm:grid-cols-2">
            {r.items.map((it: any) => (
              <Field key={it.key} label={`${it.label} (0–${it.max})`}><input type="number" name={`score_${it.key}`} min={0} max={it.max} required className={input} /></Field>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-tier4">Critical failures</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {r.critical.map((c: any) => <label key={c.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]"><input type="checkbox" name={`crit_${c.key}`} /> {c.label}</label>)}
            </div>
          </div>
          <Field label="Written feedback (what to fix)"><textarea name="feedback" rows={3} required className={input} /></Field>
          <Submit>Record result</Submit>
        </ActionForm>
      </Card>
    );
  }
  return (
    <Card className="border-brand-100 ring-1 ring-brand-100">
      <CardTitle icon="check" sub={`You own this step (${STEP[step.step].owner})`}>{STEP[step.step].label}</CardTitle>
      <ActionForm action={pipelineStep} className="space-y-4">
        {hidden}
        {step.step === "vetting" && (
          <>
            <div className="flex items-center gap-2"><span className="text-[12.5px] text-ink-500">Live technical vetting with a written scorecard</span>{S.vetting_scorecard?.status === "draft_review" && <Badge tone="draft">Draft scorecard</Badge>}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {S.vetting_scorecard?.value.items.map((it: any) => <Field key={it.key} label={`${it.label} (0–${it.max})`}><input type="number" name={`score_${it.key}`} min={0} max={it.max} required className={input} /></Field>)}
            </div>
            <Field label="Recommendation"><select name="recommend" className={input}><option value="yes">Recommend</option><option value="no">Do not recommend</option></select></Field>
          </>
        )}
        {step.step === "selection_rate" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rate (KWD)"><input type="number" name="rate" required step="0.5" defaultValue={pipeline.rate ?? ""} className={input} /></Field>
            <Field label="Rate type"><select name="rate_type" className={input}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="fixed">Fixed</option></select></Field>
          </div>
        )}
        {step.step === "contract" && (
          <Notice tone={contract && ["Approved", "Active"].includes(contract.status) && contract.signed_at ? "green" : "amber"} title="Read from ERPNext">
            {contract ? `${contract.id} · ${contract.status}${contract.signed_at ? ` · signed ${fmtDate(contract.signed_at)}` : " · not signed"}. Contracts should be signed at least 2 weeks before Day 1.` : "No contract in ERPNext yet. HR and Finance run the contract chain there."}
          </Notice>
        )}
        {step.step === "onboarding" && pipeline.target_role === "ta" && (
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-600">TA checklist</div>
            <div className="space-y-1.5">{S.ta_checklist?.value.items.map((it: any) => <label key={it.key} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name={`check_${it.key}`} required /> {it.label}</label>)}</div>
          </div>
        )}
        <Field label="Notes"><textarea name="notes" rows={2} className={input} /></Field>
        <div className="flex flex-wrap gap-2">
          <Submit name="status" value="done" icon="check">{step.step === "cleared" ? "Clear to teach" : step.step === "selection_rate" ? "Approve selection and rate" : step.step === "contract" ? "Confirm from ERPNext" : "Mark complete"}</Submit>
          {["selection_rate", "cleared", "vetting"].includes(step.step) && <Submit name="status" value="failed" variant="danger">{step.step === "vetting" ? "Did not pass" : "Do not approve"}</Submit>}
        </div>
      </ActionForm>
    </Card>
  );
}
