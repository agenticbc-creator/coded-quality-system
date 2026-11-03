import { NextResponse, type NextRequest } from "next/server";
import { adminDb, hasServiceKey, sendEmailBatch } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { data: sv } = await db.from("settings").select("value").eq("key", "schema_version").maybeSingle();
  if (Number((sv?.value as any)?.v ?? 0) < 10) return NextResponse.json({ skipped: "Migration 0010 has not run yet" });
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data, error } = await db.from("notifications")
    .select("id, title, body, link, person:people(email, full_name)")
    .is("emailed_at", null).gte("created_at", since).order("created_at").limit(400);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = (process.env.APP_URL || "https://coded-quality-system.vercel.app").replace(/\/$/, "");
  // Demo personas never get email.
  const due = ((data ?? []) as any[]).filter((n) => n.person?.email && !String(n.person.email).endsWith("@demo.coded.test"));
  let sent = 0, failed = 0;
  for (let i = 0; i < due.length; i += 100) {
    const chunk = due.slice(i, i + 100);
    const ok = await sendEmailBatch(chunk.map((n) => {
      const link = typeof n.link === "string" && n.link.startsWith("/") ? `${base}${n.link}` : base;
      return { to: n.person.email, subject: `${n.title} · CODED Quality`, text: `${n.body ? `${n.body}\n\n` : ""}Open: ${link}\n\nCODED Quality · you get this because something needs you in the system.` };
    }));
    if (ok) { sent += chunk.length; await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", chunk.map((n) => n.id)); }
    else failed += chunk.length;
    await new Promise((r) => setTimeout(r, 600)); // stay under the provider's rate limit between batches
  }
  return NextResponse.json({ sent, failed });
}
