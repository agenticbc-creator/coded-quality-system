"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { cx } from "./ui";

export type CommandItem = { label: string; href: string; icon: string; group: string; hint?: string };

/** ⌘K / Ctrl+K palette: jump to any page or person you are allowed to see. */
export function CommandPalette({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => ref.current?.focus(), 10); } }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = t ? items.filter((x) => (x.label + " " + x.group + " " + (x.hint ?? "")).toLowerCase().includes(t)) : items.filter((x) => x.group !== "People");
    return r.slice(0, 14);
  }, [q, items]);

  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="hidden h-9 w-[260px] items-center gap-2 rounded-lg bg-canvas px-3 text-[13px] text-ink-500 ring-1 ring-inset ring-line transition hover:bg-white hover:ring-brand-200 md:flex">
        <Icon name="search" className="h-4 w-4" /> <span className="flex-1 text-left">Jump to a page or person</span>
        <span className="kbd">⌘K</span>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-navy ring-1 ring-line md:hidden" aria-label="Search">
        <Icon name="search" className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-950/40 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[560px] animate-rise overflow-hidden rounded-2xl border border-line bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon name="search" className="h-4 w-4 text-ink-400" />
              <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
                  if (e.key === "Enter" && list[i]) go(list[i].href);
                }}
                placeholder="Search pages, people, cohorts…" className="h-12 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-400" />
              <span className="kbd">esc</span>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {list.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-500">Nothing matches “{q}”.</li>}
              {list.map((x, k) => (
                <li key={x.href + x.label}>
                  <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(x.href)}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px]", k === i ? "bg-navy text-white" : "text-ink")}>
                    <span className={cx("grid h-7 w-7 place-items-center rounded-md", k === i ? "bg-white/15" : "bg-canvas text-navy")}><Icon name={x.icon} className="h-4 w-4" /></span>
                    <span className="flex-1 truncate font-medium">{x.label}</span>
                    <span className={cx("text-[11.5px]", k === i ? "text-white/60" : "text-ink-400")}>{x.hint ?? x.group}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 border-t border-line bg-zebra px-4 py-2 text-[11px] text-ink-500">
              <span><span className="kbd">↑</span> <span className="kbd">↓</span> move</span><span><span className="kbd">↵</span> open</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
