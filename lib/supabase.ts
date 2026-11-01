import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
export { SUPABASE_ANON_KEY, SUPABASE_URL };

/** Server-side client bound to the signed-in user's session. Every read is filtered by row-level security. */
// Untyped on purpose: no generated database types in this standalone build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function db(): Promise<any> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}
