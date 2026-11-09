"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { btn, input, label } from "@/components/ui";

export function ResetForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setBusy(true);
    // The same message shows whether or not the email has an account, so the form does not reveal who is in the system.
    // Implicit flow: the link carries the session itself, so it also works when opened on another device (a phone, say).
    // A plain client is used because the SSR browser client always switches to PKCE; it keeps no session of its own.
    await createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      .auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login/set-password` });
    setBusy(false); setSent(true);
  }
  if (sent) return <p className="mt-5 rounded-lg bg-tier1-bg px-3 py-2 text-[13.5px] text-[#0A5A3E]">If that email has an account, a reset link is on its way. It works once.</p>;
  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <div><span className={label}>Work email</span><input name="email" type="email" autoComplete="email" required className={input} /></div>
      <button disabled={busy} className={btn("primary")}>{busy ? "Sending…" : "Email me a link"}</button>
    </form>
  );
}
