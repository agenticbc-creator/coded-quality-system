import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/session";

export default async function Home() {
  const me = await getMe();
  redirect(homeFor(me));
}
