"use client";

import { useState } from "react";
import { ActionForm, Submit } from "./forms";
import { feedbackLog } from "@/app/actions";
import { Field, cx, input } from "./ui";
import { Icon } from "./icons";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";

type Option = { person: string; name: string; cohort: string | null; classroom: string | null; where: string };

export function FeedbackForm({ options, reasons, meId, canAttach = false }: { options: Option[]; reasons: string[]; meId?: string; canAttach?: boolean }) {
  const [attachment, setAttachment] = useState<{ path: string; name: string } | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  async function attach(file: File) {
    if (!meId) return;
    setUpErr(null); setUploading(true);
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("Files up to 15 MB");
      const path = `feedback/${meId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`;
      const { error } = await createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY).storage.from("evidence").upload(path, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      setAttachment({ path, name: file.name });
    } catch (e: any) { setUpErr(e?.message ?? "Upload failed"); } finally { setUploading(false); }
  }
  const [sel, setSel] = useState(0);
  const [type, setType] = useState("praise");
  const [severity, setSeverity] = useState("positive");
  const o = options[sel];
  return (
    <ActionForm action={feedbackLog} resetOnSuccess onDone={() => { setAttachment(null); setSel(0); setUpErr(null); }} className="space-y-5">
      <input type="hidden" name="subject" value={o?.person ?? ""} />
      <input type="hidden" name="cohort" value={o?.cohort ?? ""} />
      <input type="hidden" name="classroom" value={o?.classroom ?? ""} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="severity" value={severity} />
      <input type="hidden" name="attachment" value={attachment ? `evidence:${attachment.path}` : ""} />
      <Field label="About">
        <select value={sel} onChange={(e) => setSel(Number(e.target.value))} className={input}>
          {options.map((x, i) => <option key={i} value={i}>{x.name} — {x.where}</option>)}
        </select>
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-600">Type</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["praise", "Praise"], ["coaching", "Coaching point"], ["concern", "Concern"], ["incident", "Incident"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setType(k); setSeverity(k === "praise" ? "positive" : k === "incident" ? "serious" : "minor"); }}
              className={cx("rounded-lg px-3 py-2.5 text-[13.5px] font-medium ring-1 ring-inset", type === k ? "bg-navy text-white ring-navy" : "bg-white text-ink-600 ring-line")}>{l}</button>
          ))}
        </div>
      </div>
      {type !== "praise" && (
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-600">Severity</span>
          <div className="grid grid-cols-3 gap-2">
            {[["minor", "Minor"], ["serious", "Serious"], ["red_flag", "Red flag"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSeverity(k)}
                className={cx("rounded-lg px-3 py-2 text-[13.5px] font-medium ring-1 ring-inset", severity === k ? (k === "red_flag" ? "bg-tier4 text-white ring-tier4" : "bg-navy text-white ring-navy") : "bg-white text-ink-600 ring-line")}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {severity === "red_flag" && (
        <Field label="Red-flag reason" hint="Skips the queue and reaches the segment owner the same day.">
          <select name="red_flag_reason" required className={input}>{reasons.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
      )}
      <Field label="What you saw" hint="Facts, in plain words. Saved instantly with your name and the time; you can edit until it is reviewed.">
        <textarea name="body" rows={4} required className={input} />
      </Field>
      {canAttach && meId && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className={cx("inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand", uploading && "pointer-events-none opacity-50")}>
            <Icon name="camera" className="h-4 w-4" />{uploading ? "Uploading…" : attachment ? "Replace the photo" : "Attach a photo (optional)"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void attach(f); }} />
          </label>
          {attachment && <span className="text-ink-600">{attachment.name} <button type="button" onClick={() => setAttachment(null)} className="text-ink-500 underline">remove</button></span>}
          {upErr && <span role="alert" className="text-tier4">{upErr}</span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink-500">Private by default — only the segment owner can share it.</span>
        <Submit icon="pen">Log feedback</Submit>
      </div>
    </ActionForm>
  );
}
