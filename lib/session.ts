import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./supabase";

export type Person = {
  id: string;
  full_name: string;
  arabic_name: string | null;
  email: string | null;
  roles: string[];
  home_segment: string | null;
  owned_segments: string[];
  is_full_timer: boolean;
  approval_status: string;
  cctp_rank: string | null;
  cctp_cert: string | null;
  erp_supplier_id: string | null;
  erp_service_category: string | null;
  erp_instructor_level: string | null;
  qs_instructor_level: string | null;
  erp_contractor_status: string | null;
};

/** The signed-in person (from the people table), or a redirect to the sign-in page. */
export const getMe = cache(async (): Promise<Person> => {
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  let { data } = await supabase.from("people").select("*").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!data) {
    // First sign-in of someone the system owner added: link the record that has this (confirmed) email. Needs migration 0010.
    const { data: claimed } = await supabase.rpc("claim_my_record");
    if (claimed) ({ data } = await supabase.from("people").select("*").eq("id", claimed).maybeSingle());
  }
  if (!data) redirect("/login?error=no-profile");
  return data as Person;
});

/** Role check. A program coordinator counts as operations everywhere (same rule as has_role in the database). */
export const has = (me: Person, ...roles: string[]) => roles.some((r) => me.roles.includes(r) || (r === "operations" && me.roles.includes("program_coordinator")));
export const isEducator = (me: Person) => has(me, "instructor", "ta");
export const isOwner = (me: Person) => has(me, "segment_owner");
export const isEducation = (me: Person) => has(me, "education_principal", "senior_instructor", "education_officer");
/** Program coordinators run cohorts day to day with the same powers as the operations overseer. */
export const isOps = (me: Person) => has(me, "operations", "program_coordinator");
/** Education coordinators book, reassign and chase visits; they never see scores or private notes. */
export const isEduCoordinator = (me: Person) => has(me, "education_coordinator");

export type NavItem = { href: string; label: string; icon: string };

/** Navigation follows the stakeholder views in the PRD. */
export function navFor(me: Person): { section: string; items: NavItem[] }[] {
  const out: { section: string; items: NavItem[] }[] = [];
  const home: NavItem[] = [];
  if (isEducator(me)) home.push({ href: "/me", label: "My dashboard", icon: "home" });
  if (has(me, "lead_instructor")) home.push({ href: "/team", label: "My team", icon: "users" });
  if (has(me, "cctp_candidate") && !isEducator(me)) home.push({ href: "/cctp", label: "My CCTP path", icon: "award" });
  if (isOwner(me)) home.push({ href: "/owner", label: "Segment overview", icon: "grid" });
  if (isEducation(me) && !isOwner(me)) home.push({ href: "/education", label: "Education home", icon: "compass" });
  if (isOps(me)) home.push({ href: "/ops", label: "Today", icon: "sun" });
  if (has(me, "gm")) home.push({ href: "/overview", label: "Overview", icon: "eye" });
  if (has(me, "hr")) home.push({ href: "/people", label: "People", icon: "users" });
  if (isEduCoordinator(me)) home.push({ href: "/coordinator", label: "QA calendar", icon: "calendar" });
  if (has(me, "system_owner")) home.push({ href: "/admin", label: "System", icon: "settings" });
  const approver = (has(me, "segment_owner", "education_principal", "senior_instructor", "education_officer", "hr", "gm", "system_owner", "content_creator") || isOps(me) || isEduCoordinator(me));
  if (approver) home.push({ href: "/approvals", label: "Waiting on me", icon: "inbox" });
  home.push({ href: "/calendar", label: "Calendar", icon: "calendar" });
  out.push({ section: "Home", items: home });

  const quality: NavItem[] = [];
  if (isOwner(me) || isEducation(me) || isOps(me) || isEduCoordinator(me)) quality.push({ href: "/visits", label: "Visits", icon: "clipboard" });
  if (isOwner(me)) quality.push({ href: "/feedback/release", label: "Release queue", icon: "send" });
  if (!has(me, "cctp_candidate", "candidate") || isEducator(me)) quality.push({ href: "/feedback/new", label: "Log feedback", icon: "pen" });
  if (isEducator(me) || isOps(me)) quality.push({ href: "/reviews", label: "360° reviews", icon: "repeat" });
  if (isOwner(me) || has(me, "education_principal", "senior_instructor", "hr", "gm", "system_owner", "lead_instructor"))
    quality.push({ href: "/scores", label: "Scores", icon: "chart" });
  if (isOwner(me) || has(me, "education_principal", "senior_instructor", "gm", "instructor"))
    quality.push({ href: "/master-classes", label: "Master classes", icon: "star" });
  if (quality.length) out.push({ section: "Quality", items: quality });

  const appr: NavItem[] = [];
  if ((has(me, "content_creator", "instructor", "senior_instructor", "education_principal", "segment_owner", "gm", "system_owner") || isOps(me)))
    appr.push({ href: "/approvals/content", label: "Content", icon: "book" });
  if ((has(me, "education_principal", "senior_instructor", "segment_owner", "hr", "gm", "system_owner") || isOps(me)))
    appr.push({ href: "/approvals/people", label: "People", icon: "user-check" });
  if (isOwner(me) || (has(me, "education_principal", "senior_instructor", "gm", "system_owner") || isOps(me)))
    appr.push({ href: "/cohorts", label: "Cohorts", icon: "layers" });
  if (isOwner(me) || has(me, "hr", "gm", "education_principal", "system_owner"))
    appr.push({ href: "/levels", label: "Levels & readiness", icon: "trending" });
  if (appr.length) out.push({ section: "Approvals", items: appr });

  const growth: NavItem[] = [];
  if (isEducator(me)) growth.push({ href: "/report-card", label: "Report card", icon: "doc" });
  if (isEducator(me) || isEducation(me) || isOwner(me) || has(me, "hr", "gm", "system_owner")) growth.push({ href: "/cctp", label: "CCTP", icon: "award" });
  if (isEducation(me) || isOps(me) || isEduCoordinator(me)) growth.push({ href: "/onboarding", label: "QAer onboarding", icon: "target" });
  if (has(me, "segment_owner", "education_principal", "senior_instructor", "gm", "system_owner") && !has(me, "hr"))
    growth.push({ href: "/people", label: "People", icon: "users" });
  if (growth.length) out.push({ section: "People & growth", items: dedupe(growth, home) });

  const help: NavItem[] = [{ href: "/handbook", label: "Handbook", icon: "help" }];
  if (has(me, "system_owner")) help.push({ href: "/coverage", label: "PRD coverage", icon: "map" });
  out.push({ section: "Help", items: help });
  return out;
}

function dedupe(items: NavItem[], existing: NavItem[]) {
  const seen = new Set(existing.map((i) => i.href));
  return items.filter((i) => !seen.has(i.href) && (seen.add(i.href), true));
}

export function homeFor(me: Person) {
  if (has(me, "segment_owner")) return "/owner";
  if (has(me, "system_owner")) return "/admin";
  if (has(me, "gm")) return "/overview";
  if (has(me, "hr")) return "/people";
  if (isOps(me)) return "/ops";
  if (isEduCoordinator(me)) return "/coordinator";
  if (isEducation(me)) return "/education";
  if (isEducator(me)) return "/me";
  if (has(me, "content_creator")) return "/approvals/content";
  if (has(me, "cctp_candidate")) return "/cctp";
  return "/handbook";
}

export function roleLabel(me: Person) {
  const map: Record<string, string> = {
    segment_owner: "Segment owner",
    education_principal: "Education Principal",
    senior_instructor: "Senior Instructor",
    education_officer: "Education Officer",
    operations: "Operations",
    gm: "General Manager",
    hr: "HR",
    system_owner: "System owner",
    lead_instructor: "Lead Instructor",
    instructor: "Instructor",
    ta: "Teaching Assistant",
    content_creator: "Content creator",
    cctp_candidate: "CCTP candidate",
    education_coordinator: "Education coordinator",
    program_coordinator: "Program coordinator",
  };
  for (const r of Object.keys(map)) if (me.roles.includes(r)) return map[r];
  return "Candidate";
}
