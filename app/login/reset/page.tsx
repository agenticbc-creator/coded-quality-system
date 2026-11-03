import Link from "next/link";
import { Logo } from "@/components/brand";
import { ResetForm } from "./form";

export const metadata = { title: "Reset your password" };

export default function Reset() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-card">
        <div className="mb-5 text-navy"><Logo className="h-7" /></div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-ink">Reset your password</h1>
        <p className="mt-1 text-[13.5px] text-ink-600">We will email you a link to choose a new one.</p>
        <ResetForm />
        <p className="mt-4 text-[13px]"><Link href="/login" className="font-semibold text-brand">Back to sign in</Link></p>
      </div>
    </main>
  );
}
