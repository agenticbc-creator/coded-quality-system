import Link from "next/link";
import { getMe, navFor, roleLabel } from "@/lib/session";
import { db } from "@/lib/supabase";
import { NavLinks, MobileNav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { signOut } from "@/app/actions";
import { SEGMENT } from "@/lib/format";

export const dynamic = "force-dynamic";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <svg viewBox="0 0 64 64" className="h-5 w-5"><path d="M41 22.5a12 12 0 1 0 0 19" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" /><circle cx="44" cy="32" r="4" fill="#5B9BE6" /></svg>
      </span>
      <span>
        <span className="block text-[13px] font-semibold tracking-[0.22em] text-white">CODED</span>
        <span className="block text-[11px] text-white/50">Quality &amp; Approvals</span>
      </span>
    </Link>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const supabase = await db();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const groups = navFor(me);
  const scope = me.owned_segments.length ? me.owned_segments.map((s) => SEGMENT[s]).join(" & ") : me.home_segment ? SEGMENT[me.home_segment] : null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <Brand />
      <div className="mt-7 flex-1"><NavLinks groups={groups} /></div>
      <div className="mt-6 rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2.5">
          <Avatar name={me.full_name} tone="light" size={34} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{me.full_name}</div>
            <div className="truncate text-[11.5px] text-white/55">{roleLabel(me)}{scope ? ` · ${scope}` : ""}</div>
          </div>
        </div>
        <form action={signOut} className="mt-3">
          <button className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="logout" className="h-3.5 w-3.5" /> Switch person
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto bg-navy px-3 py-5 lg:block">{sidebar}</aside>
      <div className="min-w-0">
        <header className="app-top sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-white/85 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <MobileNav>{sidebar}</MobileNav>
            <span className="hidden items-center gap-2 rounded-full bg-tier3-bg px-2.5 py-1 text-[11.5px] font-medium text-tier3 sm:inline-flex">
              <Icon name="sparkle" className="h-3.5 w-3.5" /> Sample data · names and numbers are examples
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/feedback/new" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-navy ring-1 ring-line hover:bg-canvas sm:inline-flex">
              <Icon name="pen" className="h-4 w-4" /> Log feedback
            </Link>
            <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-lg text-navy ring-1 ring-line hover:bg-canvas" aria-label="Notifications">
              <Icon name="bell" className="h-[18px] w-[18px]" />
              {!!count && (
                <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-tier4 px-1 text-[10.5px] font-semibold text-white">{count > 9 ? "9+" : count}</span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1240px] px-4 py-7 md:px-8 md:py-9">{children}</main>
      </div>
    </div>
  );
}
