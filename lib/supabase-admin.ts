import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/** True when the server-only service key is set in the hosting environment. */
export const hasServiceKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Service-role client for the two jobs that cannot run as the signed-in user: sending invite emails
 * and the daily email run. It skips row-level security, so it is only created on the server,
 * only after the caller's own role has been checked, and never handed to a component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adminDb(): any {
  if (typeof window !== "undefined") throw new Error("adminDb() runs on the server only");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sends one email through Resend's HTTP API. Returns false (and sends nothing) when email is not configured. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  return res.ok;
}
