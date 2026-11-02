import Link from "next/link";
import { db } from "@/lib/supabase";
import { Card, CardTitle, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TIER } from "@/lib/format";

export const metadata = { title: "Handbook" };

const FLOW = [
  { icon: "book", t: "Approve the content", d: "A brief, versions and one approval by the Education Principal. The approved version is locked to the cohort.", href: "/approvals/content" },
  { icon: "user-check", t: "Approve the people", d: "Criteria, vetting, rate, contract, onboarding and two mock classes. Nobody teaches before 'Cleared to teach'.", href: "/approvals/people" },
  { icon: "layers", t: "Set up the cohort", d: "Classrooms, an overseer, a backup instructor and a QA plan. Go-live is blocked until every gate is green.", href: "/cohorts" },
  { icon: "clipboard", t: "Observe", d: "Shadowing every week, education and operations QA on the plan, pop-ups and pulse checks when signals drop.", href: "/visits" },
  { icon: "send", t: "Release", d: "Notes stay private. The segment owner releases a summary and The One Thing; red flags reach them the same day.", href: "/feedback/release" },
  { icon: "chart", t: "Score and act", d: "The composite is computed every quarter. Tiers open plans automatically and feed levels, master classes and CCTP.", href: "/scores" },
];

const SEES = [
  ["Educator", "Own composite, breakdown, released feedback and The One Thing, 360° averages (never who said what), plans and report cards."],
  ["Lead instructor", "Their own record and their TAs' scores for the classroom they lead."],
  ["Segment owner", "Everything for their segment, including private notes, the release queue and red flags. The only person who delivers feedback."],
  ["Education", "QA visits they run, content and people approvals, CCTP. The Education Principal also sees private notes."],
  ["Operations", "Operations QA and shadowing for cohorts they oversee. Not education QA scores."],
  ["HR", "Composite, tier and plans, contracts and level changes. Never private notes."],
  ["GM", "Read-only overview across segments. Kept informed on approvals; does not approve people."],
];

export default async function Handbook() {
  const supabase = await db();
  const { data: settings } = await supabase.from("settings").select("key, label, status, note").order("label");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="How it works" title="Handbook"
        sub="The rules this system runs on, in plain words. Anything marked as an assumption or draft is waiting for a decision and can be changed by the system owner in one place." />

      <Card>
        <CardTitle icon="compass" sub="From a content brief to a quarterly tier.">The quality loop</CardTitle>
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {FLOW.map((f, i) => (
            <li key={f.t} className="bg-white">
              <Link href={f.href} className="group block h-full p-4 transition hover:bg-zebra">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center bg-navy text-[12.5px] font-bold text-white">{i + 1}</span>
                  <Icon name={f.icon} className="h-4 w-4 text-brand" />
                  <span className="text-[14.5px] font-semibold text-navy">{f.t}</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{f.d}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand opacity-0 transition group-hover:opacity-100">Open <Icon name="arrow" className="h-3 w-3" /></span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon="chart" sub="Weights are set per scoring template; these are the defaults.">The composite score</CardTitle>
          <div className="grid grid-cols-4 border border-line text-center">
            {[["50%", "QA observation"], ["20%", "Operations QA"], ["20%", "Classroom 360°"], ["10%", "Accountability"]].map(([v, l]) => (
              <div key={l} className="border-r border-line p-3 last:border-0"><div className="text-[22px] font-extrabold tabular-nums text-navy">{v}</div><div className="text-[12px] text-ink-500">{l}</div></div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-[13.5px] text-ink-600">
            <li>• A missing component is re-weighted across the others, and the score is marked <b>provisional</b>.</li>
            <li>• Validity gates: at least one education QA visit and three 360° reviewers.</li>
            <li>• Areas a QAer could not observe are left out of the score, not counted as zero.</li>
            <li>• Accountability: attendance in 24 hours, grading in 72 hours, feedback acknowledged in 48 hours, the JD checklist and coordinator entries.</li>
          </ul>
        </Card>
        <Card>
          <CardTitle icon="flag" sub="Every tier comes with an action.">Tiers</CardTitle>
          <div className="space-y-2">
            {([1, 2, 3, 4] as const).map((t) => (
              <div key={t} className="flex items-start gap-3 rounded-lg border border-line p-3">
                <span className="grid h-9 w-12 shrink-0 place-items-center text-[12.5px] font-bold text-white" style={{ background: ["#0E7550", "#004AA3", "#9A5B00", "#C42B38"][t - 1] }}>{TIER[t].range}</span>
                <div><div className="text-[14px] font-semibold text-navy">{TIER[t].label} · {TIER[t].name}</div><div className="text-[13px] text-ink-600">{TIER[t].action}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle icon="eye" sub="Enforced by the database, not just hidden in the screens.">Who sees what</CardTitle>
        <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {SEES.map(([r, d]) => <div key={r} className="border-l-2 border-navy pl-3"><dt className="text-[14px] font-semibold text-navy">{r}</dt><dd className="text-[13px] leading-relaxed text-ink-600">{d}</dd></div>)}
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon="lock">Feedback rules</CardTitle>
          <ul className="space-y-1.5 text-[13.5px] text-ink-600">
            <li>• Every note is private when it is logged. The author can edit it until it is reviewed.</li>
            <li>• The segment owner approves, edits, keeps private or merges. The educator receives a separate copy, never the raw note.</li>
            <li>• Red flags skip the queue and reach the segment owner the same day.</li>
            <li>• The channel is recorded: email when it went well, a call then email for minor issues, face to face then email when it went badly.</li>
            <li>• Three concerns in 30 days suggest a Coaching Plan.</li>
          </ul>
        </Card>
        <Card>
          <CardTitle icon="award">CCTP in one minute</CardTitle>
          <ul className="space-y-1.5 text-[13.5px] text-ink-600">
            <li>• 100 lessons on the Trainer Learning Path; ranks at 0, 19, 34, 68, 93 and 100.</li>
            <li>• At Path Complete you book one live mock class, scored out of 100.</li>
            <li>• 90+ is CCT, 80–89 is CCTA. A critical failure (direct solutions, frustration, over 40% theory, an unsafe room) means Not Yet, with a retake.</li>
            <li>• Certified trainers keep their status while their composite stays at 85 or above.</li>
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle icon="settings" sub="Live from the system settings. 'Assumption' and 'Draft for review' items are open questions.">Decisions and open questions</CardTitle>
        <ul className="divide-y divide-line">
          {((settings ?? []) as any[]).map((s) => (
            <li key={s.key} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-[13.5px] font-medium text-ink">{s.label}</div>{s.note && <div className="text-[12.5px] text-ink-500">{s.note}</div>}</div>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
