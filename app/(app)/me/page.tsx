import { getMe } from "@/lib/session";
import { loadPerson } from "@/lib/person";
import { Breakdown, FeedbackList, Hero, History, JDChecklist, Plans, Profile, Review360, Signals, Surveys, Trend } from "@/components/performance";
import { Notice } from "@/components/ui";

export const metadata = { title: "My dashboard" };

export default async function MyDashboard() {
  const me = await getMe();
  const d = await loadPerson(me.id);
  const unacked = d.released.filter((r) => !r.ack_at).length;
  return (
    <div className="space-y-6">
      <Hero d={d} self />
      {unacked > 0 && <Notice tone="amber" title={`${unacked} feedback item(s) waiting for your acknowledgement`}>Acknowledging within 48 hours counts toward accountability.</Notice>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Breakdown d={d} />
          <Signals d={d} />
          <FeedbackList d={d} self />
        </div>
        <div className="space-y-6">
          <Plans d={d} />
          <Trend d={d} />
          <Review360 d={d} self />
          <Surveys d={d} />
          <Profile d={d} />
        </div>
      </div>
      <History d={d} />
      <JDChecklist d={d} canConfirm={false} />
    </div>
  );
}
