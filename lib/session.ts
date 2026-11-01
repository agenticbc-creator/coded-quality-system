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
  const { data } = await supabase.from("people").select("*").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!data) redirect("/login?error=no-profile");
  return data as Person;
});

export const has = (me: Person, ...roles: string[]) => roles.some((r) => me.roles.includes(r));
export const isEducator = (me: Person) => has(me, "instructor", "ta");
export const isOwner = (me: Person) => has(me, "segment_owner");
export const isEducation = (me: Person) => has(me, "education_principal", "senior_instructor", "education_officer");

export type NavItem = { href: string; label: string; icon: string };

/** Navigation follows the stakeholder views in the PRD. */
export function navFor(me: Person): { section: string; items: NavItem[] }[] {
  const out: { section: string; items: NavItem[] }[] = [];
  const work: NavItem[] = [];
  if (isEducator(me)) work.push({ href: "/me", label: "My dashboard", icon: "home" });
  if (isOwner(me)) work.push({ href: "/owner", label: "Segment overview", icon: "grid" });
  if (has(me, "operations")) work.push({ href: "/ops", label: "Today", icon: "sun" });
  if (has(me, "gm")) work.push({ href: "/overview", label: "Overview", icon: "eye" });
  if (has(me, "hr")) work.push({ href: "/people", label: "People", icon: "users" });
  if (has(me, "system_owner")) work.push({ href: "/admin", label: "System", icon: "settings" });
  if (has(me, "education_principal", "senior_instructor", "education_officer") && !isOwner(me))
    work.push({ href: "/visits", label: "My visits", icon: "clipboard" });
  if (work.length) out.push({ section: "Home", items: work });

  const quality: NavItem[] = [];
  if (isOwner(me) || isEducation(me) || has(me, "operations")) quality.push({ href: "/visits", label: "Visits", icon: "clipboard" });
  if (isOwner(me)) quality.push({ href: "/feedback/release", label: "Release queue", icon: "send" });
  quality.push({ href: "/feedback/new", label: "Log feedback", icon: "pen" });
  if (isEducator(me) || has(me, "operations")) quality.push({ href: "/reviews", label: "360° reviews", icon: "repeat" });
  if (isOwner(me) || has(me, "education_principal", "senior_instructor", "hr", "gm", "system_owner") || has(me, "lead_instructor"))
    quality.push({ href: "/scores", label: "Scores", icon: "chart" });
  out.push({ section: "Quality", items: dedupe(quality, work) });

  const appr: NavItem[] = [];
  if (has(me, "content_creator", "instructor", "senior_instructor", "education_principal", "segment_owner", "operations", "gm", "system_owner"))
    appr.push({ href: "/approvals/content", label: "Content", icon: "book" });
  if (has(me, "education_principal", "senior_instructor", "segment_owner", "hr", "operations", "gm", "system_owner"))
    appr.push({ href: "/approvals/people", label: "People", icon: "user-check" });
  if (isOwner(me) || has(me, "operations", "education_principal", "senior_instructor", "gm", "system_owner"))
    appr.push({ href: "/cohorts", label: "Cohorts", icon: "layers" });
  if (appr.length) out.push({ section: "Approvals", items: appr });

  if (has(me, "segment_owner", "education_principal", "senior_instructor", "gm", "system_owner") && !has(me, "hr"))
    out.push({ section: "Directory", items: [{ href: "/people", label: "People", icon: "users" }] });
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
  if (has(me, "operations")) return "/ops";
  if (has(me, "education_principal")) return "/approvals/content";
  if (has(me, "senior_instructor", "education_officer")) return "/visits";
  if (isEducator(me)) return "/me";
  if (has(me, "content_creator")) return "/approvals/content";
  return "/me";
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
  };
  for (const r of Object.keys(map)) if (me.roles.includes(r)) return map[r];
  return "Candidate";
}
