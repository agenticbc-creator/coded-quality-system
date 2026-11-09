"use client";

import { useEffect } from "react";

/** A Supabase invite or reset link that lands on the sign-in page goes on to the set-password page, session and all. */
export function InviteRedirect() {
  useEffect(() => {
    // Supabase falls back to the site address when a link's return address is not on its allow list; send it on.
    const h = window.location.hash, q = window.location.search;
    if ((/access_token=/.test(h) && /type=(invite|recovery|signup|magiclink)/.test(h)) || /error_description=/.test(h)) window.location.replace(`/login/set-password${h}`);
    else if (/[?&]code=/.test(q)) window.location.replace(`/login/set-password${q}`);
  }, []);
  return null;
}
