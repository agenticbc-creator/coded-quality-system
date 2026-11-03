import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, Field, PageHeader, cx, input } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { pipelineStart } from "@/app/actions";
import { SEGMENT, STEP, ago } from "@/lib/format";

export const metadata = { title: "People approvals" };

export default async function PeopleApprovals() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: pipes }, { data: people }, { data: programs }] = await Promise.all([
    supabase.from("pipelines").select("*, person:people!pipelines_person_id_fkey(id, full_name, erp_supplier_id, erp_contractor_status), program:programs(name), steps:pipeline_steps(*)").order("created_at", { ascending: false }),
    supabase.from("people").select("id, full_name, erp_supplier_id, approval_status").not("erp_supplier_id", "is", null).order("full_name"),
    supabase.from("programs").select("id, name, segment_id"),
  ]);
  const canStart = has(me, "education_principal", "senior_instructor", "segment_owner", "hr");
  const list = (pipes ?? []) as any[];

  return (
    <div>
      <PageHeader eyebrow="Contractor, instructor and TA approval" title="People approvals"
        sub="Every candidate goes through the same steps before Day 1. Final approval sits with the segment owner; the GM is kept informed and does not approve."
        actions={canStart ? (
          <Disclosure label="Start an approval" variant="primary">
            <Card className="w-[min(92vw,520px)]">
              <ActionForm action={pipelineStart} className="space-y-3">
                <Field label="Candidate (from the Portal v2 / ERPNext contractor record)">
                  <select name="person" required className={input}>{(people ?? []).filter((p: any) => p.approval_status !== "cleared").map((p: any) => <option key={p.id} value={p.id}>{p.full_name} · {p.erp_supplier_id}</option>)}</select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role"><select name="role" className={input}><option value="instructor">Instructor</option><option value="ta">TA</option></select></Field>
                  <Field label="Segment"><select name="segment" className={input}>{Object.entries(SEGMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                </div>
                <Field label="Program (optional)"><select name="program" className={input}><option value="">—</option>{(programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Submit>Start</Submit>
              </ActionForm>
            </Card>
          </Disclosure>
        ) : undefined} />

      <div className="space-y-3">
        {list.map((p) => {
          const steps = (p.steps ?? []).sort((a: any, b: any) => a.ord - b.ord);
          const current = steps.find((s: any) => s.status !== "done");
          return (
            <Link key={p.id} href={`/approvals/people/${p.id}`} className="block rounded-xl border border-line bg-white p-4 shadow-card transition hover:shadow-lift">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.person.full_name} />
                  <div>
                    <div className="text-[14.5px] font-semibold text-navy">{p.person.full_name}</div>
                    <div className="text-[12.5px] text-ink-500">{p.target_role === "ta" ? "TA" : "Instructor"} · {SEGMENT[p.segment_id]}{p.program ? ` · ${p.program.name}` : ""} · ERPNext {p.person.erp_contractor_status}</div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge tone={p.status === "cleared" ? "green" : p.status === "not_approved" ? "red" : "amber"}>{p.status === "cleared" ? "Cleared to teach" : p.status === "not_approved" ? "Not approved" : `Next: ${STEP[current?.step]?.label}`}</Badge>
                  {current?.opened_at && p.status === "in_pipeline" && <div className="mt-1 text-[12px] text-ink-500">{STEP[current.step].owner} · waiting {ago(current.opened_at).replace(" ago", "")}</div>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-8 gap-1">
                {steps.map((s: any) => (
                  <div key={s.id} title={STEP[s.step].label}>
                    <div className={cx("h-1.5 rounded-full", s.status === "done" ? "bg-tier1" : s.status === "failed" ? "bg-tier4" : s.opened_at ? "bg-tier3" : "bg-line")} />
                    <div className="mt-1 hidden truncate text-[11px] text-ink-500 md:block">{STEP[s.step].label}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
