import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, Empty, Notice, PageHeader, input } from "@/components/ui";
import { ActionForm, Rating, Submit } from "@/components/forms";
import { reviewSubmit } from "@/app/actions";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "360° reviews" };

const ROLE: Record<string, string> = { instructor: "Instructor", ta: "TA", operations: "Operations / overseer" };

export default async function Reviews() {
  await getMe();
  const supabase = await db();
  const [{ data: targets }, { data: items }] = await Promise.all([
    supabase.rpc("review_targets"),
    supabase.from("settings").select("value").eq("key", "review_360_items").maybeSingle(),
  ]);
  const list = (targets ?? []) as any[];
  const pairs = (items?.value ?? {}) as Record<string, { key: string; label: string }[]>;
  const open = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Classroom 360°" title="Reviews you owe"
        sub="Reviews stay inside the team that worked together on a class. Each is 1 to 5 per item plus one anonymous comment. People see only aggregates, and only at 3 or more reviewers." />
      <div className="mb-5"><Notice tone="draft" title="Item wording is a draft">The pairings come from the PRD; the exact wording is waiting for Education team sign-off.</Notice></div>
      {open.length === 0 ? <Empty title="Nothing to review right now" sub="Reviews open when a cohort ends and close after 14 days." icon="check" /> : (
        <div className="space-y-4">
          {open.map((t) => (
            <Card key={`${t.cohort_id}-${t.subject_id}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar name={t.subject_name} />
                  <div><div className="text-[15px] font-semibold text-navy">{t.subject_name}</div><div className="text-[12.5px] text-ink-500">{ROLE[t.subject_role]} · {t.cohort_name}</div></div>
                </div>
                <Badge tone="amber">Closes {fmtDate(t.closes)}</Badge>
              </div>
              <ActionForm action={reviewSubmit}>
                <input type="hidden" name="cohort" value={t.cohort_id} />
                <input type="hidden" name="classroom" value={t.classroom_id} />
                <input type="hidden" name="subject" value={t.subject_id} />
                {(pairs[`${t.my_role}>${t.subject_role}`] ?? []).map((it) => <Rating key={it.key} name={`item_${it.key}`} label={it.label} />)}
                <textarea name="comment" rows={2} placeholder="One anonymous comment (optional)" className={`${input} mt-3`} />
                <div className="mt-3 flex justify-end"><Submit>Submit review</Submit></div>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {done.length > 0 && <p className="mt-6 text-[13px] text-ink-500">Already reviewed: {done.map((d) => d.subject_name).join(", ")}.</p>}
    </div>
  );
}
