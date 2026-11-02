"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, Submit } from "./forms";
import { visitSubmit } from "@/app/actions";
import { Icon } from "./icons";
import { cx, input, label as lbl } from "./ui";
import { EvidenceUpload } from "./evidence";

type Item = { key: string; label: string; max: number; guide?: string };
export type Anchors = { none?: string; low?: string; mid?: string; max?: string };
type Section = { key: string; label: string; items: Item[] };
type Subject = { id: string | null; name: string; role: "instructor" | "ta" | "class" };

export function VisitInstrument({ visitId, kind, rubric, subjects, redFlagReasons, anchors, anchorsDraft = true, evidence }: {
  visitId: string; kind: "qa" | "shadowing"; rubric: any; subjects: Subject[]; redFlagReasons: string[];
  /** General scoring guide (settings.scoring_anchors) shown where an item has no guide of its own. */
  anchors?: Anchors | null; anchorsDraft?: boolean;
  /** Evidence already attached; undefined hides the block (before migration 0010). */
  evidence?: { path: string; kind: string; label: string | null }[];
}) {
  const storeKey = `visit-draft:${visitId}`;
  const [tab, setTab] = useState(0);
  const [attendance, setAttendance] = useState<"full" | "partial">("full");
  const [unobserved, setUnobserved] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<number, Record<string, number>>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [interventions, setInterventions] = useState<{ kind: string; trigger: string; said: string; outcome: string }[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [oneThing, setOneThing] = useState("");
  const [actions, setActions] = useState("");
  // The One Thing and action points per person (instructor and each TA), so nobody receives a point meant for someone else.
  const [notes, setNotes] = useState<Record<number, { one_thing: string; action_points: string }>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Offline submit (E6): a report finished without signal is queued here and sent as soon as the device is back online.
  const queueKey = `visit-queued:${visitId}`;
  const [queued, setQueued] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Offline draft (E6): everything is kept on this device until submitted.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const d = JSON.parse(raw);
        setAttendance(d.attendance ?? "full"); setUnobserved(d.unobserved ?? []); setScores(d.scores ?? {}); setChecklist(d.checklist ?? {});
        setInterventions(d.interventions ?? []); setFlags(d.flags ?? []); setSummary(d.summary ?? ""); setOneThing(d.oneThing ?? ""); setActions(d.actions ?? ""); setNotes(d.notes ?? {});
        setSavedAt(d.savedAt ?? null);
      }
    } catch {}
    try { setQueued(localStorage.getItem(queueKey) === "1"); } catch {}
    const on = () => setOnline(navigator.onLine);
    on(); window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, [storeKey, queueKey]);
  useEffect(() => {
    // One automatic attempt: if the server refuses it, the error shows and the observer submits again by hand.
    if (online && queued) { const t = setTimeout(() => { submitRef.current?.click(); try { localStorage.removeItem(queueKey); } catch {} setQueued(false); }, 800); return () => clearTimeout(t); }
  }, [online, queued, queueKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        localStorage.setItem(storeKey, JSON.stringify({ attendance, unobserved, scores, checklist, interventions, flags, summary, oneThing, actions, notes, savedAt: now }));
        setSavedAt(now);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [storeKey, attendance, unobserved, scores, checklist, interventions, flags, summary, oneThing, actions, notes]);

  const sectionsFor = (role: string): Section[] => rubric?.[role]?.sections ?? [];
  const allSections = useMemo(() => {
    const m = new Map<string, string>();
    subjects.forEach((s) => sectionsFor(s.role).forEach((sec) => m.set(sec.key, sec.label)));
    return Array.from(m.entries());
  }, [subjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = subjects.map((s, i) => {
    let t = 0, m = 0;
    sectionsFor(s.role).forEach((sec) => {
      if (unobserved.includes(sec.key)) return;
      sec.items.forEach((it) => { m += it.max; t += Math.min(scores[i]?.[it.key] ?? 0, it.max); });
    });
    return { t, m, pct: m ? Math.round((t * 1000) / m) / 10 : null };
  });
  const incomplete = subjects.map((s, i) => sectionsFor(s.role).filter((sec) => !unobserved.includes(sec.key)).flatMap((sec) => sec.items).filter((it) => scores[i]?.[it.key] === undefined).length);

  // X2: draft the One Thing from the lowest-scoring observed item on the main subject (rule-based, no AI).
  const suggestOneThing = (only?: number) => {
    let worst: { label: string; ratio: number; who: string } | null = null;
    subjects.forEach((s, i) => (only !== undefined && i !== only) ? undefined : sectionsFor(s.role).forEach((sec) => {
      if (unobserved.includes(sec.key)) return;
      sec.items.forEach((it) => {
        const v = scores[i]?.[it.key];
        if (v === undefined) return;
        const ratio = v / it.max;
        if (!worst || ratio < worst.ratio) worst = { label: it.label, ratio, who: s.role === "class" ? "the class" : s.name.split(" ")[0] };
      });
    }));
    const w = worst as { label: string; ratio: number; who: string } | null;
    const put = (t: string) => only !== undefined ? setNotes((n) => ({ ...n, [only]: { one_thing: t, action_points: n[only]?.action_points ?? "" } })) : setOneThing(t);
    if (!w) { put("Score at least one item first, then Suggest picks the area with the most room to grow."); return; }
    const focus = w.label.split(/[:;(]/)[0].trim();
    put(`Next session, ${w.who === "the class" ? "focus the room on" : `${w.who}, focus on`}: ${focus.charAt(0).toLowerCase() + focus.slice(1)} — this scored lowest today (${Math.round(w.ratio * 100)}%).`);
  };

  const payload = subjects.map((s, i) => ({ subject_person_id: s.id, subject_role: s.role, scores: scores[i] ?? {}, one_thing: notes[i]?.one_thing ?? "", action_points: notes[i]?.action_points ?? "" }));
  const people = subjects.map((s, i) => ({ s, i })).filter(({ s }) => s.role !== "class");
  const mainNote = people.length ? notes[people[0].i] : undefined;
  const left = kind === "qa" ? incomplete.reduce((a, b) => a + b, 0) : 0;
  const setScore = (i: number, key: string, v: number | undefined) => setScores((sc) => { const cur = { ...(sc[i] ?? {}) }; if (v === undefined) delete cur[key]; else cur[key] = v; return { ...sc, [i]: cur }; });

  return (
    <ActionForm action={visitSubmit} onDone={() => { try { localStorage.removeItem(storeKey); localStorage.removeItem(queueKey); } catch {} setQueued(false); }} className="space-y-5">
      {/* Used only to send a queued report; disabled otherwise so Enter in a field never submits the report. */}
      <button ref={submitRef} type="submit" hidden aria-hidden tabIndex={-1} disabled={!(online && queued)} />
      <input type="hidden" name="visit" value={visitId} />
      <input type="hidden" name="attendance" value={attendance} />
      <input type="hidden" name="unobserved" value={JSON.stringify(unobserved)} />
      <input type="hidden" name="scores" value={JSON.stringify(kind === "qa" ? payload : [])} />
      <input type="hidden" name="checklist" value={JSON.stringify(kind === "shadowing" ? checklist : null)} />
      <input type="hidden" name="interventions" value={JSON.stringify(interventions)} />
      <input type="hidden" name="flags" value={JSON.stringify(flags)} />
      <input type="hidden" name="summary" value={summary} />
      <input type="hidden" name="one_thing" value={oneThing || mainNote?.one_thing || ""} />
      <input type="hidden" name="action_points" value={actions || mainNote?.action_points || ""} />

      <div className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-[12.5px]", online ? "bg-canvas text-ink-500" : "bg-tier3-bg text-tier3")}>
        <span className="flex items-center gap-1.5"><Icon name={online ? "check" : "alert"} className="h-3.5 w-3.5" />{queued ? (online ? "Back online — sending your report" : "Report queued — it sends when you are back online") : online ? "Online" : "Offline — keep going, it is saved on this device"}</span>
        <span>{savedAt ? `Draft saved ${new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      </div>

      {/* Attendance */}
      <Block title="1 · Your attendance" sub="Score only what you saw. Areas you did not observe are flagged, not scored.">
        <div className="grid grid-cols-2 gap-2">
          {(["full", "partial"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAttendance(a)} className={cx("rounded-lg px-3 py-3 text-[14px] font-medium ring-1 ring-inset", attendance === a ? "bg-navy text-white ring-navy" : "bg-white text-ink-600 ring-line")}>
              {a === "full" ? "Full session" : "Part of the session"}
            </button>
          ))}
        </div>
        {attendance === "partial" && kind === "qa" && (
          <div className="mt-3">
            <div className={lbl}>Areas you did not observe</div>
            <div className="flex flex-wrap gap-2">
              {allSections.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setUnobserved((u) => (u.includes(k) ? u.filter((x) => x !== k) : [...u, k]))}
                  className={cx("rounded-full px-3 py-1.5 text-[13px] ring-1 ring-inset", unobserved.includes(k) ? "bg-tier3-bg text-tier3 ring-[#F5DDAF]" : "bg-white text-ink-600 ring-line")}>
                  {unobserved.includes(k) && "✕ "}{l}
                </button>
              ))}
            </div>
          </div>
        )}
      </Block>

      {/* Rubric or checklist */}
      {kind === "qa" ? (
        <Block title="2 · Rubric" sub="Score every item, or mark a whole area as not observed. A skipped item is never counted as 0.">
          <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {subjects.map((s, i) => (
              <button key={i} type="button" onClick={() => setTab(i)}
                className={cx("min-h-[48px] shrink-0 rounded-2xl px-3.5 py-2 text-left text-[13px] ring-1 ring-inset", tab === i ? "bg-select text-white ring-select" : "bg-white text-ink-600 ring-hairline")}>
                <span className="block font-semibold">{s.name}</span>
                <span className={cx("block tabular-nums", tab === i ? "text-white/85" : "text-ink-500")}>{totals[i].pct ?? "—"}{incomplete[i] ? ` · ${incomplete[i]} not scored` : " · done"}</span>
              </button>
            ))}
          </div>
          {subjects[tab] && sectionsFor(subjects[tab].role).map((sec) => (
            <div key={sec.key} className={cx("mb-4 rounded-xl border border-line", unobserved.includes(sec.key) && "opacity-60")}>
              <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-3 py-2 text-[13.5px] font-bold text-ink">
                {sec.label}
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-normal tabular-nums text-ink-500">{sec.items.reduce((a, it) => a + Math.min(scores[tab]?.[it.key] ?? 0, it.max), 0)}/{sec.items.reduce((a, it) => a + it.max, 0)}</span>
                  <button type="button" onClick={() => setUnobserved((u) => (u.includes(sec.key) ? u.filter((x) => x !== sec.key) : [...u, sec.key]))}
                    className={cx("rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset", unobserved.includes(sec.key) ? "bg-tier3-bg text-tier3 ring-[#F1D9A8]" : "bg-white text-ink-600 ring-hairline")}>
                    {unobserved.includes(sec.key) ? "Not observed ✕" : "Not observed"}
                  </button>
                </span>
              </div>
              {unobserved.includes(sec.key) ? <div className="px-3 py-3 text-[13px] text-ink-500">Not observed — flagged, not scored.</div> : sec.items.map((it) => {
                const v = scores[tab]?.[it.key];
                return (
                  <div key={it.key} className="border-b border-line/70 px-3 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3 text-[13.5px]">
                      <span className="text-ink">{it.label}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-navy">{v ?? "—"}<span className="text-ink-400">/{it.max}</span></span>
                    </div>
                    {(it.guide || anchors) && (
                      <p className="mt-1 text-[12px] leading-snug text-ink-500">
                        {it.guide ?? `0 ${anchors?.none ?? "not seen"} · ${Math.max(1, Math.round(it.max / 2))} ${anchors?.mid ?? "seen often, with gaps"} · ${it.max} ${anchors?.max ?? "seen throughout"}`}
                        {!it.guide && anchorsDraft && <span className="ml-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-tier3">draft guide</span>}
                      </p>
                    )}
                    {v === undefined ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-tier3-bg px-2.5 py-1 text-[12px] font-bold text-tier3">Not scored</span>
                        {it.max <= 7 ? Array.from({ length: it.max + 1 }, (_, n) => (
                          <button key={n} type="button" onClick={() => setScore(tab, it.key, n)} aria-label={`${n} of ${it.max}`}
                            className="h-10 min-w-[40px] rounded-xl bg-white px-2 text-[14px] font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand">{n}</button>
                        )) : (
                          <button type="button" onClick={() => setScore(tab, it.key, Math.round(it.max / 2))} className="h-10 rounded-full bg-white px-4 text-[13.5px] font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand">Score it · 0 to {it.max}</button>
                        )}
                      </div>
                    ) : it.max <= 7 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from({ length: it.max + 1 }, (_, n) => (
                          <button key={n} type="button" onClick={() => setScore(tab, it.key, n)} aria-pressed={v === n} aria-label={`${n} of ${it.max}`}
                            className={cx("h-10 min-w-[40px] rounded-xl px-2 text-[14px] font-bold ring-1 ring-inset", v === n ? "bg-select text-white ring-select" : "bg-white text-ink ring-hairline hover:ring-brand")}>{n}</button>
                        ))}
                        <button type="button" onClick={() => setScore(tab, it.key, undefined)} className="h-10 rounded-xl px-2 text-[12.5px] text-ink-500 hover:text-ink">Clear</button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" aria-label="Lower the score" onClick={() => setScore(tab, it.key, Math.max(0, v - 1))} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[20px] font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand">−</button>
                        <input type="number" min={0} max={it.max} value={v} aria-label={it.label}
                          onChange={(e) => setScore(tab, it.key, Math.max(0, Math.min(it.max, Number(e.target.value) || 0)))}
                          className="h-11 w-20 rounded-xl border border-ink-400 bg-zebra text-center text-[18px] font-extrabold tabular-nums text-ink" />
                        <button type="button" aria-label="Raise the score" onClick={() => setScore(tab, it.key, Math.min(it.max, v + 1))} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[20px] font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand">+</button>
                        <button type="button" onClick={() => setScore(tab, it.key, undefined)} className="ml-1 text-[12.5px] text-ink-500 hover:text-ink">Clear</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {subjects[tab] && subjects[tab].role !== "class" && (
            <div className="space-y-3 rounded-xl border border-line bg-canvas/50 p-3">
              <div className="flex items-center justify-between">
                <span className={lbl}>The One Thing for {subjects[tab].name.split(" ")[0]}</span>
                <button type="button" onClick={() => suggestOneThing(tab)} className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand hover:bg-brand-100"><Icon name="sparkle" className="h-3.5 w-3.5" /> Suggest</button>
              </div>
              <textarea value={notes[tab]?.one_thing ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [tab]: { one_thing: e.target.value, action_points: n[tab]?.action_points ?? "" } }))} rows={2} className={input} placeholder="The single most useful change for their next session" />
              <div><span className={lbl}>Action points for {subjects[tab].name.split(" ")[0]}</span>
                <input value={notes[tab]?.action_points ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [tab]: { one_thing: n[tab]?.one_thing ?? "", action_points: e.target.value } }))} className={input} /></div>
              <p className="text-[12.5px] text-ink-500">Only {subjects[tab].name.split(" ")[0]} reads this, once the segment owner releases it.</p>
            </div>
          )}
        </Block>
      ) : (
        <Block title="2 · Checklist" sub="Anything a CODED employee can see, hear or verify in the visit.">
          <div className="space-y-2">
            {(rubric?.checklist ?? []).map((c: { key: string; label: string }) => (
              <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-[13.5px]">
                <span>{c.label}</span>
                <span className="flex shrink-0 gap-1.5">
                  {[true, false].map((b) => (
                    <button key={String(b)} type="button" onClick={() => setChecklist((x) => ({ ...x, [c.key]: b }))}
                      className={cx("rounded-md px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset", checklist[c.key] === b ? (b ? "bg-tier1 text-white ring-tier1" : "bg-tier4 text-white ring-tier4") : "bg-white text-ink-500 ring-line")}>
                      {b ? "Yes" : "No"}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* Signal / Intervene */}
      <Block title="3 · Signal or Intervene" sub="Log every one with the trigger, what was said and the outcome. It is not a failure, but it factors into the score.">
        {interventions.map((iv, i) => (
          <div key={i} className="mb-3 space-y-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {["signal", "intervene"].map((k) => (
                  <button key={k} type="button" onClick={() => setInterventions((a) => a.map((x, j) => (j === i ? { ...x, kind: k } : x)))}
                    className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize ring-1 ring-inset", iv.kind === k ? "bg-navy text-white ring-navy" : "bg-white text-ink-500 ring-line")}>{k}</button>
                ))}
              </div>
              <button type="button" onClick={() => setInterventions((a) => a.filter((_, j) => j !== i))} className="text-[12.5px] text-ink-500 hover:text-tier4">Remove</button>
            </div>
            {(["trigger", "said", "outcome"] as const).map((f) => (
              <input key={f} value={iv[f]} onChange={(e) => setInterventions((a) => a.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                placeholder={{ trigger: "What triggered it", said: "What was said or done", outcome: "Outcome" }[f]} className={input} />
            ))}
          </div>
        ))}
        <button type="button" onClick={() => setInterventions((a) => [...a, { kind: "signal", trigger: "", said: "", outcome: "" }])} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand">
          <Icon name="plus" className="h-4 w-4" /> Add a Signal or Intervene
        </button>
      </Block>

      {/* Notes */}
      <Block title="4 · Notes" sub="Private until the segment owner approves them. Only segment owners deliver feedback.">
        <div className="space-y-3">
          <div><span className={lbl}>{kind === "qa" ? "Class summary (everyone scored reads this)" : "Summary"}</span><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={input} placeholder="What you saw, in plain words" /></div>
          {kind === "shadowing" && (
            <div>
              <div className="flex items-center justify-between"><span className={lbl}>The One Thing</span>
                <button type="button" onClick={() => suggestOneThing()} className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-[12px] font-semibold text-brand hover:bg-brand-100"><Icon name="sparkle" className="h-3.5 w-3.5" /> Suggest</button>
              </div>
              <textarea value={oneThing} onChange={(e) => setOneThing(e.target.value)} rows={2} className={input} placeholder="The single most useful change for the next session" />
            </div>
          )}
          {kind === "shadowing" && <div><span className={lbl}>Action points</span><input value={actions} onChange={(e) => setActions(e.target.value)} className={input} /></div>}
          <div>
            <span className={lbl}>Red flags (reach the owner the same day)</span>
            <div className="flex flex-wrap gap-2">
              {redFlagReasons.map((r) => (
                <button key={r} type="button" onClick={() => setFlags((f) => (f.includes(r) ? f.filter((x) => x !== r) : [...f, r]))}
                  className={cx("rounded-full px-3 py-1.5 text-[12.5px] ring-1 ring-inset", flags.includes(r) ? "bg-tier4 text-white ring-tier4" : "bg-white text-ink-600 ring-line")}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      </Block>

      {evidence && (
        <Block title="5 · Evidence (optional)" sub="A photo of the board or a short voice note helps the debrief. It never replaces the written report.">
          <EvidenceUpload visitId={visitId} initial={evidence} online={online} />
        </Block>
      )}

      <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-line bg-white/95 p-3 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[13px] text-ink-500">
          {kind === "qa" ? subjects.map((s, i) => `${s.name.split(" ")[0]} ${totals[i].pct ?? "—"}`).join(" · ") : `${Object.keys(checklist).length} checklist items answered`}
        </span>
        {left > 0 ? (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button type="button" disabled className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-hairline px-4 text-[14px] font-bold text-ink-500">Submit report</button>
            <span className="text-[12px] text-ink-500">{left} {left === 1 ? "item" : "items"} not scored. Score them or mark the area not observed.</span>
          </span>
        ) : !online ? (
          <button type="button" disabled={queued} onClick={() => { try { localStorage.setItem(queueKey, "1"); } catch {} setQueued(true); }}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-brand to-brand-700 px-4 text-[14px] font-bold text-white shadow-glow disabled:opacity-60">
            <Icon name="wifi" className="h-4 w-4" />{queued ? "Queued until online" : "Submit when back online"}
          </button>
        ) : <Submit icon="send">Submit report</Submit>}
      </div>
    </ActionForm>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <h3 className="text-[16px] font-extrabold tracking-[-0.01em] text-ink">{title}</h3>
      {sub && <p className="mb-3 mt-0.5 text-[13px] text-ink-500">{sub}</p>}
      {children}
    </section>
  );
}
