"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { cx, input } from "./ui";

type Item = { key: string; label: string; max: number; guide?: string };
type Section = { key: string; label: string; items: Item[] };
type Rubric = Record<string, any>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";
const uniq = (base: string, taken: string[]) => { let k = base, n = 2; while (taken.includes(k)) k = `${base}_${n++}`; return k; };

/**
 * Edits a QA template's rubric as sections and items instead of raw JSON. Keys of existing items never change,
 * so scores already given stay readable; new items get a key from their label. Posts the rubric as JSON in "rubric".
 */
export function RubricEditor({ initial, kind }: { initial: Rubric; kind: string }) {
  const [r, setR] = useState<Rubric>(() => JSON.parse(JSON.stringify(initial ?? {})));
  const [raw, setRaw] = useState(false);
  const roles = Object.keys(r).filter((k) => r[k]?.sections);

  const upd = (fn: (x: Rubric) => void) => setR((cur) => { const n = JSON.parse(JSON.stringify(cur)); fn(n); return n; });
  const total = (role: string) => (r[role].sections as Section[]).reduce((a, s) => a + s.items.reduce((b, i) => b + (Number(i.max) || 0), 0), 0);

  if (kind === "shadowing") {
    const list: { key: string; label: string }[] = r.checklist ?? [];
    return (
      <div className="space-y-2">
        <input type="hidden" name="rubric" value={JSON.stringify(r)} />
        {list.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2">
            <input value={c.label} onChange={(e) => upd((x) => { x.checklist[i].label = e.target.value; })} className={input} aria-label="Checklist item" />
            <button type="button" onClick={() => upd((x) => { x.checklist.splice(i, 1); })} className="text-ink-500 hover:text-tier4" aria-label="Remove item"><Icon name="x" className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => upd((x) => { x.checklist = x.checklist ?? []; x.checklist.push({ key: uniq("check", x.checklist.map((c: any) => c.key)), label: "New checklist item" }); })}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand"><Icon name="plus" className="h-4 w-4" /> Add a checklist item</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="rubric" value={JSON.stringify(r)} />
      <div className="flex justify-end">
        <button type="button" onClick={() => setRaw((v) => !v)} className="text-[12.5px] font-semibold text-ink-500 hover:text-ink">{raw ? "Back to the form" : "Show the JSON"}</button>
      </div>
      {raw ? <pre className="max-h-72 overflow-auto rounded-lg bg-canvas p-3 text-[12px]">{JSON.stringify(r, null, 2)}</pre> : roles.map((role) => (
        <div key={role} className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-[14px] text-ink">{r[role].label ?? role}</b>
            <span className="tabular-nums text-[12.5px] text-ink-500">Total {total(role)}</span>
          </div>
          {(r[role].sections as Section[]).map((s, si) => (
            <div key={s.key} className="mb-3 rounded-lg bg-canvas/60 p-2.5 last:mb-0">
              <div className="mb-2 flex items-center gap-2">
                <input value={s.label} onChange={(e) => upd((x) => { x[role].sections[si].label = e.target.value; })} className={cx(input, "font-bold")} aria-label="Section name" />
                <button type="button" onClick={() => upd((x) => { x[role].sections.splice(si, 1); })} className="shrink-0 text-ink-500 hover:text-tier4" aria-label="Remove section"><Icon name="x" className="h-4 w-4" /></button>
              </div>
              {s.items.map((it, ii) => (
                <div key={it.key} className="mb-2 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_84px_28px]">
                  <input value={it.label} onChange={(e) => upd((x) => { x[role].sections[si].items[ii].label = e.target.value; })} className={input} aria-label="Item" />
                  <input type="number" min={1} max={20} value={it.max} onChange={(e) => upd((x) => { x[role].sections[si].items[ii].max = Math.max(1, Math.min(20, Number(e.target.value) || 1)); })} className={cx(input, "tabular-nums")} aria-label="Points" />
                  <button type="button" onClick={() => upd((x) => { x[role].sections[si].items.splice(ii, 1); })} className="text-ink-500 hover:text-tier4" aria-label="Remove item"><Icon name="x" className="h-4 w-4" /></button>
                  <input value={it.guide ?? ""} onChange={(e) => upd((x) => { const v = e.target.value; if (v) x[role].sections[si].items[ii].guide = v; else delete x[role].sections[si].items[ii].guide; })}
                    placeholder="Scoring guide for this item (optional): what 0, the middle and full marks look like" className={cx(input, "text-[13px] sm:col-span-3")} aria-label="Scoring guide" />
                </div>
              ))}
              <button type="button" onClick={() => upd((x) => { const items = x[role].sections[si].items; items.push({ key: uniq(slug(`${s.key}_item`), items.map((i: Item) => i.key)), label: "New item", max: 4 }); })}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand"><Icon name="plus" className="h-4 w-4" /> Add an item</button>
            </div>
          ))}
          <button type="button" onClick={() => upd((x) => { const secs = x[role].sections; secs.push({ key: uniq("section", secs.map((q: Section) => q.key)), label: "New section", items: [] }); })}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand"><Icon name="plus" className="h-4 w-4" /> Add a section</button>
        </div>
      ))}
    </div>
  );
}
