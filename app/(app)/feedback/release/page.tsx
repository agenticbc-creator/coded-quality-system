import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, Empty, Notice, PageHeader, cx, input, label as lbl } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { feedbackReview, visitRelease } from "@/app/actions";
import { CHANNEL, ago, fmtDateTime, hoursSince, num, visitLabel } from "@/lib/format";

export const metadata = { title: "Release queue" };

export default async function ReleaseQueue() {
  const me = await getMe();
  const supabase = await db();
  const [{ data: visits }, { data: notes }] = await Promise.all([
    supabase.from("visits").select("*, cohort:cohorts(name, program:programs(segment_id)), classroom:classrooms(name), assignee:people!visits_assignee_id_fkey(full_name), scores:visit_scores(*, subject:people(full_name))")
      .eq("release_status", "pending").order("submitted_at"),
    supabase.from("feedback").select("*, subject:people!feedback_subject_id_fkey(id, full_name), author:people!feedback_author_id_fkey(full_name), cohort:cohorts(name), classroom:classrooms(name)")
      .eq("status", "private").order("created_at"),
  ]);
  const owner = has(me, "segment_owner");
  const reds = (notes ?? []).filter((n: any) => n.severity === "red_flag");
  const otherNotes = (notes ?? []).filter((n: any) => n.severity !== "red_flag");
  const flaggedVisits = (visits ?? []).filter((v: any) => v.flags?.length || v.scores?.some((s: any) => s.subject_role !== "class" && Number(s.pct) < 75));
  const otherVisits = (visits ?? []).filter((v: any) => !flaggedVisits.includes(v));

  return (
    <div>
      <PageHeader eyebrow="Pillar B · only segment owners deliver feedback" title="Release queue"
        sub="Nothing reaches an educator until you approve it. Approve as written, edit then share, or keep it private as a record. Red flags are pinned first and skip the 48-hour SLA." />
      {!owner && <div className="mb-5"><Notice tone="amber">You can see this queue, but only the segment owner can release feedback.</Notice></div>}

      {(reds.length > 0 || flaggedVisits.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-tier4"><Icon name="flag" className="h-4 w-4" /> Red flags · same-day review</h2>
          <div className="space-y-4">
            {reds.map((n: any) => <NoteItem key={n.id} n={n} notes={notes ?? []} red />)}
            {flaggedVisits.map((v: any) => <VisitItem key={v.id} v={v} red />)}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-500">Visit reports · {otherVisits.length}</h2>
        {otherVisits.length === 0 ? <Empty title="No visit reports waiting" icon="check" /> : <div className="space-y-4">{otherVisits.map((v: any) => <VisitItem key={v.id} v={v} />)}</div>}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-500">Notes logged any time · {otherNotes.length}</h2>
        {otherNotes.length === 0 ? <Empty title="No notes waiting" icon="check" /> : <div className="space-y-4">{otherNotes.map((n: any) => <NoteItem key={n.id} n={n} notes={notes ?? []} />)}</div>}
      </section>
    </div>
  );
}

function Due({ since }: { since: string }) {
  const h = hoursSince(since);
  return <Badge tone={h > 24 ? "red" : "neutral"}><Icon name="clock" className="h-3 w-3" /> {h > 24 ? `${Math.round(h)}h — past the 24h debrief` : `filed ${ago(since)}`}</Badge>;
}

function VisitItem({ v, red }: { v: any; red?: boolean }) {
  const subjects = (v.scores ?? []).sort((a: any, b: any) => (a.subject_role > b.subject_role ? 1 : -1));
  return (
    <Card className={cx(red && "border-[#F6C9C6] ring-1 ring-[#F6C9C6]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/visits/${v.id}`} className="text-[15px] font-semibold text-navy hover:text-brand">{visitLabel(v)} · week {v.week_no}</Link>
            {v.flags?.map((f: string) => <Badge key={f} tone="red">{f === "remediation_shadow_tier1" ? "Observation under 75 → shadow a Tier 1 instructor" : f}</Badge>)}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-500">{v.cohort?.name} · {v.classroom?.name} · by {v.assignee?.full_name} · {fmtDateTime(v.scheduled_for)}</div>
        </div>
        <Due since={v.submitted_at} />
      </div>
      {subjects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {subjects.map((s: any) => (
            <span key={s.id} className={cx("rounded-lg px-2.5 py-1 text-[12.5px] ring-1 ring-inset", Number(s.pct) < 75 ? "bg-tier4-bg text-tier4 ring-[#F6C9C6]" : "bg-canvas text-ink-600 ring-line")}>
              {s.subject?.full_name ?? "Class overall"} <span className="font-mono font-semibold">{num(s.pct)}</span>
            </span>
          ))}
        </div>
      )}
      {v.interventions?.length > 0 && (
        <div className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[12.5px] text-ink-600">
          {v.interventions.map((i: any, k: number) => <div key={k}><b className="capitalize">{i.kind}:</b> {i.trigger} — {i.outcome}</div>)}
        </div>
      )}
      <ActionForm action={visitRelease} className="mt-4 space-y-3">
        <input type="hidden" name="visit" value={v.id} />
        <div><span className={lbl}>Summary the educator will read</span><textarea name="summary" rows={2} defaultValue={v.summary ?? ""} className={input} /></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><span className={lbl}>The One Thing</span><input name="one_thing" defaultValue={v.one_thing ?? ""} className={input} /></div>
          <div><span className={lbl}>Action points</span><input name="action_points" defaultValue={v.action_points ?? ""} className={input} /></div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-72"><span className={lbl}>Delivery (Pillar B)</span>
            <select name="channel" defaultValue={red ? "face_email" : subjects.some((s: any) => Number(s.pct) < 85) ? "call_email" : "email"} className={input}>
              {Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Submit variant="ghost" size="sm" name="decision" value="keep_private" icon="lock">Keep private</Submit>
            <Submit variant="secondary" size="sm" name="decision" value="edit" icon="pen">Share with my edits</Submit>
            <Submit size="sm" name="decision" value="approve" icon="send">Approve as written</Submit>
          </div>
        </div>
      </ActionForm>
    </Card>
  );
}

function NoteItem({ n, notes, red }: { n: any; notes: any[]; red?: boolean }) {
  const siblings = notes.filter((x) => x.id !== n.id && x.subject?.id === n.subject?.id);
  return (
    <Card className={cx(red && "border-[#F6C9C6] ring-1 ring-[#F6C9C6]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/people/${n.subject?.id}`} className="text-[15px] font-semibold text-navy hover:text-brand">{n.subject?.full_name}</Link>
            <Badge tone={red ? "red" : n.type === "praise" ? "green" : n.type === "concern" ? "amber" : "neutral"}>{red ? `Red flag · ${n.red_flag_reason}` : n.type}</Badge>
            {n.severity === "serious" && <Badge tone="amber">serious</Badge>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-500">Logged by {n.author?.full_name} · {n.cohort?.name}{n.classroom ? ` · ${n.classroom.name}` : ""}</div>
        </div>
        <Due since={n.created_at} />
      </div>
      <ActionForm action={feedbackReview} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={n.id} />
        <textarea name="text" rows={2} defaultValue={n.body} className={input} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <div className="w-full sm:w-64"><span className={lbl}>Delivery</span>
              <select name="channel" defaultValue={n.type === "praise" ? "email" : red || n.severity === "serious" ? "face_email" : "call_email"} className={input}>
                {Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {siblings.length > 0 && (
              <div className="w-full sm:w-56"><span className={lbl}>Merge into (duplicates)</span>
                <select name="merge_into" className={input} defaultValue="">
                  <option value="">—</option>
                  {siblings.map((x) => <option key={x.id} value={x.id}>{x.body.slice(0, 40)}…</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {siblings.length > 0 && <Submit variant="ghost" size="sm" name="decision" value="merge">Merge</Submit>}
            <Submit variant="ghost" size="sm" name="decision" value="keep_private" icon="lock">Keep private</Submit>
            <Submit variant="secondary" size="sm" name="decision" value="edit" icon="pen">Share with my edits</Submit>
            <Submit size="sm" name="decision" value="approve" icon="send">Approve as written</Submit>
          </div>
        </div>
      </ActionForm>
    </Card>
  );
}
