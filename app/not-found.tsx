import Link from "next/link";
import { Logo } from "@/components/brand";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-8 w-fit text-navy"><Logo className="w-[96px]" /></div>
        <div className="label-mono mb-2">Page not found</div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-ink">There is nothing here</h1>
        <p className="mt-2 text-[15px] text-ink-600">The link may be old, or the page is not part of your role.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-full bg-gradient-to-br from-brand to-brand-700 px-5 text-[14px] font-bold text-white shadow-glow">Go to my home</Link>
      </div>
    </main>
  );
}
