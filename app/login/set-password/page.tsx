import { Logo } from "@/components/brand";
import { SetPasswordForm } from "./form";

export const metadata = { title: "Set your password" };

/** Where invite and password-reset emails land. The link's session is read in the browser, then the person picks a password. */
export default function SetPassword() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-card">
        <div className="mb-5 text-navy"><Logo className="h-7" /></div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-ink">Set your password</h1>
        <p className="mt-1 text-[13.5px] text-ink-600">Choose a password to finish signing in to CODED Quality.</p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
