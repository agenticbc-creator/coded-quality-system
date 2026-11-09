"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { btn, cx } from "./ui";
import { Icon } from "./icons";

export type ActionResult = { ok: boolean; error?: string; message?: string; redirect?: string } | null;
type ServerAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** A form bound to a server action, with inline success / error feedback (N2). */
export function ActionForm({ action, children, className, resetOnSuccess = false, onDone }: {
  action: ServerAction; children: ReactNode; className?: string; resetOnSuccess?: boolean; onDone?: () => void;
}) {
  const [state, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onDone?.();
      if (state.redirect) router.push(state.redirect);
    }
  }, [state, resetOnSuccess, onDone, router]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state && (
        <div role="status" className={cx("mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]",
          state.ok ? "bg-tier1-bg text-[#0A5A3E]" : "bg-tier4-bg text-[#7A1F1A]")}>
          <Icon name={state.ok ? "check" : "alert"} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.ok ? state.message ?? "Saved." : state.error}</span>
        </div>
      )}
    </form>
  );
}

export function Submit({ children, variant = "primary", size = "md", name, value, icon, className }: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; name?: string; value?: string; icon?: string; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={cx(btn(variant, size), className)}>
      {pending ? <Spinner /> : icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

/** 1–5 rating row used in 360° reviews. */
export function Rating({ name, label }: { name: string; label: string }) {
  const [v, setV] = useState<number>(0);
  return (
    <div className="flex flex-col gap-2 border-b border-line/70 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[14px] text-ink">{label}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setV(n)}
            className={cx("h-9 w-9 rounded-lg text-[13.5px] font-semibold ring-1 ring-inset transition",
              v >= n ? "bg-brand text-white ring-brand" : "bg-white text-ink-500 ring-line hover:bg-canvas")}>
            {n}
          </button>
        ))}
        <input type="hidden" name={name} value={v || ""} />
      </div>
    </div>
  );
}

/** Collapsible panel for inline forms on list pages. */
export function Disclosure({ label, children, icon = "plus", variant = "secondary" }: { label: string; children: ReactNode; icon?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className={btn(variant, "sm")}>
        <Icon name={open ? "x" : icon} className="h-3.5 w-3.5" /> {open ? "Close" : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
