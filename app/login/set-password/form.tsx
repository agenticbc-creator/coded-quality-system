"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { btn, input, label } from "@/components/ui";

export function SetPasswordForm() {
  const [ready, setReady] = useState<"wait" | "ok" | "none">("wait");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    (async () => {
      // Invite links carry the session in the URL hash (#access_token=…&refresh_token=…); newer links use ?code=.
      const h = new URLSearchParams(window.location.hash.slice(1));
      const code = new URLSearchParams(window.location.search).get("code");
      try {
        if (h.get("access_token") && h.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({ access_token: h.get("access_token")!, refresh_token: h.get("refresh_token")! });
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data } = await supabase.auth.getUser();
        setReady(data.user ? "ok" : "none");
      } catch (e: any) {
        setErr(e?.message ?? "This link has expired."); setReady("none");
      }
    })();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? ""), again = String(f.get("again") ?? "");
    if (pw.length < 10) return setErr("Use at least 10 characters.");
    if (pw !== again) return setErr("The two passwords do not match.");
    setBusy(true); setErr(null);
    const { error } = await createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    window.location.assign("/");
  }

  if (ready === "wait") return <p className="mt-5 text-[13.5px] text-ink-500">Checking your link…</p>;
  if (ready === "none") return <p className="mt-5 rounded-lg bg-tier4-bg px-3 py-2 text-[13.5px] text-[#7A1F1A]">{err ?? "This link has expired or was already used."} Ask the system owner to send a new invite.</p>;
  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <div><span className={label}>New password</span><input name="password" type="password" autoComplete="new-password" required className={input} /></div>
      <div><span className={label}>Type it again</span><input name="again" type="password" autoComplete="new-password" required className={input} /></div>
      {err && <p role="alert" className="text-[13px] text-tier4">{err}</p>}
      <button disabled={busy} className={btn("primary")}>{busy ? "Saving…" : "Save and sign in"}</button>
    </form>
  );
}
