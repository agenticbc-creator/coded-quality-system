import Link from "next/link";
import { notFound } from "next/navigation";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Empty, KV, Notice, PageHeader, ScoreBar, cx, input, label as lbl } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { VisitInstrument } from "@/components/instrument";
import { schemaVersion, visitRespond } from "@/app/actions";
import { FOCUS, STATUS_LABEL, fmtDate, fmtDateTime, num, visitLabel } from "@/lib/format";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const supabase = await db();
  const { data: v } = await supabase.from("visits")
    .select("*, cohort:cohorts(id, name, program:programs(name, segment_id)), classroom:classrooms(id, name, room), template:qa_templates(*), assignee:people!visits_assignee_id_fkey(id, full_name), focus_person:people!visits_focus_person_id_fkey(full_name), scores:visit_scores(*, subject:people(full_name))")
    .eq("id", id).maybeSingle();
  if (!v) notFound();
  const mine = v.assignee_id === me.id;
  const open = !v.submitted_at && v.status !== "cancelled";
  // The report form opens from 15 minutes before the start, and only once the invite is accepted.
  const opensAt = new Date(new Date(v.scheduled_for).getTime() - 15 * 60 * 1000);
  const scoringOpen = Date.now() >= opensAt.getTime();
  const { data: ctx } = mine || has(me, "segment_owner", "education_principal") ? await supabase.rpc("visit_context", { p_visit: id }) : { data: null };
  const [{ data: reasons }, { data: anchors }, sv] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "red_flag_reasons").maybeSingle(),
    supabase.from("settings").select("value, status").eq("key", "scoring_anchors").maybeSingle(),
    schemaVersion(),
  ]);
  // Evidence links are signed per viewer; storage refuses anyone outside the visit's observer, owner and the Education Principal.
  const evidence: { path: string; kind: string; label: string | null }[] = Array.isArray(v.evidence) ? v.evidence : [];
  const links = v.submitted_at && evidence.length
    ? await Promise.all(evidence.map(async (e) => ({ ...e, url: (await supabase.storage.from("evidence").createSignedUrl(e.path, 3600)).data?.signedUrl as string | undefined })))
    : [];
  const sig = (ctx as any)?.signals;

  const team: { id: string; name: string; role: string }[] = (ctx as any)?.team ?? [];
  const subjects: { id: string | null; name: string; role: "instructor" | "ta" | "class" }[] = [];
  if (v.kind === "qa") {
    const subj: string[] = v.template?.subjects ?? [];
    const focusOne = v.focus === "instructor" && v.focus_person_id;
    team.filter((t) => subj.includes(t.role) && (!focusOne || t.id === v.focus_person_id) && (v.focus !== "tas" || t.role === "ta"))
      .forEach((t) => subjects.push({ id: t.id, name: t.name, role: t.role as "instructor" | "ta" }));
    if (subj.includes("class") && v.focus !== "instructor" && v.focus !== "tas") subjects.push({ id: null, name: "Class overall", role: "class" });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/visits", label: "Visits" }} eyebrow={[v.cohort?.name, v.classroom?.name].filter(Boolean).join(" · ")}
        title={<>{visitLabel(v)}{v.week_no ? <span className="text-ink-400"> · week {v.week_no}</span> : null}</>}
        sub={<>{fmtDateTime(v.scheduled_for)} · {v.classroom?.room ?? "room tbc"} · focus: {FOCUS[v.focus]?.toLowerCase()}{v.focus_person ? ` (${v.focus_person.full_name})` : ""}</>}
        actions={<Badge tone={v.status === "completed" ? "green" : v.status === "planned" ? "amber" : "brand"}>{STATUS_LABEL[v.status]}</Badge>} />

      {mine && open && ["invited", "planned", "accepted"].includes(v.status) && (
        <Card className="mb-5">
          <CardTitle icon="clock" sub="Every change is logged and the scheduler is notified.">{v.status === "accepted" ? "You accepted this visit" : "Respond to the invite"}</CardTitle>
          <ActionForm action={visitRespond} className="space-y-3">
            <input type="hidden" name="visit" value={id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div><span className={lbl}>New date</span><input type="date" name="date" className={input} /></div>
              <div><span className={lbl}>New time</span><input type="time" name="time" className={input} /></div>
              <div><span className={lbl}>Reason (optional)</span><input name="reason" className={input} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {v.status !== "accepted" && <Submit name="action" value="accept" icon="check">Accept</Submit>}
              <Submit name="action" value="reschedule" variant="secondary">Reschedule</Submit>
              <Submit name="action" value="decline" variant="danger">Decline</Submit>
            </div>
          </ActionForm>
        </Card>
      )}

      {ctx && open && (
        <Card className="mb-5">
          <CardTitle icon="doc" sub={v.qa_type === "education" ? "Earlier class-level comments only — never the instructor's earlier QA scores (bias rule)." : "Short pre-visit brief"}>Pre-visit context</CardTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-500">Team</div>
              <ul className="space-y-1 text-[13.5px]">{team.map((t) => <li key={t.id}>{t.name} <span className="text-ink-500">· {t.role === "ta" ? "TA" : "Instructor"}</span></li>)}</ul>
              {sig && (
                <>
                  <div className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-500">This week in the CODED App</div>
                  <ul className="space-y-1 text-[13.5px]">
                    <li>Attendance logged on time: <b className="tabular-nums">{sig.attendance_on_time ?? "—"}%</b></li>
                    <li>Ungraded over 72h: <b className="tabular-nums">{sig.ungraded_backlog ?? 0}</b></li>
                    {!sig.ops_view && <li>Task completion: <b className="tabular-nums">{sig.completion_this_week ?? "—"}%</b></li>}
                  </ul>
                </>
              )}
              <div className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-500">Last sessions</div>
              <ul className="space-y-1 text-[13.5px]">{((ctx as any).recent_sessions ?? []).map((s: any, i: number) => <li key={i}>{fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" })} · {s.topic}</li>)}</ul>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-500">Previous One Thing</div>
              {(ctx as any).peer ? <p className="text-[13.5px] text-ink-500">Shown to the QA team only. You are observing a peer: note what you see in class.</p>
                : ((ctx as any).previous_one_thing ?? []).length === 0 ? <p className="text-[13.5px] text-ink-500">None yet — full marks on follow-through for a first visit.</p> : (
                <ul className="space-y-1.5 text-[13.5px]">{(ctx as any).previous_one_thing.map((o: any, i: number) => <li key={i}><b>{team.find((t) => t.id === o.person)?.name ?? "—"}:</b> {o.one_thing}{o.same_cohort === false && <span className="text-ink-500"> · from an earlier cohort</span>}</li>)}</ul>
              )}
              <div className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-500">Class-level comments</div>
              <ul className="space-y-1 text-[13.5px]">{((ctx as any).class_comments ?? []).slice(0, 3).map((c: any, i: number) => <li key={i}>{c.action_points ?? "—"} <span className="text-ink-500">· {fmtDate(c.at, { day: "numeric", month: "short" })}</span></li>)}</ul>
            </div>
          </div>
        </Card>
      )}

      {mine && open && v.status !== "planned" && !(v.status === "accepted" && scoringOpen) ? (
        <Notice tone="brand" title={v.status === "accepted" ? `Scoring opens at ${fmtDateTime(opensAt)}` : "Accept the invite to score this visit"}>
          {v.status === "accepted" ? "The report form opens 15 minutes before the session starts. Read the pre-visit context in the meantime." : "Once you accept, the report form opens 15 minutes before the session starts."}
        </Notice>
      ) : mine && open && v.status === "accepted" ? (
        <VisitInstrument visitId={id} kind={v.kind} rubric={v.template?.rubric} subjects={subjects} redFlagReasons={(reasons?.value as string[]) ?? []}
          anchors={(anchors?.value as any) ?? null} anchorsDraft={anchors ? anchors.status !== "decided" : true} evidence={sv >= 10 ? evidence : undefined} />
      ) : open ? (
        <Notice tone="brand" title="Not submitted yet">{v.assignee ? `${v.assignee.full_name} will file the report after the visit.` : "This visit needs an observer."} {!v.assignee && <Link href={`/visits/new?visit=${id}`} className="font-semibold underline">Assign one</Link>}</Notice>
      ) : (
        <Report v={v} links={links} />
      )}
    </div>
  );
}

function Report({ v, links }: { v: any; links: { path: string; kind: string; label: string | null; url?: string }[] }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardTitle icon="clipboard" sub={/imported from Notion/.test((v.summary ?? "").split("\n")[0])
            ? `Imported from Notion · observed by ${(v.summary ?? "").match(/^Observed by: (.+)$/m)?.[1] ?? "not recorded"}`
            : `Filed ${fmtDateTime(v.submitted_at)}${v.assignee ? ` by ${v.assignee.full_name}` : ""} · ${v.attendance === "partial" ? "partial attendance" : "full session"}`}
          right={<Badge tone={v.release_status === "released" ? "green" : v.release_status === "pending" ? "amber" : "neutral"}>{v.release_status === "released" ? "Released" : v.release_status === "pending" ? "Waiting for release" : "Kept private"}</Badge>}>
          Report
        </CardTitle>
        {(v.scores ?? []).length > 0 && (
          <div className="mb-4 space-y-3">
            {v.scores.map((s: any) => (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_140px_48px] items-center gap-3">
                <span className="text-[14px] font-medium text-navy">{s.subject?.full_name ?? "Class overall"} <span className="text-[12.5px] font-normal text-ink-500">{s.subject_role === "ta" ? "TA" : s.subject_role}</span></span>
                <ScoreBar value={s.pct} />
                <span className={cx("text-right tabular-nums font-semibold", Number(s.pct) < 75 ? "text-tier4" : "text-navy")}>{num(s.pct)}</span>
              </div>
            ))}
          </div>
        )}
        {v.unobserved?.length > 0 && <KV k="Not observed (flagged, not scored)" v={v.unobserved.join(", ")} />}
        {v.summary && <div className="border-b border-line/70 py-2 text-[13.5px]"><div className="mb-1 text-ink-500">Summary</div><p className="whitespace-pre-line text-ink">{v.summary}</p></div>}
        {v.one_thing && <KV k="The One Thing" v={v.one_thing} />}
        {v.action_points && <div className="border-b border-line/70 py-2 text-[13.5px]"><div className="mb-1 text-ink-500">Action points</div><p className="whitespace-pre-line text-ink">{v.action_points}</p></div>}
        {v.flags?.length > 0 && <KV k="Flags" v={v.flags.map((f: string) => <Badge key={f} tone="red">{f === "remediation_shadow_tier1" ? "Shadow a Tier 1 instructor" : f}</Badge>)} />}
        {links.length > 0 && <KV k="Evidence" v={<span className="flex flex-wrap gap-2">{links.map((l) => l.url
          ? <a key={l.path} href={l.url} target="_blank" rel="noreferrer" className="font-semibold text-brand">{l.kind === "voice" ? "Voice note" : "Photo"}{l.label ? ` · ${l.label}` : ""}</a>
          : <span key={l.path} className="text-ink-500">{l.kind === "voice" ? "Voice note" : "Photo"} (not visible to your role)</span>)}</span>} />}
        {v.checklist && <div className="mt-3 grid gap-1.5 sm:grid-cols-2">{Object.entries(v.checklist).map(([k, b]) => <div key={k} className="text-[13px]"><Badge tone={b ? "green" : "red"}>{b ? "Yes" : "No"}</Badge> <span className="capitalize">{k.replace(/_/g, " ")}</span></div>)}</div>}
      </Card>
      {v.interventions?.length > 0 && (
        <Card>
          <CardTitle icon="alert" sub="Logged under the Intervene policy">Signal / Intervene</CardTitle>
          {v.interventions.map((i: any, k: number) => (
            <div key={k} className="border-b border-line/70 py-2 text-[13.5px] last:border-0"><Badge tone={i.kind === "intervene" ? "amber" : "brand"}>{i.kind}</Badge> <b>{i.trigger}</b> — {i.said}. <span className="text-ink-500">{i.outcome}</span></div>
          ))}
        </Card>
      )}
      {v.release_status === "pending" && <Notice tone="amber">This report is waiting in the segment owner's release queue. Nothing reaches the educator until it is approved.</Notice>}
      {!v.scores?.length && v.kind === "qa" && <Empty title="No scores visible to your role" icon="lock" />}
    </div>
  );
}
