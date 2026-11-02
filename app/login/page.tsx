import { ActionForm, Submit } from "@/components/forms";
import { signIn } from "@/app/actions";
import { input, label } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand";

export const metadata = { title: "Sign in" };

type Persona = { key: string; name: string; role: string; note: string };
const GROUPS: { title: string; people: Persona[] }[] = [
  { title: "Educators", people: [
    { key: "ahmed", name: "Ahmed Hassan", role: "Lead Instructor", note: "Tier 1 · own and TAs' scores" },
    { key: "bader", name: "Bader Al-Shatti", role: "Instructor", note: "Coaching Plan · live alerts" },
    { key: "mariam", name: "Mariam Al-Ali", role: "Teaching Assistant", note: "Kids, Youth and Pro record" },
    { key: "yara", name: "Yara Al-Mansour", role: "CCTP candidate", note: "Alumna on the trainer path" },
  ] },
  { title: "Education", people: [
    { key: "faisal", name: "Faisal Al-Rashid", role: "Education Principal", note: "Content approval · CCTP" },
    { key: "huda", name: "Huda Al-Mutairi", role: "Senior Instructor", note: "Mock classes · vetting" },
    { key: "sara", name: "Sara Al-Kandari", role: "Education Officer", note: "Visits on the phone rubric" },
    { key: "fatma", name: "Fatma Al-Rifai", role: "Content creator", note: "Briefs, stages, versions" },
  ] },
  { title: "Owners and operations", people: [
    { key: "noura", name: "Noura Al-Saleh", role: "Segment owner · Pro", note: "Approvals, release queue" },
    { key: "yousef", name: "Yousef Al-Bader", role: "Segment owner · Kids & Youth", note: "Cross-segment view" },
    { key: "khalid", name: "Khalid Al-Enezi", role: "Operations · overseer", note: "Today view · record gaps" },
    { key: "omar", name: "Omar Al-Khaldi", role: "Program coordinator · Pro", note: "Runs the cohort day to day" },
    { key: "muna", name: "Muna Al-Fares", role: "Education coordinator · Pro", note: "Books QA · sees status only" },
  ] },
  { title: "Leadership and support", people: [
    { key: "abdulaziz", name: "Abdulaziz Al-Qattan", role: "General Manager", note: "Observer across segments" },
    { key: "reem", name: "Reem Al-Harbi", role: "HR", note: "Contracts, composites, levels" },
    { key: "tariq", name: "Tariq Al-Shammari", role: "System owner", note: "Weights, templates, audit" },
  ] },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demo = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="blueprint relative flex flex-col justify-between overflow-hidden px-8 py-10 text-white lg:sticky lg:top-0 lg:h-screen lg:px-14 lg:py-14">
        <div className="flex items-center gap-4">
          <Logo className="w-[120px]" />
          <span aria-hidden="true" className="text-[24px] font-light text-[#879AC0]">×</span>
          <span className="text-[22px] font-extrabold leading-tight tracking-[-0.01em]">Quality<small className="label-mono mt-1 block !text-[10.5px] !text-[#879AC0]">Education quality and approvals</small></span>
        </div>

        <div className="my-14 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.06em] text-[#A3B4D6]"><span className="h-[7px] w-[7px] rounded-full bg-[#8DA4FF] shadow-[0_0_0_4px_rgba(141,164,255,.16),0_0_14px_rgba(141,164,255,.7)]" />Every classroom, every quarter</div>
          <h1 className="text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] lg:text-[54px]">
            Nobody teaches<br />without approval.
            <span className="mt-2 block text-[#8DA4FF]">Everyone sees how<br className="hidden lg:block" /> they are doing.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70">
            Content and people approvals, classroom shadowing and QA, composite scores and the CODED Certified Trainer Program, in one place.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-4 border-y border-white/15 py-5">
            {[["50%", "QA"], ["20%", "Ops QA"], ["20%", "360°"], ["10%", "Account."]].map(([v, l]) => (
              <div key={l} className="border-r border-white/10 px-3 first:pl-0 last:border-0">
                <dt className="text-[24px] font-bold tabular-nums tracking-tight">{v}</dt>
                <dd className="text-[12px] text-white/55">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-[13px] text-[#879AC0]">Sample data · every person shown is fictional.</p>
      </section>

      <section className="flex items-center justify-center bg-canvas px-5 py-10 lg:px-12">
        <div className="w-full max-w-[720px]">
          <div className="mb-8 text-navy lg:hidden"><Logo className="w-[96px]" /></div>
          {error === "no-profile" && (
            <div className="mb-4 rounded-lg bg-tier4-bg px-4 py-3 text-[13.5px] text-[#7A1F1A]">Your account has no profile in the quality system yet. Ask the system owner to add you.</div>
          )}
          {demo && (
            <>
              <h2 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Pick a person to explore as</h2>
              <p className="mt-1 text-[14.5px] text-ink-500">Each person sees only what their role allows. All names and numbers are examples.</p>
              <ActionForm action={signIn} className="mt-6 space-y-6">
                {GROUPS.map((g) => (
                  <div key={g.title}>
                    <div className="label-mono mb-2">{g.title}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.people.map((p) => (
                        <button key={p.key} type="submit" name="persona" value={p.key}
                          className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-[13.5px] font-bold text-navy transition group-hover:bg-navy group-hover:text-white">
                            {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold text-navy">{p.name}</span>
                            <span className="block text-[12.5px] font-medium text-brand">{p.role}</span>
                            <span className="block truncate text-[12px] text-ink-500">{p.note}</span>
                          </span>
                          <Icon name="arrow" className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-navy" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </ActionForm>
              <div className="my-8 flex items-center gap-3 text-[12px] uppercase tracking-widest text-ink-400"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
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
