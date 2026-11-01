import Link from "next/link";
import { getMe, has, navFor, roleLabel } from "@/lib/session";
import { db } from "@/lib/supabase";
import { NavLinks, MobileNav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { BrandLockup } from "@/components/brand";
import { CommandPalette, type CommandItem } from "@/components/command";
import { signOut } from "@/app/actions";
import { SEGMENT } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const supabase = await db();
  const canDirectory = has(me, "segment_owner", "education_principal", "senior_instructor", "hr", "gm", "system_owner", "operations");
  const [{ count }, people, cohorts] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    canDirectory ? supabase.from("people").select("id, full_name, roles").order("full_name") : Promise.resolve({ data: [] }),
    canDirectory ? supabase.from("cohorts").select("id, name, status").order("start_date", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const groups = navFor(me);
  const scope = me.owned_segments.length ? me.owned_segments.map((s) => SEGMENT[s]).join(" & ") : me.home_segment ? SEGMENT[me.home_segment] : null;

  const commands: CommandItem[] = [
    ...groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, icon: i.icon, group: g.section }))),
    { label: "Notifications", href: "/notifications", icon: "bell", group: "Home" },
    ...((people.data ?? []) as any[]).map((p) => ({ label: p.full_name, href: `/people/${p.id}`, icon: "users", group: "People", hint: "Person" })),
    ...((cohorts.data ?? []) as any[]).map((c) => ({ label: c.name, href: `/cohorts/${c.id}`, icon: "layers", group: "Cohorts", hint: `Cohort · ${c.status}` })),
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="pb-1 pt-1"><BrandLockup /></div>
      <div className="mt-8 flex-1"><NavLinks groups={groups} /></div>
      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={me.full_name} tone="light" size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{me.full_name}</div>
            <div className="truncate text-[11.5px] text-white/55">{roleLabel(me)}{scope ? ` · ${scope}` : ""}</div>
          </div>
          <form action={signOut}>
            <button className="grid h-8 w-8 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" title="Switch person" aria-label="Switch person">
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto bg-navy px-3 py-6 lg:block">{sidebar}</aside>
      <div className="min-w-0">
        <header className="app-top sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <MobileNav>{sidebar}</MobileNav>
            <CommandPalette items={commands} />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md border border-dashed border-hairline px-2 py-1 text-[11px] font-medium text-ink-500 xl:inline-flex" title="Names and numbers are examples">
              <span className="h-1.5 w-1.5 rounded-full bg-tier3" /> Sample data
            </span>
            {!has(me, "cctp_candidate", "candidate") && (
              <Link href="/feedback/new" className="hidden h-9 items-center gap-1.5 rounded-lg bg-navy px-3 text-[13px] font-medium text-white transition hover:bg-brand sm:inline-flex">
                <Icon name="pen" className="h-4 w-4" /> Log feedback
              </Link>
            )}
            <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-lg text-navy ring-1 ring-line transition hover:bg-canvas" aria-label="Notifications">
              <Icon name="bell" className="h-[18px] w-[18px]" />
              {!!count && (
                <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10.5px] font-semibold text-white ring-2 ring-white">{count > 9 ? "9+" : count}</span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1240px] animate-rise px-4 py-7 md:px-8 md:py-9">{children}</main>
      </div>
    </div>
  );
}
