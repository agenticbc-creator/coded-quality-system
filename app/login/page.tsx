import { ActionForm, Submit } from "@/components/forms";
import { signIn } from "@/app/actions";
import { input, label } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Sign in" };

const PERSONAS: { key: string; name: string; role: string; note: string }[] = [
  { key: "noura", name: "Noura Al-Saleh", role: "Segment owner · Professionals", note: "Approvals, release queue, red flags" },
  { key: "ahmed", name: "Ahmed Hassan", role: "Lead Instructor", note: "Tier 1 · sees own and TAs' scores" },
  { key: "mariam", name: "Mariam Al-Ali", role: "Teaching Assistant", note: "Record across Kids, Youth, Pro" },
  { key: "bader", name: "Bader Al-Shatti", role: "Instructor", note: "Open Coaching Plan · live alerts" },
  { key: "sara", name: "Sara Al-Kandari", role: "Education Officer (QAer)", note: "Visit invites · phone rubric" },
  { key: "huda", name: "Huda Al-Mutairi", role: "Senior Instructor", note: "Mock classes · vetting" },
  { key: "khalid", name: "Khalid Al-Enezi", role: "Operations · overseer", note: "Today view · record gaps" },
  { key: "faisal", name: "Faisal Al-Rashid", role: "Education Principal", note: "Content approval" },
  { key: "fatma", name: "Fatma Al-Rifai", role: "Content creator", note: "Briefs and versions" },
  { key: "reem", name: "Reem Al-Harbi", role: "HR", note: "Contracts, composites, plans" },
  { key: "abdulaziz", name: "Abdulaziz Al-Qattan", role: "General Manager", note: "Observer across segments" },
  { key: "tariq", name: "Tariq Al-Shammari", role: "System owner", note: "Weights, templates, access, audit" },
  { key: "yousef", name: "Yousef Al-Bader", role: "Segment owner · Kids & Youth", note: "Cross-segment view" },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demo = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="grain relative flex flex-col justify-between overflow-hidden bg-navy px-8 py-10 text-white lg:px-14 lg:py-14">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <svg viewBox="0 0 64 64" className="h-6 w-6"><path d="M41 22.5a12 12 0 1 0 0 19" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" /><circle cx="44" cy="32" r="4" fill="#5B9BE6" /></svg>
          </span>
          <div>
            <div className="text-[15px] font-semibold tracking-[0.2em]">CODED</div>
            <div className="text-[12px] text-white/60">Education Quality and Approvals</div>
          </div>
        </div>
        <div className="my-14 max-w-lg">
          <h1 className="text-[38px] font-semibold leading-[1.1] tracking-tight lg:text-[46px]">
            Nobody teaches without approval.
            <span className="block text-[#8FB8EE]">Everyone sees how they are doing.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            One place for content and people approvals, classroom shadowing and QA, composite scores and the CODED Certified Trainer Program.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3 text-[13px]">
            {[["check", "Recorded approvals"], ["clipboard", "QA on a schedule"], ["chart", "Scores computed, not compiled"], ["eye", "Transparent to each educator"]].map(([i, t]) => (
              <div key={t} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
                <Icon name={i} className="h-4 w-4 text-[#8FB8EE]" /> {t}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-white/45">Standalone build on sample data. Built to move into CODED Portal v2.</p>
      </section>

      <section className="flex items-center justify-center bg-canvas px-5 py-10 lg:px-12">
        <div className="w-full max-w-2xl">
          {error === "no-profile" && (
            <div className="mb-4 rounded-lg bg-tier4-bg px-4 py-3 text-[13px] text-[#7A1F1A]">Your account has no profile in the quality system yet. Ask the system owner to add you.</div>
          )}
          {demo && (
            <>
              <h2 className="text-[20px] font-semibold text-navy">Sign in as a demo person</h2>
              <p className="mt-1 text-[13.5px] text-ink-500">Each person sees only what their role allows. All names and numbers are examples.</p>
              <ActionForm action={signIn} className="mt-5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {PERSONAS.map((p) => (
                    <button key={p.key} type="submit" name="persona" value={p.key}
                      className="group flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand group-hover:bg-brand group-hover:text-white">
                        {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-navy">{p.name}</span>
                        <span className="block text-[12px] font-medium text-brand">{p.role}</span>
                        <span className="block truncate text-[11.5px] text-ink-500">{p.note}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </ActionForm>
              <div className="my-8 flex items-center gap-3 text-[11.5px] uppercase tracking-widest text-ink-400"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            </>
          )}
          <h2 className="text-[16px] font-semibold text-navy">Sign in with your account</h2>
          <ActionForm action={signIn} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div><span className={label}>Email</span><input name="email" type="email" autoComplete="email" className={input} /></div>
            <div><span className={label}>Password</span><input name="password" type="password" autoComplete="current-password" className={input} /></div>
            <Submit>Sign in</Submit>
          </ActionForm>
        </div>
      </section>
    </main>
  );
}
