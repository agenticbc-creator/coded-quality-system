"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { NavItem } from "@/lib/session";

export function NavLinks({ groups }: { groups: { section: string; items: NavItem[] }[] }) {
  const path = usePathname();
  // Longest matching link wins, so /approvals does not light up on /approvals/people.
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const best = hrefs.filter((h) => path === h || (h !== "/" && path.startsWith(h + "/"))).sort((x, y) => y.length - x.length)[0];
  const active = (href: string) => href === best;
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.section}>
          <div className="mb-1.5 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[#879AC0]">{g.section}</div>
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
      <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-ink ring-1 ring-hairline lg:hidden" aria-label="Open menu">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-chrome p-4 shadow-2xl">{children}</div>
        </div>
      )}
    </>
  );
}
