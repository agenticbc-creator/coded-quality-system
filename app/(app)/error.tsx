"use client";

import { Icon } from "@/components/icons";

/** Friendly error screen with a retry, instead of the framework's default page. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-line bg-white p-8 text-center shadow-card">
      <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-tier4-bg text-tier4"><Icon name="alert" className="h-5 w-5" /></span>
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">This page did not load</h1>
      <p className="mt-2 text-[14.5px] text-ink-600">Nothing you entered was lost. Try again; if it keeps happening, tell the system owner{error.digest ? ` and quote reference ${error.digest}` : ""}.</p>
      <button type="button" onClick={reset} className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-br from-brand to-brand-700 px-5 text-[14px] font-bold text-white shadow-glow">Try again</button>
    </div>
  );
}
