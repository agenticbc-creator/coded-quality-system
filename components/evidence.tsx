"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { visitEvidenceAdd } from "@/app/actions";
import { Icon } from "./icons";
import { cx } from "./ui";

type Item = { path: string; kind: string; label: string | null };

/** Photos and voice notes for a visit, uploaded straight to private storage (bucket "evidence"). Needs migration 0010. */
export function EvidenceUpload({ visitId, initial, online }: { visitId: string; initial: Item[]; online: boolean }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File, kind: "photo" | "voice") {
    setErr(null); setBusy(kind);
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("Files up to 15 MB");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      const path = `visit/${visitId}/${Date.now()}-${safe}`;
      const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error } = await supabase.storage.from("evidence").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message);
      const r = await visitEvidenceAdd(path, visitId, kind, file.name);
      if (!r?.ok) throw new Error(r?.error ?? "Could not record the file");
      setItems((x) => [...x, { path, kind, label: file.name }]);
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  const pick = (kind: "photo" | "voice") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void upload(f, kind);
  };
  const btnCls = (dis: boolean) => cx("inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-bold text-ink ring-1 ring-inset ring-hairline hover:ring-brand", dis && "pointer-events-none opacity-50");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className={btnCls(!online || busy !== null)}>
          <Icon name="camera" className="h-4 w-4" />{busy === "photo" ? "Uploading…" : "Add a photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick("photo")} disabled={!online || busy !== null} />
        </label>
        <label className={btnCls(!online || busy !== null)}>
          <Icon name="mic" className="h-4 w-4" />{busy === "voice" ? "Uploading…" : "Add a voice note"}
          <input type="file" accept="audio/*" capture className="sr-only" onChange={pick("voice")} disabled={!online || busy !== null} />
        </label>
      </div>
      {!online && <p className="text-[12.5px] text-tier3">Photos and voice notes upload once you are back online.</p>}
      {err && <p role="alert" className="text-[12.5px] text-tier4">{err}</p>}
      {items.length > 0 && (
        <ul className="space-y-1 text-[13px] text-ink-600">
          {items.map((i) => <li key={i.path} className="flex items-center gap-1.5"><Icon name={i.kind === "voice" ? "mic" : "camera"} className="h-3.5 w-3.5" />{i.label ?? i.path.split("/").pop()}</li>)}
        </ul>
      )}
      <p className="text-[12px] text-ink-500">Stored privately. Only you, the segment owner and the Education Principal can open them. Avoid faces of trainees where you can.</p>
    </div>
  );
}
