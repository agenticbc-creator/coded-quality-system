import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Avatar, Badge, Card, CardTitle, Empty, Field, Notice, PageHeader, Stat, Table, cx, input, td } from "@/components/ui";
import { ActionForm, Disclosure, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { cctpBook, cctpEnrol, cctpProgress, cctpRecord } from "@/app/actions";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata = { title: "CODED Certified Trainer Program" };

const RANKS = [
  { name: "Newcomer", at: 0 }, { name: "Junior Trainer", at: 19 }, { name: "Trainer", at: 34 },
  { name: "Senior Trainer", at: 68 }, { name: "Lead Trainer", at: 93 }, { name: "Path Complete", at: 100 },
];
const STATUS: Record<string, [string, "brand" | "green" | "amber" | "red" | "neutral" | "navy"]> = {
  learning: ["Learning", "brand"], ready: ["Ready to book", "amber"], booked: ["Mock booked", "navy"], certified: ["Certified", "green"], not_yet: ["Not Yet · retake", "red"],
};

function Ladder({ lessons }: { lessons: number }) {
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[15px] h-[3px] bg-white/15" />
      <div className="absolute left-0 top-[15px] h-[3px] bg-[#7FB0EE] transition-all" style={{ width: `${Math.min(100, lessons)}%` }} />
      <div className="relative flex justify-between">
        {RANKS.map((r) => {
          const done = lessons >= r.at;
          return (
            <div key={r.name} className="flex w-0 flex-col items-center" style={{ flex: "0 0 auto" }}>
              <span className={cx("grid h-8 w-8 place-items-center border-2 text-[11px] font-bold tabular-nums", done ? "border-white bg-white text-navy" : "border-white/30 bg-navy text-white/50")}>{r.at}</span>
              <span className={cx("mt-2 w-20 text-center text-[11px] leading-tight", done ? "text-white" : "text-white/45")}>{r.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function CCTP() {
  const me = await getMe();
  const supabase = await db();
  const manage = has(me, "education_principal", "senior_instructor");
  const [{ data: enrol }, { data: bookings }, { data: rubricRow }, { data: people }, { data: myResults }] = await Promise.all([
    supabase.from("cctp_enrolments").select("*, person:people!cctp_enrolments_person_id_fkey(id, full_name, roles, cctp_rank, cctp_cert, erp_supplier_id)").order("lessons_completed", { ascending: false }),
    supabase.from("cctp_bookings").select("*, person:people!cctp_bookings_person_id_fkey(id, full_name), result:mock_results(total, result, feedback, scores, critical_failures)").order("scheduled_for", { ascending: false }),
    supabase.from("settings").select("value").eq("key", "cctp_mock_rubric").maybeSingle(),
    manage ? supabase.from("people").select("id, full_name, roles, cctp_cert, erp_supplier_id").order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("mock_results").select("*").eq("person_id", me.id).order("created_at", { ascending: false }),
  ]);
  const rubric = rubricRow?.value as { items: { key: string; label: string; max: number }[]; critical: { key: string; label: string }[] };
  const list = (enrol ?? []) as any[];
  const mine = list.find((e) => e.person_id === me.id);
  const myBookings = ((bookings ?? []) as any[]).filter((b) => b.person_id === me.id);
  const open = ((bookings ?? []) as any[]).filter((b) => b.status === "booked");
  const enrolled = new Set(list.map((e) => e.person_id));
  const candidates = ((people ?? []) as any[]).filter((p) => !enrolled.has(p.id) && !p.cctp_cert && (p.erp_supplier_id || p.roles.includes("cctp_candidate")));
  const certified = list.filter((e) => e.status === "certified").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="H · CODED Certified Trainer Program" title="CCTP"
        sub="100 lessons on the Trainer Learning Path, six ranks, then one live mock class scored on the 100-point rubric. 90+ is CCT, 80–89 is CCTA, anything else is Not Yet with a retake." />

      {mine || me.cctp_cert ? (
        <section className="blueprint overflow-hidden rounded-2xl p-6 text-white md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Your path</div>
              <div className="mt-2 text-[34px] font-extrabold leading-none tracking-tight">{me.cctp_cert ? `Certified ${me.cctp_cert}` : me.cctp_rank ?? "Newcomer"}</div>
              <div className="mt-2 text-[14px] text-white/70">{mine ? <><span className="font-semibold text-white">{mine.lessons_completed}</span> of 100 lessons · {STATUS[mine.status]?.[0]}</> : "Certified trainer"}</div>
            </div>
            {me.cctp_cert && (
              <div className="frame-corners border border-white/25 px-5 py-4 text-center">
                <Icon name="award" className="mx-auto h-7 w-7 text-[#7FB0EE]" />
                <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.16em]">CODED Certified</div>
                <div className="text-[22px] font-extrabold">{me.cctp_cert === "CCT" ? "Trainer" : "Trainer Associate"}</div>
              </div>
            )}
          </div>
          {mine && <div className="mt-8 px-3"><Ladder lessons={mine.lessons_completed} /></div>}
          {mine && mine.lessons_completed >= 100 && !["booked", "certified"].includes(mine.status) && (
            <ActionForm action={cctpBook} className="mt-8 flex flex-wrap items-end gap-3 rounded-xl bg-white/[0.07] p-4 ring-1 ring-white/15">
              <div className="min-w-[220px] flex-1">
                <span className="mb-1.5 block text-[12.5px] font-medium text-white/80">{mine.status === "not_yet" ? "Book your retake" : "You have completed the path. Book your live mock class"}</span>
                <input type="datetime-local" name="when" required className={cx(input, "bg-white")} />
              </div>
              <Submit icon="calendar">Book mock class</Submit>
            </ActionForm>
          )}
          {myBookings.filter((b) => b.status === "booked").map((b) => (
            <div key={b.id} className="mt-6 flex items-center gap-3 rounded-xl bg-white/[0.07] px-4 py-3 text-[13.5px] ring-1 ring-white/15">
              <Icon name="calendar" className="h-4 w-4 text-[#7FB0EE]" /> Mock class booked for <b>{fmtDateTime(b.scheduled_for)}</b>. The Education team will confirm the room.
            </div>
          ))}
        </section>
      ) : !manage ? (
        <Notice title="You are not enrolled yet">The Education team enrols alumni and contractors onto the Trainer Learning Path. Ask the Education Principal if you would like to start.</Notice>
      ) : null}

      {myResults && myResults.filter((r: any) => r.context === "cctp").length > 0 && (
        <Card>
          <CardTitle icon="doc" sub="Your mock-class results with written feedback.">My mock classes</CardTitle>
          <div className="space-y-3">
            {(myResults as any[]).filter((r) => r.context === "cctp").map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex items-center justify-between"><span className="text-[13px] text-ink-500">{fmtDate(r.created_at)}</span><Badge tone={r.result === "not_yet" ? "red" : "green"}>{r.total}/100 · {r.result === "not_yet" ? "Not Yet" : r.result}</Badge></div>
                <p className="mt-2 text-[13.5px] leading-relaxed">{r.feedback}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {manage || has(me, "segment_owner", "hr", "gm", "system_owner") ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="On the path" value={list.filter((e) => e.status === "learning").length} icon="ladder" />
            <Stat label="Ready or booked" value={list.filter((e) => ["ready", "booked"].includes(e.status)).length} icon="calendar" tone="amber" />
            <Stat label="Certified via CCTP" value={certified} icon="award" tone="green" />
            <Stat label="Not Yet (retake)" value={list.filter((e) => e.status === "not_yet").length} icon="repeat" tone="red" />
          </div>

          {manage && open.length > 0 && (
            <Card>
              <CardTitle icon="clipboard" sub="Score on the CCTP rubric. Any critical failure means Not Yet, whatever the total.">Mock classes to score</CardTitle>
              <div className="space-y-4">
                {open.map((b) => (
                  <div key={b.id} className="rounded-xl border border-line">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-zebra px-4 py-3">
                      <div className="flex items-center gap-3"><Avatar name={b.person.full_name} /><div><div className="text-[14px] font-semibold text-navy">{b.person.full_name}</div><div className="text-[12px] text-ink-500">{fmtDateTime(b.scheduled_for)}</div></div></div>
                      <Badge tone="navy">Booked</Badge>
                    </div>
                    <div className="p-4">
                      <Disclosure label="Score this mock class" icon="pen" variant="primary">
                        <ActionForm action={cctpRecord} className="space-y-4">
                          <input type="hidden" name="booking" value={b.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            {rubric.items.map((it) => (
                              <Field key={it.key} label={`${it.label} (0–${it.max})`}>
                                <input type="number" name={`s_${it.key}`} min={0} max={it.max} required className={input} />
                              </Field>
                            ))}
                          </div>
                          <div>
                            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-600">Critical failures</span>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {rubric.critical.map((c) => (
                                <label key={c.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]"><input type="checkbox" name="critical" value={c.key} className="accent-[#B42E28]" /> {c.label}</label>
                              ))}
                            </div>
                          </div>
                          <Field label="Written feedback (required)"><textarea name="feedback" rows={3} required className={input} /></Field>
                          <Field label="Recording link (optional)" hint="A Drive or Teams link to the recording of the session."><input name="recording" type="url" className={input} placeholder="https://" /></Field>
                          <Submit icon="check">Save result</Submit>
                        </ActionForm>
                      </Disclosure>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle icon="ladder" sub="Lessons and rank come from the Trainer Learning Path; enter progress here until the hub feed is connected."
              right={manage ? (
                <Disclosure label="Enrol someone" variant="primary">
                  <ActionForm action={cctpEnrol} className="w-[min(90vw,420px)] space-y-3 rounded-xl border border-line bg-white p-4 shadow-lift">
                    <Field label="Person"><select name="person" required className={input}>{candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
                    <Field label="Source"><select name="source" className={input}><option value="contractor">Contractor record</option><option value="alumni">CODED alumni</option><option value="staff">Staff</option></select></Field>
                    <Submit>Enrol</Submit>
                  </ActionForm>
                </Disclosure>
              ) : undefined}>
              Candidates
            </CardTitle>
            {list.length === 0 ? <Empty title="Nobody enrolled yet" /> : (
              <Table head={["Person", "Source", "Progress", "Rank", "Status", manage ? "Update" : ""]}>
                {list.map((e) => (
                  <tr key={e.person_id}>
                    <td className={td}><Link href={e.person.erp_supplier_id ? `/people/${e.person_id}` : "#"} className="flex items-center gap-2.5 font-medium text-navy hover:text-brand"><Avatar name={e.person.full_name} size={28} />{e.person.full_name}</Link></td>
                    <td className={cx(td, "capitalize text-ink-500")}>{e.source}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-brand" style={{ width: `${e.lessons_completed}%` }} /></div><span className="tabular-nums text-[12.5px]">{e.lessons_completed}</span></div>
                    </td>
                    <td className={td}>{e.person.cctp_cert ? <Badge tone="green"><Icon name="award" className="h-3 w-3" />{e.person.cctp_cert}</Badge> : e.person.cctp_rank ?? "Newcomer"}</td>
                    <td className={td}><Badge tone={STATUS[e.status]?.[1]}>{STATUS[e.status]?.[0]}</Badge></td>
                    <td className={td}>
                      {manage && !["certified", "booked"].includes(e.status) && (
                        <ActionForm action={cctpProgress} className="flex items-center gap-2">
                          <input type="hidden" name="person" value={e.person_id} />
                          <input type="number" name="lessons" min={0} max={100} defaultValue={e.lessons_completed} className={cx(input, "w-20 py-1.5")} />
                          <Submit size="sm" variant="secondary">Save</Submit>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <CardTitle icon="repeat" sub="Every mock class, with the recording where one was made.">Mock-class history</CardTitle>
            <Table head={["When", "Person", "Result", "Recording"]}>
              {((bookings ?? []) as any[]).filter((b) => b.status === "completed").map((b) => (
                <tr key={b.id}>
                  <td className={td}>{fmtDate(b.scheduled_for)}</td>
                  <td className={cx(td, "font-medium text-navy")}>{b.person.full_name}</td>
                  <td className={td}><Badge tone={b.result?.result === "not_yet" ? "red" : "green"}>{b.result?.total}/100 · {b.result?.result === "not_yet" ? "Not Yet" : b.result?.result}</Badge>{b.result?.critical_failures?.length ? <span className="ml-2 text-[12px] text-tier4">critical: {b.result.critical_failures.join(", ").replace(/_/g, " ")}</span> : null}</td>
                  <td className={td}>{b.recording_url ? <a href={b.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Icon name="play" className="h-3.5 w-3.5" /> Watch</a> : <span className="text-ink-400">—</span>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : null}

      <Card>
        <CardTitle icon="target" sub="From the CCTP program page. Critical failures override the total.">The mock-class rubric</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rubric.items.map((it) => (
            <div key={it.key} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[13px]"><span>{it.label}</span><span className="font-bold tabular-nums text-navy">{it.max}</span></div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {rubric.critical.map((c) => <Badge key={c.key} tone="red"><Icon name="alert" className="h-3 w-3" />{c.label}</Badge>)}
        </div>
      </Card>
    </div>
  );
}
