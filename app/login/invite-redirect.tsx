"use client";

import { useEffect } from "react";

/** A Supabase invite or reset link that lands on the sign-in page goes on to the set-password page, session and all. */
export function InviteRedirect() {
  useEffect(() => {
    const h = window.location.hash;
    if (/access_token=/.test(h) && /type=(invite|recovery|signup|magiclink)/.test(h)) window.location.replace(`/login/set-password${h}`);
  }, []);
  return null;
}
