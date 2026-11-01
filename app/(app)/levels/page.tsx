import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Empty, Notice, PageHeader, cx } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { levelDecide, levelSuggest } from "@/app/actions";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Levels and readiness" };

const KIND: Record<string, { label: string; icon: string; tone: "green" | "brand" | "amber" }> = {
  promotion: { label: "Promotion", icon: "trending", tone: "green" },
  readiness: { label: "Ready to move role", icon: "arrow", tone: "brand" },
  review: { label: "Level review", icon: "alert", tone: "amber" },
};

export default async function Levels() {
  const me = await getMe();
  const supabase = await db();
  const { data } = await supabase.from("level_changes")
    .select("*, person:people!level_changes_person_id_fkey(id, full_name, cctp_cert, home_segment), owner:people!level_changes_owner_by_fkey(full_name), hrgm:people!level_changes_hrgm_by_fkey(full_name)")
    .order("created_at", { ascending: false });
  const list = (data ?? []) as any[];
  const open = list.filter((l) => l.status === "suggested");
  const done = list.filter((l) => l.status !== "suggested");
  const canAct = has(me, "segment_owner", "hr", "gm");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="B7 · P4 · instructor levels" title="Levels and readiness"
        sub="The system suggests promotions, role moves and reviews from tiers, CCTP status and red flags. A change needs the segment owner plus HR or the GM. ERPNext is then updated by HR — this system never changes it."
        actions={has(me, "segment_owner", "hr", "education_principal", "system_owner") ? (
          <ActionForm action={levelSuggest}><Submit variant="secondary" icon="refresh">Check for new suggestions</Submit></ActionForm>
        ) : undefined} />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Promotion", "CCT certified and Tier 1 for two quarters in a row."],
          ["Ready to move role", "TA with CCTA or CCT and Tier 1 results — ready to teach as an instructor."],
          ["Level review", "A red flag in the last 90 days, or Tier 4 this quarter."],
        ].map(([t, d], i) => (
          <div key={t} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-navy"><span className="grid h-6 w-6 place-items-center rounded bg-navy text-[11px] text-white">{i + 1}</span>{t}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">{d}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardTitle icon="inbox" sub="Both sign-offs are recorded with name and time.">Waiting for a decision</CardTitle>
        {open.length === 0 ? <Empty title="No open suggestions" sub="Run the check after a quarter closes." /> : (
          <div className="space-y-3">
            {open.map((l) => {
              const k = KIND[l.kind];
              return (
                <div key={l.id} className="flex flex-col gap-4 rounded-xl border border-line p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={l.person.full_name} size={38} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/people/${l.person.id}`} className="text-[14.5px] font-semibold text-navy hover:text-brand">{l.person.full_name}</Link>
                        <Badge tone={k.tone}><Icon name={k.icon} className="h-3 w-3" />{k.label}</Badge>
                        {l.person.cctp_cert && <Badge tone="green"><Icon name="award" className="h-3 w-3" />{l.person.cctp_cert}</Badge>}
                      </div>
                      <div className="mt-1 text-[13px] text-ink-600">{l.kind === "review" ? `Review at ${l.from_level ?? "current level"}` : <>{l.from_level} <Icon name="arrow" className="inline h-3 w-3" /> <b>{l.to_level}</b></>} · {l.reason}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                        <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5", l.owner_at ? "bg-tier1-bg text-tier1" : "bg-canvas text-ink-500")}>
                          <Icon name={l.owner_at ? "check" : "clock"} className="h-3 w-3" /> Segment owner{l.owner_at ? ` · ${l.owner?.full_name}, ${fmtDate(l.owner_at)}` : ""}
                        </span>
                        <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5", l.hrgm_at ? "bg-tier1-bg text-tier1" : "bg-canvas text-ink-500")}>
                          <Icon name={l.hrgm_at ? "check" : "clock"} className="h-3 w-3" /> HR or GM{l.hrgm_at ? ` · ${l.hrgm?.full_name}, ${fmtDate(l.hrgm_at)}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canAct && (
                    <ActionForm action={levelDecide} className="flex shrink-0 gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <Submit name="decision" value="approve" icon="check">Approve</Submit>
                      <Submit name="decision" value="reject" variant="danger">Reject</Submit>
                    </ActionForm>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!canAct && <Notice>You can see the suggestions; the segment owner and HR or the GM make the decision.</Notice>}

      <Card>
        <CardTitle icon="clock">Decided</CardTitle>
        {done.length === 0 ? <Empty title="Nothing decided yet" /> : (
          <ul className="divide-y divide-line">
            {done.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span><b className="text-navy">{l.person.full_name}</b> · {KIND[l.kind].label} · {l.from_level} → {l.to_level}</span>
                <Badge tone={l.status === "approved" ? "green" : "neutral"}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
