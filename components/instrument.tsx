"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionForm, Submit } from "./forms";
import { visitSubmit } from "@/app/actions";
import { Icon } from "./icons";
import { cx, input, label as lbl } from "./ui";

type Item = { key: string; label: string; max: number };
type Section = { key: string; label: string; items: Item[] };
type Subject = { id: string | null; name: string; role: "instructor" | "ta" | "class" };

export function VisitInstrument({ visitId, kind, rubric, subjects, redFlagReasons }: {
  visitId: string; kind: "qa" | "shadowing"; rubric: any; subjects: Subject[]; redFlagReasons: string[];
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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  // Offline draft (E6): everything is kept on this device until submitted.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const d = JSON.parse(raw);
        setAttendance(d.attendance ?? "full"); setUnobserved(d.unobserved ?? []); setScores(d.scores ?? {}); setChecklist(d.checklist ?? {});
        setInterventions(d.interventions ?? []); setFlags(d.flags ?? []); setSummary(d.summary ?? ""); setOneThing(d.oneThing ?? ""); setActions(d.actions ?? "");
        setSavedAt(d.savedAt ?? null);
      }
    } catch {}
    const on = () => setOnline(navigator.onLine);
    on(); window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, [storeKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        localStorage.setItem(storeKey, JSON.stringify({ attendance, unobserved, scores, checklist, interventions, flags, summary, oneThing, actions, savedAt: now }));
        setSavedAt(now);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [storeKey, attendance, unobserved, scores, checklist, interventions, flags, summary, oneThing, actions]);

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
  const suggestOneThing = () => {
    let worst: { label: string; ratio: number; who: string } | null = null;
    subjects.forEach((s, i) => sectionsFor(s.role).forEach((sec) => {
      if (unobserved.includes(sec.key)) return;
      sec.items.forEach((it) => {
        const v = scores[i]?.[it.key];
        if (v === undefined) return;
        const ratio = v / it.max;
        if (!worst || ratio < worst.ratio) worst = { label: it.label, ratio, who: s.role === "class" ? "the class" : s.name.split(" ")[0] };
      });
    }));
    const w = worst as { label: string; ratio: number; who: string } | null;
    if (!w) { setOneThing("Score at least one item first, then Suggest picks the area with the most room to grow."); return; }
    const focus = w.label.split(/[:;(]/)[0].trim();
    setOneThing(`Next session, ${w.who === "the class" ? "focus the room on" : `${w.who}, focus on`}: ${focus.charAt(0).toLowerCase() + focus.slice(1)} — this scored lowest today (${Math.round(w.ratio * 100)}%).`);
  };

  const payload = subjects.map((s, i) => ({ subject_person_id: s.id, subject_role: s.role, scores: scores[i] ?? {} }));

  return (
    <ActionForm action={visitSubmit} onDone={() => { try { localStorage.removeItem(storeKey); } catch {} }} className="space-y-5">
      <input type="hidden" name="visit" value={visitId} />
      <input type="hidden" name="attendance" value={attendance} />
      <input type="hidden" name="unobserved" value={JSON.stringify(unobserved)} />
      <input type="hidden" name="scores" value={JSON.stringify(kind === "qa" ? payload : [])} />
      <input type="hidden" name="checklist" value={JSON.stringify(kind === "shadowing" ? checklist : null)} />
      <input type="hidden" name="interventions" value={JSON.stringify(interventions)} />
      <input type="hidden" name="flags" value={JSON.stringify(flags)} />
      <input type="hidden" name="summary" value={summary} />
      <input type="hidden" name="one_thing" value={oneThing} />
      <input type="hidden" name="action_points" value={actions} />

      <div className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-[12px]", online ? "bg-canvas text-ink-500" : "bg-tier3-bg text-tier3")}>
        <span className="flex items-center gap-1.5"><Icon name={online ? "check" : "alert"} className="h-3.5 w-3.5" />{online ? "Online" : "Offline — keep going, it is saved on this device"}</span>
        <span>{savedAt ? `Draft saved ${new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      </div>

      {/* Attendance */}
      <Block title="1 · Your attendance" sub="Score only what you saw. Areas you did not observe are flagged, not scored.">
        <div className="grid grid-cols-2 gap-2">
          {(["full", "partial"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAttendance(a)} className={cx("rounded-lg px-3 py-3 text-[13.5px] font-medium ring-1 ring-inset", attendance === a ? "bg-navy text-white ring-navy" : "bg-white text-ink-600 ring-line")}>
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
                  className={cx("rounded-full px-3 py-1.5 text-[12.5px] ring-1 ring-inset", unobserved.includes(k) ? "bg-tier3-bg text-tier3 ring-[#F5DDAF]" : "bg-white text-ink-600 ring-line")}>
                  {unobserved.includes(k) && "✕ "}{l}
                </button>
              ))}
            </div>
          </div>
        )}
      </Block>

      {/* Rubric or checklist */}
      {kind === "qa" ? (
        <Block title="2 · Rubric" sub="One visit can score the instructor, each TA and the class overall.">
          <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {subjects.map((s, i) => (
              <button key={i} type="button" onClick={() => setTab(i)}
                className={cx("shrink-0 rounded-lg px-3 py-2 text-left text-[12.5px] ring-1 ring-inset", tab === i ? "bg-brand text-white ring-brand" : "bg-white text-ink-600 ring-line")}>
                <span className="block font-semibold">{s.name}</span>
                <span className={cx("block tabular-nums", tab === i ? "text-white/80" : "text-ink-500")}>{totals[i].pct ?? "—"}{incomplete[i] ? ` · ${incomplete[i]} left` : " · done"}</span>
              </button>
            ))}
          </div>
          {subjects[tab] && sectionsFor(subjects[tab].role).map((sec) => (
            <div key={sec.key} className={cx("mb-4 rounded-xl border border-line", unobserved.includes(sec.key) && "opacity-40")}>
              <div className="flex items-center justify-between border-b border-line bg-canvas/60 px-3 py-2 text-[12.5px] font-semibold text-navy">
                {sec.label}
                <span className="tabular-nums text-ink-500">{sec.items.reduce((a, it) => a + Math.min(scores[tab]?.[it.key] ?? 0, it.max), 0)}/{sec.items.reduce((a, it) => a + it.max, 0)}</span>
              </div>
              {unobserved.includes(sec.key) ? <div className="px-3 py-3 text-[12.5px] text-ink-500">Not observed — flagged, not scored.</div> : sec.items.map((it) => {
                const v = scores[tab]?.[it.key];
                return (
                  <div key={it.key} className="border-b border-line/70 px-3 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3 text-[13px]">
                      <span className="text-ink">{it.label}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-navy">{v ?? "—"}<span className="text-ink-400">/{it.max}</span></span>
                    </div>
                    <input type="range" min={0} max={it.max} step={1} value={v ?? 0} aria-label={it.label}
                      onChange={(e) => setScores((sc) => ({ ...sc, [tab]: { ...(sc[tab] ?? {}), [it.key]: Number(e.target.value) } }))}
                      className="mt-2 w-full" />
                    <div className="mt-1 flex justify-between text-[10.5px] text-ink-400"><span>0</span><span>{Math.round(it.max / 2)}</span><span>{it.max}</span></div>
                  </div>
                );
              })}
            </div>
          ))}
        </Block>
      ) : (
        <Block title="2 · Checklist" sub="Anything a CODED employee can see, hear or verify in the visit.">
          <div className="space-y-2">
            {(rubric?.checklist ?? []).map((c: { key: string; label: string }) => (
              <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-[13px]">
                <span>{c.label}</span>
                <span className="flex shrink-0 gap-1.5">
                  {[true, false].map((b) => (
                    <button key={String(b)} type="button" onClick={() => setChecklist((x) => ({ ...x, [c.key]: b }))}
                      className={cx("rounded-md px-3 py-1 text-[12px] font-medium ring-1 ring-inset", checklist[c.key] === b ? (b ? "bg-tier1 text-white ring-tier1" : "bg-tier4 text-white ring-tier4") : "bg-white text-ink-500 ring-line")}>
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
                    className={cx("rounded-md px-2.5 py-1 text-[12px] font-medium capitalize ring-1 ring-inset", iv.kind === k ? "bg-navy text-white ring-navy" : "bg-white text-ink-500 ring-line")}>{k}</button>
                ))}
              </div>
              <button type="button" onClick={() => setInterventions((a) => a.filter((_, j) => j !== i))} className="text-[12px] text-ink-500 hover:text-tier4">Remove</button>
            </div>
            {(["trigger", "said", "outcome"] as const).map((f) => (
              <input key={f} value={iv[f]} onChange={(e) => setInterventions((a) => a.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                placeholder={{ trigger: "What triggered it", said: "What was said or done", outcome: "Outcome" }[f]} className={input} />
            ))}
          </div>
        ))}
        <button type="button" onClick={() => setInterventions((a) => [...a, { kind: "signal", trigger: "", said: "", outcome: "" }])} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand">
          <Icon name="plus" className="h-4 w-4" /> Add a Signal or Intervene
        </button>
      </Block>

      {/* Notes */}
      <Block title="4 · Notes" sub="Private until the segment owner approves them. Only segment owners deliver feedback.">
        <div className="space-y-3">
          <div><span className={lbl}>Summary</span><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={input} placeholder="What you saw, in plain words" /></div>
          {kind === "qa" && (
            <div>
              <div className="flex items-center justify-between"><span className={lbl}>The One Thing</span>
                <button type="button" onClick={suggestOneThing} className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand-100"><Icon name="sparkle" className="h-3.5 w-3.5" /> Suggest</button>
              </div>
              <textarea value={oneThing} onChange={(e) => setOneThing(e.target.value)} rows={2} className={input} placeholder="The single most useful change for the next session" />
            </div>
          )}
          <div><span className={lbl}>Action points</span><input value={actions} onChange={(e) => setActions(e.target.value)} className={input} /></div>
          <div>
            <span className={lbl}>Red flags (reach the owner the same day)</span>
            <div className="flex flex-wrap gap-2">
              {redFlagReasons.map((r) => (
                <button key={r} type="button" onClick={() => setFlags((f) => (f.includes(r) ? f.filter((x) => x !== r) : [...f, r]))}
                  className={cx("rounded-full px-3 py-1.5 text-[12px] ring-1 ring-inset", flags.includes(r) ? "bg-tier4 text-white ring-tier4" : "bg-white text-ink-600 ring-line")}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      </Block>

      <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-line bg-white/95 p-3 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[12.5px] text-ink-500">
          {kind === "qa" ? subjects.map((s, i) => `${s.name.split(" ")[0]} ${totals[i].pct ?? "—"}`).join(" · ") : `${Object.keys(checklist).length} checklist items answered`}
        </span>
        <Submit icon="send">Submit report</Submit>
      </div>
    </ActionForm>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
      <h3 className="text-[14px] font-semibold text-navy">{title}</h3>
      {sub && <p className="mb-3 mt-0.5 text-[12.5px] text-ink-500">{sub}</p>}
      {children}
    </section>
  );
}
