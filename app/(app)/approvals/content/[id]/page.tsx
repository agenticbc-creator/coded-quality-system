import { notFound } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Field, KV, Notice, PageHeader, input } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { contentDecide, contentEnableStages, contentStageDecide, contentSubmit } from "@/app/actions";
import { cx } from "@/components/ui";

const STAGE_LABEL: Record<string, string> = { outline: "Outline", detailed_outline: "Detailed outline", lesson_plan: "Lesson plan", final_briefing: "Final briefing", alpha: "Alpha · technical review", beta: "Beta · pedagogy review" };
const PRECHECK: [string, string][] = [
  ["seventy_thirty", "70/30: at least 70% of session time is hands-on"],
  ["arc", "Each session follows the Arc (hook → model → practice → reflect)"],
  ["productive_struggle", "Exercises leave room for productive struggle (no copy-paste answers)"],
  ["real_life", "Projects use real-life cases from the trainees' world"],
  ["time_boxed", "Every activity is time-boxed"],
  ["outcomes_mapped", "Every outcome in the brief maps to at least one exercise"],
];
import { SEGMENT, fmtDate, fmtDateTime, working } from "./util";

export default async function ContentItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const supabase = await db();
  const [{ data: item }, { data: approverSetting }, { data: cohorts }, { data: stages }] = await Promise.all([
    supabase.from("content_items").select("*, program:programs(name, segment_id), creator:people!content_items_creator_id_fkey(id, full_name), approver:people!content_items_approved_by_fkey(full_name), versions:content_versions(*, decider:people!content_versions_decided_by_fkey(full_name))").eq("id", id).maybeSingle(),
    supabase.from("settings").select("value, status").eq("key", "content_approver_role").maybeSingle(),
    supabase.from("cohorts").select("id, name, status, content_version").eq("content_id", id),
    supabase.from("content_stages").select("*, decider:people!content_stages_decided_by_fkey(full_name)").eq("content_id", id).order("ord"),
  ]);
  const stageList = (stages ?? []) as any[];
  const nextStage = stageList.find((st) => st.status !== "approved");
  const stagesOpen = item?.staged && !!nextStage;
  if (!item) notFound();
  const versions = (item.versions ?? []).sort((a: any, b: any) => b.version - a.version);
  const pending = versions.find((v: any) => v.decision === "pending");
  const approverRole = (approverSetting?.value as any)?.role ?? "education_principal";
  const isApprover = has(me, approverRole) && item.creator?.id !== me.id;
  const isCreator = item.creator?.id === me.id;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/approvals/content", label: "Content" }} eyebrow={`${item.program?.name} · ${SEGMENT[item.program?.segment_id]}`} title={item.title}
        actions={<Badge tone={item.status === "approved" ? "green" : item.status === "submitted" ? "amber" : item.status === "changes_requested" ? "red" : "neutral"}>{item.status.replace("_", " ")}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {pending && isApprover && (
            <Card className="border-brand-100 ring-1 ring-brand-100">
              <CardTitle icon="check" sub={`Version ${pending.version} · submitted ${fmtDateTime(pending.submitted_at)} · ${working(pending.submitted_at)} working day(s) waiting (turnaround: 3)`}>Your decision</CardTitle>
              {pending.summary && <p className="mb-2 text-[13.5px]">{pending.summary}</p>}
              {pending.precheck && (
                <div className="mb-3 grid gap-1 rounded-lg bg-zebra p-3 text-[12.5px]">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Creator's pre-check</div>
                  {PRECHECK.map(([k, l]) => <div key={k} className="flex items-center gap-2"><Icon name={pending.precheck[k] ? "check" : "x"} className={cx("h-3.5 w-3.5", pending.precheck[k] ? "text-tier1" : "text-tier4")} />{l}</div>)}
                </div>
              )}
              {pending.link && <a href={pending.link} target="_blank" rel="noreferrer" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand"><Icon name="link" className="h-4 w-4" /> Open the content</a>}
              <ActionForm action={contentDecide} className="space-y-3">
                <input type="hidden" name="content" value={id} />
                <input type="hidden" name="version" value={pending.id} />
                <Field label="Comments" hint="Required when you request changes. Every round is versioned."><textarea name="comments" rows={3} className={input} /></Field>
                <div className="flex flex-wrap gap-2">
                  {stagesOpen ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 text-[12.5px] text-ink-500"><Icon name="lock" className="h-3.5 w-3.5" /> Final approval unlocks after the {STAGE_LABEL[nextStage.stage]} stage</span>
                    : <Submit name="decision" value="approved" icon="check">Approve this version</Submit>}
                  <Submit name="decision" value="changes_requested" variant="danger">Request changes</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
          {isCreator && item.status !== "submitted" && (
            <Card>
              <CardTitle icon="send" sub={item.status === "approved" ? "Submitting again creates a new version; cohorts keep the version locked to them." : "The approver is notified and reminded after 3 working days."}>
                {versions.length ? "Submit a new version" : "Submit for approval"}
              </CardTitle>
              <ActionForm action={contentSubmit} className="space-y-3">
                <input type="hidden" name="content" value={id} />
                <Field label="What changed"><textarea name="summary" rows={2} className={input} /></Field>
                <Field label="Link to the content"><input name="link" type="url" className={input} placeholder="https://" /></Field>
                <fieldset className="rounded-lg border border-line p-3">
                  <legend className="px-1 text-[12px] font-semibold text-navy">Pre-check (X1) · the approver sees your answers</legend>
                  <input type="hidden" name="precheck_on" value="1" />
                  <div className="grid gap-1.5">
                    {PRECHECK.map(([k, l]) => <label key={k} className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" name={`pc_${k}`} className="mt-0.5 accent-[#14243F]" /> {l}</label>)}
                  </div>
                </fieldset>
                <Submit icon="send">Submit version {versions.length + 1}</Submit>
              </ActionForm>
            </Card>
          )}
          {pending && !isApprover && <Notice tone="amber" title="Waiting for approval">Version {pending.version} is with the {approverRole.replace("_", " ")} ({working(pending.submitted_at)} working day(s)).</Notice>}
          <Card>
            <CardTitle icon="layers" sub="Optional stage gates (A6) with Alpha and Beta asset review (A7). The one final approval still applies at the end."
              right={!item.staged && (isCreator || has(me, "education_principal")) ? (
                <ActionForm action={contentEnableStages}><input type="hidden" name="content" value={id} /><Submit size="sm" variant="secondary">Turn on staged review</Submit></ActionForm>
              ) : undefined}>Staged review</CardTitle>
            {!item.staged ? <p className="text-[13px] text-ink-500">Off for this item. Turn it on for large builds so the outline, lesson plan and assets are approved step by step.</p> : (
              <ol className="grid gap-2">
                {stageList.map((st, i) => {
                  const canDecide = st.id === nextStage?.id && !isCreator && (has(me, st.approver_role) || has(me, "education_principal"));
                  return (
                    <li key={st.id} className={cx("rounded-lg border p-3", st.status === "approved" ? "border-[#BFE5D5] bg-tier1-bg/40" : st.id === nextStage?.id ? "border-navy" : "border-line")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cx("grid h-6 w-6 place-items-center text-[11px] font-bold", st.status === "approved" ? "bg-tier1 text-white" : st.id === nextStage?.id ? "bg-navy text-white" : "bg-canvas text-ink-500")}>{st.status === "approved" ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}</span>
                          <span className="text-[13.5px] font-semibold text-navy">{STAGE_LABEL[st.stage]}</span>
                          <span className="text-[12px] text-ink-500">{st.approver_role === "education_principal" ? "Education Principal" : "Senior Instructor"}</span>
                        </div>
                        <Badge tone={st.status === "approved" ? "green" : st.status === "changes_requested" ? "red" : st.id === nextStage?.id ? "amber" : "neutral"}>{st.status === "approved" ? `Approved${st.decider ? " · " + st.decider.full_name : ""}` : st.status === "changes_requested" ? "Changes requested" : st.id === nextStage?.id ? "Up next" : "Waiting"}</Badge>
                      </div>
                      {st.comments && <p className="mt-2 text-[12.5px] italic text-ink-600">“{st.comments}”</p>}
                      {canDecide && (
                        <ActionForm action={contentStageDecide} className="mt-3 space-y-2">
                          <input type="hidden" name="content" value={id} /><input type="hidden" name="stage" value={st.id} />
                          <textarea name="comments" rows={2} className={input} placeholder="Comments (required to request changes)" />
                          <div className="flex gap-2"><Submit size="sm" name="decision" value="approved" icon="check">Approve stage</Submit><Submit size="sm" variant="danger" name="decision" value="changes_requested">Request changes</Submit></div>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <Card>
            <CardTitle icon="refresh" sub="Every round, who decided and when">Version history</CardTitle>
            <ol className="relative space-y-5 border-l border-line pl-5">
              {versions.map((v: any) => (
                <li key={v.id} className="relative">
                  <span className={`absolute -left-[27px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-white ${v.decision === "approved" ? "bg-tier1" : v.decision === "changes_requested" ? "bg-tier4" : "bg-tier3"}`} />
                  <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                    <b className="text-navy">Version {v.version}</b>
                    <Badge tone={v.decision === "approved" ? "green" : v.decision === "changes_requested" ? "red" : "amber"}>{v.decision.replace("_", " ")}</Badge>
                    {item.approved_version === v.version && <Badge tone="navy"><Icon name="lock" className="h-3 w-3" /> locked version</Badge>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-500">Submitted {fmtDateTime(v.submitted_at)}{v.decided_at ? ` · decided by ${v.decider?.full_name} ${fmtDateTime(v.decided_at)}` : ""}</div>
                  {v.summary && <p className="mt-1.5 text-[13px]">{v.summary}</p>}
                  {v.comments && <p className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-[13px] italic text-ink-600">“{v.comments}”</p>}
                </li>
              ))}
              {versions.length === 0 && <li className="text-[13px] text-ink-500">Not submitted yet.</li>}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle icon="doc">Brief</CardTitle>
            <KV k="Creator" v={item.creator?.full_name} />
            <KV k="Kind" v={item.kind === "update" ? "Update" : "New content"} />
            <KV k="Audience" v={item.audience ?? "—"} />
            <KV k="Outcomes" v={<span className="font-normal">{item.outcomes ?? "—"}</span>} />
            <KV k="Deadline" v={fmtDate(item.deadline)} />
            {item.budget && <KV k="Budget" v={`${item.budget.hours} h × ${item.budget.rate} KWD = ${item.budget.total} KWD`} />}
            {item.approved_at && <KV k="Approved" v={`${fmtDate(item.approved_at)} by ${item.approver?.full_name}`} />}
          </Card>
          <Card>
            <CardTitle icon="layers" sub="An instructor always teaches the version locked to their cohort">Used by</CardTitle>
            {(cohorts ?? []).length === 0 ? <p className="text-[13px] text-ink-500">No cohort uses this content yet.</p> : (cohorts ?? []).map((c: any) => (
              <KV key={c.id} k={c.name} v={<span className="flex items-center gap-1.5"><Icon name="lock" className="h-3.5 w-3.5" /> v{c.content_version}</span>} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
