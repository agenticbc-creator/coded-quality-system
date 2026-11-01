"use client";

import { useMemo, useState } from "react";
import { ActionForm, Submit } from "./forms";
import { visitSchedule } from "@/app/actions";
import { Field, cx, input } from "./ui";

type Cohort = { id: string; name: string; classrooms: { id: string; name: string; staff: { id: string; name: string; role: string }[] }[]; overseers: { id: string; name: string }[] };
type Person = { id: string; name: string; roles: string[]; full_timer: boolean; unavailable: { from: string; to: string }[] };
type Template = { id: string; name: string; kind: string; focus: string; special: boolean; status: string };

export function ScheduleForm({ cohorts, people, templates, initial }: { cohorts: Cohort[]; people: Person[]; templates: Template[]; initial?: any }) {
  const [cohort, setCohort] = useState<string>(initial?.cohort_id ?? cohorts[0]?.id ?? "");
  const [classroom, setClassroom] = useState<string>(initial?.classroom_id ?? "");
  const [kind, setKind] = useState<string>(initial ? (initial.kind === "shadowing" ? "shadowing" : initial.qa_type) : "education");
  const [mode, setMode] = useState<string>(initial?.mode ?? "planned");
  const [focus, setFocus] = useState<string>(initial?.focus ?? "class");
  const [date, setDate] = useState<string>(initial?.date ?? "");

  const co = cohorts.find((c) => c.id === cohort);
  const cl = co?.classrooms.find((c) => c.id === classroom) ?? co?.classrooms[0];
  const tpls = templates.filter((t) => t.kind === (kind === "shadowing" ? "shadowing" : kind === "operations" ? "operations_qa" : "education_qa"));
  const eligible = useMemo(() => people.filter((p) => {
    if (kind === "operations") return p.roles.includes("operations");
    if (kind === "education") return p.full_timer && p.roles.some((r) => ["education_officer", "senior_instructor", "education_principal"].includes(r));
    return true; // shadowing: any authorized team member
  }), [people, kind]);
  const busy = (p: Person) => date && p.unavailable.some((u) => date >= u.from && date <= u.to);

  return (
    <ActionForm action={visitSchedule} className="space-y-5">
      {initial?.id && <input type="hidden" name="visit" value={initial.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cohort">
          <select name="cohort" value={cohort} onChange={(e) => { setCohort(e.target.value); setClassroom(""); }} className={input}>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Classroom">
          <select name="classroom" value={cl?.id ?? ""} onChange={(e) => setClassroom(e.target.value)} className={input}>
            {co?.classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-[12.5px] font-medium text-ink-600">Type</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {[["education", "Education QA", "Teaching quality, scored by an educator"], ["operations", "Operations QA", "Classroom operations"], ["shadowing", "Shadowing", "Development; checklist and notes"]].map(([k, l, h]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cx("rounded-xl p-3 text-left ring-1 ring-inset transition", kind === k ? "bg-navy text-white ring-navy" : "bg-white ring-line hover:bg-canvas")}>
              <span className="block text-[13.5px] font-semibold">{l}</span>
              <span className={cx("block text-[11.5px]", kind === k ? "text-white/70" : "text-ink-500")}>{h}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Visit type">
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
            <option value="planned">Planned (from the rotation)</option>
            <option value="popup">Pop-up (unannounced)</option>
            <option value="pulse">Pulse check (after a flag)</option>
          </select>
        </Field>
        <Field label="Focus">
          <select name="focus" value={focus} onChange={(e) => setFocus(e.target.value)} className={input}>
            <option value="class">The class overall</option>
            <option value="instructor">A specific instructor</option>
            <option value="tas">The TAs</option>
            <option value="classroom_management">Classroom management</option>
            <option value="content">The content</option>
          </select>
        </Field>
        <Field label="Template">
          <select name="template" defaultValue={initial?.template_id ?? ""} className={input}>
            <option value="">Default for this type</option>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === "draft_review" ? " (draft)" : ""}</option>)}
          </select>
        </Field>
      </div>
      {focus === "instructor" && (
        <Field label="Which instructor">
          <select name="focus_person" defaultValue={initial?.focus_person_id ?? ""} className={input}>
            {cl?.staff.filter((s) => s.role === "instructor").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Observer" hint={kind === "education" ? "CODED-internal, educational background" : kind === "operations" ? "Operations QAers" : "Any authorized team member"}>
          <select name="assignee" defaultValue={initial?.assignee_id ?? ""} className={input} required>
            <option value="" disabled>Pick a person</option>
            {eligible.map((p) => <option key={p.id} value={p.id} disabled={!!busy(p)}>{p.name}{busy(p) ? " — unavailable" : ""}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} /></Field>
        <Field label="Time (Kuwait)"><input type="time" name="time" required defaultValue={initial?.time ?? "09:30"} className={input} /></Field>
      </div>
      {kind === "education" && <p className="text-[12.5px] text-ink-500">The educator is never told about an education QA visit in advance. The observer gets a calendar invite with a reminder the day before.</p>}
      <div className="flex justify-end"><Submit icon="send">{initial?.id ? "Save and send invite" : "Schedule and send invite"}</Submit></div>
    </ActionForm>
  );
}
