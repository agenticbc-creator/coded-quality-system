import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Field, PageHeader, input } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { feedbackUpdateOwn, schemaVersion } from "@/app/actions";
import { FeedbackForm } from "@/components/feedback-form";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Log feedback" };

export default async function NewFeedback() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: staff }, { data: reasons }, { data: mine }, v] = await Promise.all([
    supabase.from("classroom_staff").select("role, person:people(id, full_name), classroom:classrooms(id, name, cohort:cohorts(id, name, status))"),
    supabase.from("settings").select("value").eq("key", "red_flag_reasons").maybeSingle(),
    supabase.from("feedback").select("*, subject:people!feedback_subject_id_fkey(full_name)").eq("author_id", me.id).order("created_at", { ascending: false }).limit(8),
    schemaVersion(),
  ]);
  const options = ((staff ?? []) as any[])
    .filter((s) => s.person.id !== me.id && s.classroom?.cohort?.status !== "closed")
    .sort((a, b) => (a.classroom.cohort.status === "live" ? -1 : 1) - (b.classroom.cohort.status === "live" ? -1 : 1) || a.person.full_name.localeCompare(b.person.full_name))
    .map((s) => ({ person: s.person.id, name: s.person.full_name, cohort: s.classroom.cohort.id, classroom: s.classroom.id, where: `${s.classroom.cohort.name} · ${s.classroom.name} · ${s.role === "ta" ? "TA" : "Instructor"}` }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Feedback any time" title="Log feedback"
        sub="Capture it while it is fresh, from your phone or laptop. Nothing reaches the educator until the segment owner approves it." />
      <Card><FeedbackForm options={options} reasons={(reasons?.value as string[]) ?? []} meId={me.id} canAttach={v >= 10} /></Card>
      {(mine ?? []).length > 0 && (
        <Card className="mt-6">
          <CardTitle icon="clock" sub="Only you, the segment owner and the Education Principal can see these">Your recent notes</CardTitle>
          <ul className="space-y-2">
            {(mine ?? []).map((f: any) => (
              <li key={f.id} className="flex items-start justify-between gap-3 border-b border-line/70 pb-2 text-[13.5px] last:border-0">
                <span className="min-w-0 flex-1"><b className="text-navy">{f.subject.full_name}</b> · {f.body}{f.attachment_url && <span className="text-ink-500"> · photo attached</span>}
                  {v >= 10 && f.status === "private" && !f.reviewed_at && (
                    <span className="mt-1.5 block">
                      <Disclosure label="Edit">
                        <ActionForm action={feedbackUpdateOwn} className="space-y-2">
                          <input type="hidden" name="id" value={f.id} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Type"><select name="type" defaultValue={f.type} className={input}><option value="praise">Praise</option><option value="concern">Concern</option><option value="coaching">Coaching</option><option value="incident">Incident</option></select></Field>
                            <Field label="Severity"><select name="severity" defaultValue={f.severity} className={input}><option value="positive">Positive</option><option value="minor">Minor</option><option value="serious">Serious</option>{f.severity === "red_flag" && <option value="red_flag">Red flag</option>}</select></Field>
                          </div>
                          <Field label="What you saw"><textarea name="body" rows={3} required defaultValue={f.body} className={input} /></Field>
                          <Submit size="sm" variant="secondary">Save changes</Submit>
                        </ActionForm>
                      </Disclosure>
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right"><Badge tone={f.status === "released" ? "green" : f.status === "private" ? "amber" : "neutral"}>{f.status === "private" ? "waiting" : f.status.replace("_", " ")}</Badge><span className="block text-[11px] text-ink-500">{fmtDateTime(f.created_at)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
