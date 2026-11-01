"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { NavItem } from "@/lib/session";

export function NavLinks({ groups }: { groups: { section: string; items: NavItem[] }[] }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.section}>
          <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/35">{g.section}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="nav-link" data-active={active(i.href)}>
                <Icon name={i.icon} className="h-[17px] w-[17px] opacity-90" /> {i.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Mobile drawer toggle. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-navy ring-1 ring-line lg:hidden" aria-label="Open menu">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-navy p-4 shadow-2xl">{children}</div>
        </div>
      )}
    </>
  );
}
