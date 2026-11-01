import Link from "next/link";
import { getMe } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Card, Empty, PageHeader, cx } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { notificationsRead } from "@/app/actions";
import { ago } from "@/lib/format";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  await getMe();
  const supabase = await db();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60);
  const list = (data ?? []) as any[];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="N1 · alerts" title="Notifications" sub="Approvals waiting, decisions, visit invites, red flags and reminders. Email delivery is wired when the system moves into Portal v2."
        actions={unread ? <ActionForm action={notificationsRead}><Submit variant="secondary" size="sm" icon="check">Mark all read</Submit></ActionForm> : undefined} />
      {list.length === 0 ? <Empty title="No notifications" icon="bell" /> : (
        <Card pad={false}>
          <ul className="divide-y divide-line/70">
            {list.map((n) => {
              const red = /red flag|escalation/i.test(n.title);
              return (
                <li key={n.id}>
                  <Link href={n.link ?? "/"} className={cx("flex items-start gap-3 px-5 py-3.5 hover:bg-canvas/60", !n.read_at && "bg-brand-50/40")}>
                    <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", red ? "bg-tier4-bg text-tier4" : "bg-brand-50 text-brand")}>
                      <Icon name={red ? "flag" : /remind/i.test(n.title) ? "clock" : /invite|visit/i.test(n.title) ? "clipboard" : /approv|content/i.test(n.title) ? "check" : "bell"} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3"><span className={cx("text-[13.5px]", n.read_at ? "text-ink-600" : "font-semibold text-navy")}>{n.title}</span><span className="shrink-0 text-[11.5px] text-ink-500">{ago(n.created_at)}</span></span>
                      {n.body && <span className="block truncate text-[12.5px] text-ink-500">{n.body}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
