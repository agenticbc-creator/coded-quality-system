import { NextResponse, type NextRequest } from "next/server";
import { adminDb, hasServiceKey, sendEmail } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Daily email run (Vercel Cron, 07:00 Kuwait, one hour after the database's own daily jobs).
 * Emails each notification created in the last two days that has not been emailed yet, then marks it.
 * Off until CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY and EMAIL_FROM are set and migration 0010 has run.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  if (!hasServiceKey()) return NextResponse.json({ skipped: "SUPABASE_SERVICE_ROLE_KEY is not set" });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ skipped: "Email is not configured" });

  const db = adminDb();
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data, error } = await db.from("notifications")
    .select("id, title, body, link, person:people(email, full_name)")
    .is("emailed_at", null).gte("created_at", since).order("created_at").limit(400);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = (process.env.APP_URL || "https://coded-quality-system.vercel.app").replace(/\/$/, "");
  let sent = 0, failed = 0;
  for (const n of (data ?? []) as any[]) {
    const to = n.person?.email;
    if (!to || to.endsWith("@demo.coded.test")) continue; // demo personas never get email
    const link = typeof n.link === "string" && n.link.startsWith("/") ? `${base}${n.link}` : base;
    const ok = await sendEmail(to, `${n.title} · CODED Quality`, `${n.body ? `${n.body}\n\n` : ""}Open: ${link}\n\nCODED Quality · you get this because something needs you in the system.`);
    if (ok) { sent++; await db.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id); }
    else failed++;
  }
  return NextResponse.json({ sent, failed });
}
