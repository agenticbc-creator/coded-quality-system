import Link from "next/link";
import { Badge, Card, CardTitle, Empty, KV, Notice, ScoreBar, ScoreRing, TierBadge, cx, input, tierColor } from "./ui";
import { Icon } from "./icons";
import { ActionForm, Submit } from "./forms";
import { feedbackAck, jdConfirm } from "@/app/actions";
import { ACC_PART, CHANNEL, COMPONENT, SEGMENT, TIER, ago, fmtDate, fmtDay, num, periodLabel } from "@/lib/format";
import type { PersonData, SignalLevels } from "@/lib/person";

/* ── Where do I stand ─────────────────────────────────────── */
export function Hero({ d, self }: { d: PersonData; self: boolean }) {
  const c = d.current;
  const lastOne = d.released.find((r) => r.one_thing);
  const p = d.person;
  const segs = Array.from(new Set(d.contracts.map((x) => x.segment_id).filter(Boolean))) as string[];
  return (
    <section className="grain relative overflow-hidden rounded-2xl bg-navy text-white shadow-lift">
      <div className="grid gap-8 p-6 md:grid-cols-[auto_minmax(0,1fr)] md:p-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="flex justify-center md:block"><ScoreRing value={c?.total} provisional={c?.provisional} /></div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8FB8EE]">{periodLabel(d.period)} · {self ? "where you stand" : "where they stand"}</div>
          <h2 className="mt-1.5 text-[26px] font-semibold tracking-tight">{p.full_name}</h2>
          {p.arabic_name && <div className="ar text-[14.5px] text-white/60" dir="rtl">{p.arabic_name}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {c?.tier ? <TierBadge tier={c.tier} provisional={c.provisional} size="lg" /> : <Badge>No score this quarter yet</Badge>}
            {p.cctp_cert && <Badge tone="navy" className="!bg-white/10 !ring-white/20">{p.cctp_cert} · {p.cctp_rank}</Badge>}
            {segs.map((s) => <Badge key={s} className="!bg-white/5 !text-white/80 !ring-white/15">{SEGMENT[s]}</Badge>)}
          </div>
          <div className="mt-5 grid max-w-md grid-cols-3 gap-3 text-center">
            <Mini label="Target" value="90" />
            <Mini label="Floor" value="85" />
            <Mini label="Gap to target" value={c?.total ? (Number(c.total) >= 90 ? "On target" : `${num(90 - Number(c.total))} pts`) : "—"} />
          </div>
          {c?.provisional && (
            <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-white/65">
              <Icon name="clock" className="mr-1 inline h-3.5 w-3.5" />Provisional until: {c.gate_failures.join("; ")}.
            </p>
          )}
          {c?.tier && <p className="mt-3 max-w-lg text-[13px] text-white/60">{TIER[c.tier as 1].action}.</p>}
        </div>
        <div className="rounded-xl bg-white/[0.06] p-5 ring-1 ring-white/10 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8FB8EE]"><Icon name="star" className="h-3.5 w-3.5" /> The One Thing</div>
          {lastOne ? (
            <>
              <p className="mt-3 text-[18px] font-medium leading-snug">{lastOne.one_thing}</p>
              <p className="mt-3 text-[12.5px] text-white/55">From the {lastOne.title.toLowerCase()} · released {fmtDate(lastOne.released_at)}</p>
              {lastOne.action_points && <p className="mt-3 border-t border-white/10 pt-3 text-[13.5px] text-white/75"><span className="text-white/50">Action point: </span>{lastOne.action_points}</p>}
            </>
          ) : (
            <p className="mt-3 text-[14.5px] text-white/60">No released QA feedback yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.06] px-2 py-2 ring-1 ring-white/10">
      <div className="tabular-nums text-[16px] font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

/* ── Why: the breakdown ───────────────────────────────────── */
export function Breakdown({ d }: { d: PersonData }) {
  const c = d.current;
  if (!c) return <Card><CardTitle icon="chart">How the score is built</CardTitle><Empty title="No score this quarter yet" sub="Scores are computed from QA visits, operations QA, 360° reviews and accountability." /></Card>;
  const comps = c.components as Record<string, any>;
  return (
    <Card>
      <CardTitle icon="chart" sub="Each component is scored 0–100, then weighted. Missing components are re-weighted and the score is marked provisional.">How the score is built</CardTitle>
      <div className="space-y-5">
        {(["qa", "ops", "r360", "acc"] as const).map((k) => {
          const x = comps[k] ?? {};
          return (
            <div key={k}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-[14px] font-semibold text-navy">{COMPONENT[k].label}</span>
                  <span className="ml-2 text-[12.5px] text-ink-500">{x.weight}% · {COMPONENT[k].hint}</span>
                </div>
                <div className="tabular-nums text-[15px] font-semibold" style={{ color: tierColor(x.score) }}>
                  {x.score ?? "—"}
                  {x.n !== undefined && <span className="ml-1.5 text-[11px] font-normal text-ink-400">n={x.n}</span>}
                </div>
              </div>
              <ScoreBar value={x.score} />
              {k === "acc" && x.parts && (
                <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {Object.entries(x.parts as Record<string, number | null>).map(([pk, pv]) => (
                    <div key={pk} className="flex justify-between text-[12.5px]">
                      <span className="text-ink-500">{ACC_PART[pk]}</span>
                      <span className="tabular-nums text-ink-600">{pv === null ? "no data" : `${num(pv)}%`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12.5px] text-ink-500">
        <span>Computed {ago(c.computed_at)}</span>
        <span className="flex items-center gap-3"><span className="inline-block h-3 w-px bg-ink-400" /> floor 85 <span className="inline-block h-3 w-px bg-navy" /> target 90</span>
      </div>
    </Card>
  );
}

/* ── Trend over the last four quarters ────────────────────── */
export function Trend({ d }: { d: PersonData }) {
  const rows = d.composites.slice(-4);
  return (
    <Card>
      <CardTitle icon="chart" sub="Last four quarters">Trend</CardTitle>
      {rows.length === 0 ? <Empty title="No history yet" /> : (
        <div className="flex h-40 items-end gap-3">
          {rows.map((r) => (
            <div key={r.period} className="flex flex-1 flex-col items-center gap-2">
              <div className="tabular-nums text-[13px] font-semibold" style={{ color: tierColor(r.total) }}>{num(r.total)}</div>
              <div className="relative w-full max-w-[46px] flex-1 rounded-t-md bg-canvas">
                <div className={cx("absolute inset-x-0 bottom-0 rounded-t-md", r.provisional && "opacity-60")} style={{ height: `${Math.max(4, (Number(r.total ?? 0) - 50) * 2)}%`, background: tierColor(r.total) }} />
              </div>
              <div className="text-[11px] text-ink-500">{r.period.replace("2026-", "")}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Live signals from the CODED App ──────────────────────── */
export function Signals({ d }: { d: PersonData }) {
  if (!d.signals.length) return null;
  return (
    <Card>
      <CardTitle icon="sun" sub="Pulled from the CODED App daily — fix things in week 2, not at quarter close.">Live signals</CardTitle>
      <div className="space-y-5">
        {d.signals.map(({ classroom, data, role }) => <SignalGrid key={classroom.id} title={`${classroom.cohort.name} · ${classroom.name}`} data={data} role={role} levels={d.levels} draft={d.levelsDraft} />)}
      </div>
    </Card>
  );
}

export function noAppData(data: any) {
  return !!data && data.attendance_on_time == null && data.trainee_attendance == null && data.completion_this_week == null
    && data.missed_pct == null && !data.pulse && !(data.late_attendance?.length) && !Number(data.ungraded_backlog ?? 0);
}

export function SignalGrid({ title, data, role, levels, draft = true }: { title: string; data: any; role?: string; levels?: SignalLevels | null; draft?: boolean }) {
  if (!data) return null;
  // No sessions, attendance or tasks from the CODED App yet: say so instead of showing an empty "on track".
  if (noAppData(data)) return (
    <div>
      <div className="mb-2 text-[13.5px] font-semibold text-navy">{title}</div>
      <p className="rounded-lg border border-line bg-white p-3 text-[13px] text-ink-500">No CODED App data for this classroom yet. Signals appear once its sessions, attendance and tasks come in.</p>
    </div>
  );
  const a = data.alerts ?? {};
  // Three levels instead of "any miss is red": on track (quiet), watch (amber), act now (red).
  // "Act now" levels come from settings.signal_thresholds (migration 0010); the numbers below are the fallback examples.
  const attAct = levels?.attendance_on_time?.act_below ?? 85, backlogAct = levels?.ungraded_backlog?.act_from ?? 5;
  const doneAct = levels?.completion?.act_below ?? 50, pulseAct = levels?.pulse?.act_below ?? 3;
  type Lv = "ok" | "watch" | "act";
  const late = data.late_attendance?.length ?? 0;
  const att = Number(data.attendance_on_time ?? 100);
  const backlog = Number(data.ungraded_backlog ?? 0);
  const done = Number(data.completion_this_week ?? 100);
  const items: { label: string; value: string; level: Lv; hint: string }[] = [
    { label: "Attendance logged on time", value: `${data.attendance_on_time ?? "—"}%`, level: att < attAct ? "act" : late > 0 ? "watch" : "ok", hint: late ? `${late} ${late === 1 ? "session" : "sessions"} not logged after 24h` : "All sessions within 24h" },
    { label: "Ungraded over 72h", value: String(backlog), level: backlog >= backlogAct ? "act" : backlog > 0 ? "watch" : "ok", hint: data.grading_hours ? `Average turnaround ${data.grading_hours}h` : "" },
  ];
  if (!data.ops_view) {
    items.push(
      { label: "Task completion", value: `${data.completion_this_week ?? "—"}%`, level: a.completion ? (done < doneAct ? "act" : "watch") : "ok", hint: data.completion_last_week !== null && data.completion_last_week !== undefined ? `Last week ${data.completion_last_week}%` : "" },
      { label: "Trainee attendance", value: `${data.trainee_attendance ?? "—"}%`, level: data.absent_twice?.length ? "act" : a.trainee_attendance ? "watch" : "ok", hint: data.absent_twice?.length ? `${data.absent_twice.map((x: any) => x.trainee).join(", ")} absent twice in a row` : "No trainee absent twice in a row" },
      { label: "Missed tasks", value: `${data.missed_pct ?? "—"}%`, level: a.missed ? "watch" : "ok", hint: data.repeat_missers?.length ? `${data.repeat_missers.map((x: any) => x.trainee).join(", ")} missed 2+` : "No repeat missers" },
      { label: "Mid-program pulse", value: data.pulse ? `${data.pulse.instructor_item}/5` : "—", level: data.pulse && Number(data.pulse.instructor_item) < pulseAct ? "act" : a.pulse ? "watch" : "ok", hint: data.pulse ? `${data.pulse.too_fast_pct}% say "too fast"` : "Not run yet" },
    );
  }
  const LV = { ok: { box: "border-line bg-white", text: "text-ink", tag: "On track", tagc: "text-ink-500" }, watch: { box: "border-[#F1D9A8] bg-tier3-bg", text: "text-tier3", tag: "Watch", tagc: "text-tier3" }, act: { box: "border-[#F3C3C7] bg-tier4-bg", text: "text-tier4", tag: "Act now", tagc: "text-tier4" } };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[14px] font-bold text-ink">{title}</div>
        {role && <Badge>{role === "ta" ? "TA" : "Instructor"}</Badge>}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className={cx("rounded-xl border p-3", LV[i.level].box)}>
            <div className={cx("font-mono text-[10.5px] uppercase tracking-[0.1em]", LV[i.level].tagc)}>{LV[i.level].tag}</div>
            <div className={cx("mt-1 tabular-nums text-[22px] font-extrabold tracking-[-0.02em]", LV[i.level].text)}>{i.value}</div>
            <div className="text-[13px] font-semibold text-ink">{i.label}</div>
            {i.hint && <div className="mt-0.5 text-[12.5px] text-ink-600">{i.hint}</div>}
          </div>
        ))}
      </div>
      {draft && <p className="mt-2 text-[12px] text-ink-500">Levels are examples until Education sets a threshold for each signal.</p>}
      {data.backlog?.length > 0 && (
        <details className="mt-2 text-[12.5px] text-ink-600">
          <summary className="cursor-pointer text-brand">Show {data.backlog.length} ungraded {data.backlog.length === 1 ? "submission" : "submissions"}</summary>
          <ul className="mt-1.5 space-y-0.5">{data.backlog.map((b: any, i: number) => <li key={i}>{b.trainee} · {b.task} · {b.hours}h waiting</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ── Released feedback ────────────────────────────────────── */
export function FeedbackList({ d, self }: { d: PersonData; self: boolean }) {
  return (
    <Card>
      <CardTitle icon="send" sub={self ? "Only feedback your segment owner has approved appears here. Please acknowledge within 48 hours." : "What this person has been sent"}>
        Released feedback
      </CardTitle>
      {d.released.length === 0 ? <Empty title="No released feedback yet" /> : (
        <ul className="space-y-3">
          {d.released.slice(0, 12).map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-navy">{r.title}</span>
                  <Badge tone={r.kind === "visit" ? "brand" : r.title === "Praise" ? "green" : r.title === "Concern" ? "amber" : "neutral"}>{r.kind === "visit" ? "Visit" : "Note"}</Badge>
                </div>
                <span className="text-[12.5px] text-ink-500">{r.cohort?.name} · {fmtDate(r.released_at)}</span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{r.body}</p>
              {r.one_thing && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-[13.5px] text-navy"><b>The One Thing:</b> {r.one_thing}</p>}
              {r.action_points && <p className="mt-2 text-[13px] text-ink-600"><b>Action points:</b> {r.action_points}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-[12.5px]">
                <span className="text-ink-500">Delivered by {CHANNEL[r.channel]?.split(" (")[0].toLowerCase() ?? "—"}</span>
                {r.ack_at ? (
                  <span className="flex items-center gap-1 text-tier1"><Icon name="check" className="h-3.5 w-3.5" /> Acknowledged {fmtDate(r.ack_at)}{r.reply ? " · replied" : ""}</span>
                ) : self ? (
                  <ActionForm action={feedbackAck} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="reply" placeholder="Optional reply" className={cx(input, "h-8 py-1 text-[13px] sm:w-56")} />
                    <Submit size="sm" icon="check">Acknowledge</Submit>
                  </ActionForm>
                ) : (
                  <Badge tone="amber">Not acknowledged</Badge>
                )}
              </div>
              {r.reply && <p className="mt-2 text-[13px] italic text-ink-600">Reply: “{r.reply}”</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── One record across segments ───────────────────────────── */
export function History({ d }: { d: PersonData }) {
  const byPeriod = new Map(d.composites.map((c) => [c.period, c]));
  const periodFor = (date: string) => { const dt = new Date(date); return `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`; };
  const surveyFor = (cohortName?: string) => d.surveys.find((s) => s.cohort?.name === cohortName && s.area === "Overall" && s.survey === "final");
  return (
    <Card>
      <CardTitle icon="layers" sub="Every contract from ERPNext, across Kids, Youth and Professionals">One record across segments</CardTitle>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13.5px]">
          <thead><tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-ink-500">
            <th className="px-5 py-2 font-semibold">Contract</th><th className="px-3 py-2 font-semibold">Segment</th><th className="px-3 py-2 font-semibold">Role</th>
            <th className="px-3 py-2 font-semibold">Composite</th><th className="px-3 py-2 font-semibold">Survey (overall)</th><th className="px-5 py-2 font-semibold">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-line/70">
            {d.contracts.map((c) => {
              const comp = byPeriod.get(periodFor(c.end_date && new Date(c.end_date) < new Date() ? c.end_date : new Date().toISOString()));
              const sv = surveyFor(c.cohort?.name);
              return (
                <tr key={c.id}>
                  <td className="px-5 py-3"><div className="font-medium text-navy">{c.cohort?.name ?? c.program?.name ?? "Segment contract"}</div><div className="tabular-nums text-[11px] text-ink-400">{c.id} · {fmtDate(c.start_date, { month: "short", year: "numeric" })}–{fmtDate(c.end_date, { month: "short", year: "numeric" })}</div></td>
                  <td className="px-3 py-3">{c.segment_id ? SEGMENT[c.segment_id] : "Any"}</td>
                  <td className="px-3 py-3">{c.role}</td>
                  <td className="px-3 py-3">{comp ? <span className="tabular-nums font-semibold" style={{ color: tierColor(comp.total) }}>{num(comp.total)} <span className="text-[11px] font-normal text-ink-500">T{comp.tier}{comp.provisional ? " · prov." : ""}</span></span> : "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{sv ? `${sv.avg} / 5` : "—"}</td>
                  <td className="px-5 py-3"><Badge tone={c.status === "Active" ? "green" : c.status === "Completed" ? "neutral" : "amber"}>{c.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.contracts.length === 0 && <Empty title="No contracts visible" />}
    </Card>
  );
}

/* ── JD checklist ─────────────────────────────────────────── */
export function JDChecklist({ d, canConfirm }: { d: PersonData; canConfirm: boolean }) {
  const cohorts = Array.from(new Map(d.classrooms.map((c) => [c.classroom.cohort.id, { ...c.classroom.cohort, role: c.role }])).values())
    .sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1)).slice(0, 2);
  if (!cohorts.length) return null;
  return (
    <Card>
      <CardTitle icon="check" sub="Ticked from evidence where the system has it, confirmed by the lead where it does not. Feeds accountability.">Job description checklist</CardTitle>
      {d.jdItems.some((i) => i.status === "draft_review") && <p className="-mt-1 mb-3 text-[12.5px] text-ink-600"><Badge tone="draft">draft</Badge> Some items are a draft until Education signs off the job description.</p>}
      <div className="space-y-5">
        {cohorts.map((co: any) => {
          const items = d.jdItems.filter((i) => i.role === co.role);
          const ticks = new Map(d.jdTicks.filter((t) => t.cohort_id === co.id).map((t) => [t.item_id, t]));
          const done = items.filter((i) => ticks.get(i.id)?.done).length;
          return (
            <div key={co.id}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[13.5px] font-semibold text-navy">{co.name}</div>
                <Badge tone={done === items.length ? "green" : "neutral"}>{done} of {items.length} done</Badge>
              </div>
              <ul className="divide-y divide-line/70 rounded-lg border border-line">
                {items.map((i) => {
                  const t = ticks.get(i.id);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
                      <span className="flex items-center gap-2">
                        <span className={cx("grid h-5 w-5 place-items-center rounded-md", t?.done ? "bg-tier1 text-white" : t ? "bg-tier4-bg text-tier4" : "bg-canvas text-ink-300")}>
                          <Icon name={t?.done ? "check" : t ? "x" : "clock"} className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                        {i.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[12px] text-ink-500">
                        {t ? (t.source === "auto" ? "from evidence" : "confirmed by lead") : i.evidence === "lead" ? "lead to confirm" : "waiting for evidence"}
                        {canConfirm && i.evidence === "lead" && (
                          <ActionForm action={jdConfirm} className="contents">
                            <input type="hidden" name="person" value={d.person.id} />
                            <input type="hidden" name="cohort" value={co.id} />
                            <input type="hidden" name="item" value={i.id} />
                            <input type="hidden" name="done" value={t?.done ? "false" : "true"} />
                            <Submit size="sm" variant="ghost">{t?.done ? "Undo" : "Confirm"}</Submit>
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Surveys (view only, from the ERP) ────────────────────── */
export function Surveys({ d }: { d: PersonData }) {
  const groups = new Map<string, any[]>();
  d.surveys.forEach((s) => groups.set(`${s.cohort?.name}|${s.survey}`, [...(groups.get(`${s.cohort?.name}|${s.survey}`) ?? []), s]));
  return (
    <Card>
      <CardTitle icon="users" sub="The items about you, area by area. Shown once 60% have responded. Not part of the composite.">Trainee survey results</CardTitle>
      {groups.size === 0 ? <Empty title="No survey results yet" /> : (
        <div className="space-y-4">
          {Array.from(groups.entries()).slice(0, 3).map(([k, rows]) => {
            const [cohort, survey] = k.split("|");
            const rate = Math.round((rows[0].responses / rows[0].enrolled) * 100);
            const valid = rate >= 60;
            return (
              <div key={k}>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-navy">{cohort} · {survey === "pulse" ? "mid-program pulse" : "final survey"}</span>
                  <Badge tone={valid ? "green" : "amber"}>{rate}% responded</Badge>
                </div>
                {valid ? (
                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_120px_40px] items-center gap-3 text-[13px]">
                        <span className="text-ink-600">{r.area}</span>
                        <ScoreBar value={(r.avg / 5) * 100} showMarks={false} height="h-1.5" />
                        <span className="text-right tabular-nums font-semibold text-navy">{r.avg}</span>
                      </div>
                    ))}
                    {rows.flatMap((r) => r.screened_comments).filter(Boolean).slice(0, 2).map((c: string, i: number) => (
                      <p key={i} className="mt-1 text-[13px] italic text-ink-500">“{c}”</p>
                    ))}
                  </div>
                ) : <p className="text-[13px] text-ink-500">Below the 60% validity gate — results stay hidden.</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ── 360° aggregate ───────────────────────────────────────── */
export function Review360({ d, self }: { d: PersonData; self: boolean }) {
  const a = d.agg360;
  return (
    <Card>
      <CardTitle icon="repeat" sub="Your classroom team's view. Aggregates only; never who gave which score." right={self ? <Link href="/reviews" className="text-[13px] font-medium text-brand">Reviews you owe →</Link> : undefined}>
        Classroom 360°
      </CardTitle>
      {!a || a.n === 0 ? <Empty title="No reviews this quarter yet" sub="Reviews open when a cohort ends and close after 14 days." /> : !a.valid ? (
        <Notice tone="amber" title={`${a.n} of ${a.min} reviewers so far`}>A result counts only with {a.min} or more reviewers. Small teams roll up across your cohorts in the quarter.</Notice>
      ) : (
        <div>
          <div className="flex items-baseline gap-3">
            <span className="tabular-nums text-[30px] font-semibold text-navy">{a.avg}</span>
            <span className="text-[13.5px] text-ink-500">/ 5 · {a.n} reviewers · scores {a.score}</span>
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {Object.entries(a.items as Record<string, number>).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_70px_34px] items-center gap-2 text-[13px]">
                <span className="capitalize text-ink-600">{k.replace(/_/g, " ")}</span>
                <ScoreBar value={(v / 5) * 100} showMarks={false} height="h-1.5" />
                <span className="text-right tabular-nums text-navy">{v}</span>
              </div>
            ))}
          </div>
          {a.comments?.length > 0 && <div className="mt-3 space-y-1">{a.comments.slice(0, 3).map((c: string, i: number) => <p key={i} className="text-[13px] italic text-ink-500">“{c}”</p>)}</div>}
        </div>
      )}
    </Card>
  );
}

/* ── Plans ────────────────────────────────────────────────── */
const OUTCOME: Record<string, string> = { met: "Goals met", extended: "Extended", escalated: "Moved to an Improvement Plan", hr_review: "Passed to HR" };

export function Plans({ d }: { d: PersonData }) {
  const open = d.plans.filter((p) => p.status === "open");
  const reviewed = d.plans.filter((p) => p.reviewed_at);
  if (!open.length && !reviewed.length) return null;
  if (!open.length) return (
    <Card>
      <CardTitle icon="flag" sub="Each plan ends with a review and a recorded outcome">Past plans</CardTitle>
      <PlanHistory plans={reviewed} />
    </Card>
  );
  return (
    <Card className="border-[#F5DDAF]">
      <CardTitle icon="flag" sub="Goals and due dates agreed with your segment owner">{open[0].kind === "coaching" ? "Coaching Plan" : "Formal Improvement Plan"}</CardTitle>
      {open.map((p) => (
        <div key={p.id}>
          <KV k="Opened" v={fmtDate(p.opened_at)} />
          <KV k="Due" v={<span className={new Date(p.due) < new Date() ? "text-tier4" : ""}>{fmtDate(p.due)}{new Date(p.due) < new Date() ? " · overdue" : ""}</span>} />
          <ul className="mt-3 space-y-1.5">
            {(p.goals as any[]).map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px]">
                <span className={cx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded", g.done ? "bg-tier1 text-white" : "ring-1 ring-ink-300")}>{g.done && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}</span>
                <span className={g.done ? "text-ink-500 line-through" : ""}>{g.goal}</span>
              </li>
            ))}
          </ul>
          {p.reviewed_at && <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-600">Last review {fmtDate(p.reviewed_at)}: {OUTCOME[p.outcome] ?? p.outcome}{p.review_note ? ` · ${p.review_note}` : ""}</p>}
        </div>
      ))}
      {reviewed.filter((p) => p.status === "closed").length > 0 && <div className="mt-4 border-t border-line pt-3"><PlanHistory plans={reviewed.filter((p) => p.status === "closed")} /></div>}
    </Card>
  );
}

function PlanHistory({ plans }: { plans: any[] }) {
  return (
    <ul className="space-y-2 text-[13.5px]">
      {plans.map((p) => (
        <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2">
          <span><b className="text-ink">{p.kind === "coaching" ? "Coaching Plan" : "Improvement Plan"}</b> · reviewed {fmtDate(p.reviewed_at)}{p.review_note ? <span className="block text-[12.5px] text-ink-600">{p.review_note}</span> : null}</span>
          <Badge tone={p.outcome === "met" ? "green" : p.outcome === "extended" ? "amber" : "red"}>{OUTCOME[p.outcome] ?? "Closed"}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** Released QA results split by segment, for someone who teaches in more than one. */
export function SegmentScores({ d }: { d: PersonData }) {
  if (d.segScores.length < 2) return null;
  return (
    <Card>
      <CardTitle icon="layers" sub="Average of released education and operations QA visits, per segment taught">By segment</CardTitle>
      <ul className="space-y-2.5">
        {d.segScores.map((s) => (
          <li key={s.segment}>
            <div className="flex items-baseline justify-between text-[13.5px]"><b className="text-ink">{s.name}</b><span className="tabular-nums font-semibold text-navy">{num(s.avg_pct)}</span></div>
            <ScoreBar value={Number(s.avg_pct)} />
            <div className="text-[12px] text-ink-500">{s.visits} {s.visits === 1 ? "visit" : "visits"} · last {fmtDate(s.last)}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Profile({ d }: { d: PersonData }) {
  const p = d.person;
  return (
    <Card>
      <CardTitle icon="database" sub="Read from ERPNext; filled on the quality-system side only where ERPNext is missing a detail">Profile</CardTitle>
      <KV k="ERPNext supplier" v={<span className="tabular-nums">{p.erp_supplier_id ?? "—"}</span>} />
      <KV k="Service category" v={p.erp_service_category ?? "—"} />
      <KV k="Instructor level" v={p.erp_instructor_level ?? (p.qs_instructor_level ? <span>{p.qs_instructor_level} <Badge tone="amber">filled here</Badge></span> : "—")} />
      <KV k="Contractor status" v={p.erp_contractor_status ?? "—"} />
      <KV k="Approval status" v={<Badge tone={p.approval_status === "cleared" ? "green" : p.approval_status === "in_pipeline" ? "amber" : "neutral"}>{p.approval_status === "cleared" ? "Cleared to teach" : p.approval_status.replace("_", " ")}</Badge>} />
      <KV k="CCTP" v={p.cctp_rank ? `${p.cctp_rank}${p.cctp_cert ? " · " + p.cctp_cert : ""}` : "Not enrolled"} />
    </Card>
  );
}


/* ── WB: what this system writes back to the ERPNext record ── */
export function WriteBack({ d, showLastQa = true }: { d: PersonData; showLastQa?: boolean }) {
  const w = d.writeback;
  if (!w) return null;
  return (
    <Card>
      <CardTitle icon="refresh" sub="Computed here for the person's ERPNext record. HR applies them; this system never changes contractor status.">Written to ERPNext</CardTitle>
      <KV k="QS approval status" v={w.approval_status?.replace("_", " ") ?? "—"} />
      <KV k="Latest composite" v={w.composite ? `${num(w.composite.total)} · Tier ${w.composite.tier}${w.composite.provisional ? " (provisional)" : ""} · ${periodLabel(w.composite.period)}` : "—"} />
      {showLastQa && <KV k="Last education QA" v={w.last_qa ? `${num(w.last_qa.score)}% · ${fmtDate(w.last_qa.date)}` : "—"} />}
      <KV k="Open plan" v={w.open_plan ? `${w.open_plan.kind === "coaching" ? "Coaching" : "Improvement"} · due ${fmtDate(w.open_plan.due)}` : "None"} />
      <KV k="CCTP" v={w.cctp?.cert ? <span className="inline-flex items-center gap-1"><Icon name="award" className="h-3.5 w-3.5 text-tier1" />{w.cctp.cert}</span> : w.cctp?.rank ?? "—"} />
    </Card>
  );
}
