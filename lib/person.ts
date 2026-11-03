import { db } from "./supabase";
import { currentPeriod } from "./format";

/* Loads everything the performance views need for one person.
   Row-level security decides what the signed-in user actually gets back. */
export async function loadPerson(personId: string) {
  const supabase = await db();
  const period = currentPeriod();
  const [person, composites, released, contracts, staff, surveys, plans, jdItems, jdTicks, acc] = await Promise.all([
    supabase.from("people").select("*").eq("id", personId).maybeSingle(),
    supabase.from("composites").select("*").eq("person_id", personId).order("period", { ascending: true }),
    supabase.from("released_feedback").select("*, cohort:cohorts(name), visit:visits(kind, qa_type, week_no, submitted_at)").eq("subject_id", personId).order("released_at", { ascending: false }),
    supabase.from("erp_contracts").select("*, program:programs(name), cohort:cohorts(name)").eq("person_id", personId).order("start_date", { ascending: false }),
    supabase.from("classroom_staff").select("role, is_lead, classroom:classrooms(id, name, room, cohort:cohorts(id, name, status, start_date, end_date, program:programs(name, segment_id, program_type)))").eq("person_id", personId),
    supabase.from("survey_results").select("*, cohort:cohorts(name, end_date)").eq("subject_id", personId),
    supabase.from("plans").select("*").eq("person_id", personId).order("opened_at", { ascending: false }),
    supabase.from("jd_items").select("*").order("ord"),
    supabase.from("jd_ticks").select("*, cohort:cohorts(name)").eq("person_id", personId),
    supabase.from("accountability_entries").select("*").eq("person_id", personId).order("created_at", { ascending: false }),
  ]);
  const [{ data: agg360 }, { data: writeback }, { data: reportCards }] = await Promise.all([
    supabase.rpc("review_aggregate", { p_person: personId, p_period: period }),
    supabase.rpc("erp_writeback", { p_person: personId }),
    supabase.from("report_cards").select("*").eq("person_id", personId),
  ]);
  // Added by migration 0010; both come back empty before it runs.
  const [{ data: segScores }, { data: levels }] = await Promise.all([
    supabase.rpc("person_segment_scores", { p_person: personId }),
    supabase.from("settings").select("value, status").eq("key", "signal_thresholds").maybeSingle(),
  ]);

  type Staff = { role: string; is_lead: boolean; classroom: any };
  const classrooms = ((staff.data ?? []) as Staff[]).filter((s) => s.classroom);
  const live = classrooms.filter((c) => c.classroom.cohort?.status === "live");
  const signals = await Promise.all(
    live.map(async (c) => ({ classroom: c.classroom, role: c.role, data: (await supabase.rpc("live_signals", { p_classroom: c.classroom.id })).data as any })),
  );

  return {
    period,
    person: person.data as any,
    composites: (composites.data ?? []) as any[],
    current: (composites.data ?? []).find((c: any) => c.period === period) as any,
    released: (released.data ?? []) as any[],
    contracts: (contracts.data ?? []) as any[],
    classrooms,
    surveys: (surveys.data ?? []) as any[],
    plans: (plans.data ?? []) as any[],
    jdItems: (jdItems.data ?? []) as any[],
    jdTicks: (jdTicks.data ?? []) as any[],
    acc: (acc.data ?? []) as any[],
    agg360: agg360 as any,
    writeback: writeback as any,
    reportCards: (reportCards ?? []) as any[],
    signals,
    segScores: (Array.isArray(segScores) ? segScores : []) as { segment: string; name: string; avg_pct: number; visits: number; last: string }[],
    levels: (levels?.value ?? null) as SignalLevels | null,
    levelsDraft: levels ? levels.status !== "decided" : true,
  };
}

/** Where a signal turns from "watch" to "act now". Stored in settings.signal_thresholds (draft until Education signs off). */
export type SignalLevels = {
  attendance_on_time?: { act_below: number };
  ungraded_backlog?: { act_from: number };
  completion?: { act_below: number };
  pulse?: { act_below: number };
};

/** Signal levels for screens that do not load a whole person (cohort and segment views). */
export async function signalLevels(): Promise<{ levels: SignalLevels | null; draft: boolean }> {
  const supabase = await db();
  const { data } = await supabase.from("settings").select("value, status").eq("key", "signal_thresholds").maybeSingle();
  return { levels: (data?.value ?? null) as SignalLevels | null, draft: data ? data.status !== "decided" : true };
}

export type PersonData = Awaited<ReturnType<typeof loadPerson>>;
