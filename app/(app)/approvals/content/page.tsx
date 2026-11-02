import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, Field, PageHeader, Stat, Table, input, td } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { contentCreate } from "@/app/actions";
import { SEGMENT, ago, fmtDate } from "@/lib/format";

export const metadata = { title: "Content approval" };

const STATUS: Record<string, ["neutral" | "amber" | "green" | "red" | "brand", string]> = {
  draft: ["neutral", "Draft"], submitted: ["amber", "Waiting for approval"], changes_requested: ["red", "Changes requested"], approved: ["green", "Approved"],
};

export default async function ContentList() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: items }, { data: programs }, { data: cohorts }] = await Promise.all([
    supabase.from("content_items").select("*, program:programs(name, segment_id), creator:people!content_items_creator_id_fkey(full_name), versions:content_versions(version, decision, submitted_at, decided_at)").order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name, segment_id").order("name"),
    supabase.from("cohorts").select("id, content_id, went_live_at, name"),
  ]);
  const list = (items ?? []) as any[];
  const waiting = list.filter((i) => i.status === "submitted");
  const canCreate = has(me, "content_creator", "instructor", "senior_instructor", "education_principal");
  const ttm = (i: any) => {
    const live = (cohorts ?? []).filter((c: any) => c.content_id === i.id && c.went_live_at).sort((a: any, b: any) => (a.went_live_at > b.went_live_at ? 1 : -1))[0];
    return live && i.approved_at ? Math.max(0, Math.round((new Date(live.went_live_at).getTime() - new Date(i.created_at).getTime()) / 864e5)) : null;
  };
  const revisions = (i: any) => (i.versions ?? []).filter((v: any) => v.decision === "changes_requested").length;

  return (
    <div>
      <PageHeader eyebrow="Content approval" title="Content"
        sub="Nothing is used unless it is approved. Content gets one approval before any cohort uses it; staged reviews (outline, lesson plan, Alpha and Beta) come later."
        actions={canCreate ? (
          <Disclosure label="New content request" icon="plus" variant="primary">
            <Card className="w-[min(92vw,560px)]">
              <ActionForm action={contentCreate} className="space-y-3">
                <Field label="Program"><select name="program" required className={input}>{(programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {SEGMENT[p.segment_id]}</option>)}</select></Field>
                <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                  <Field label="Title"><input name="title" required className={input} /></Field>
                  <Field label="Kind"><select name="kind" className={input}><option value="new">New</option><option value="update">Update</option></select></Field>
                </div>
                <Field label="Audience"><input name="audience" className={input} placeholder="Who it is for" /></Field>
                <Field label="Outcomes"><textarea name="outcomes" rows={2} className={input} placeholder="What learners will be able to do" /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Deadline"><input type="date" name="deadline" className={input} /></Field>
                  <Field label="Hours (budget)"><input type="number" name="hours" className={input} /></Field>
                  <Field label="Rate (KWD/hr)"><input type="number" name="rate" className={input} /></Field>
                </div>
                <Submit>Create brief</Submit>
              </ActionForm>
            </Card>
          </Disclosure>
        ) : undefined} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for approval" value={waiting.length} tone={waiting.length ? "amber" : undefined} icon="clock" sub={waiting[0] ? `Oldest ${ago(waiting[0].versions?.find((v: any) => v.decision === "pending")?.submitted_at)}` : "Nothing waiting"} />
        <Stat label="Approved" value={list.filter((i) => i.status === "approved").length} tone="green" icon="check" />
        <Stat label="Revisions per approved item" value={(list.filter((i) => i.approved_version).reduce((a, i) => a + revisions(i), 0) / Math.max(1, list.filter((i) => i.approved_version).length)).toFixed(1)} icon="refresh" sub="Fewer revisions is better" />
      </div>

      <Card pad={false} className="px-5 pb-2 pt-4">
        <Table head={["Content", "Program", "Creator", "Status", "Versions", "Time to market"]}>
          {list.map((i) => {
            const [tone, label] = STATUS[i.status];
            const t = ttm(i);
            return (
              <tr key={i.id} className="hover:bg-canvas/60">
                <td className={td}><Link href={`/approvals/content/${i.id}`} className="font-medium text-navy hover:text-brand">{i.title}</Link><div className="text-[12px] text-ink-500">{i.kind === "update" ? "Update" : "New"} · deadline {fmtDate(i.deadline)}</div></td>
                <td className={td}>{i.program?.name}<div className="text-[12px] text-ink-500">{SEGMENT[i.program?.segment_id]}</div></td>
                <td className={td}>{i.creator?.full_name}</td>
                <td className={td}><Badge tone={tone}>{label}</Badge></td>
                <td className={td}><span className="tabular-nums">{(i.versions ?? []).length}</span>{revisions(i) ? <span className="text-[12px] text-ink-500"> · {revisions(i)} {revisions(i) === 1 ? "revision" : "revisions"}</span> : null}</td>
                <td className={td}>{t !== null ? `${t} days` : "—"}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
