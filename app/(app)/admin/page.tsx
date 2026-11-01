import Link from "next/link";
import { getMe, has } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Badge, Card, CardTitle, Field, Notice, PageHeader, StatusBadge, Table, cx, input, td } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/icons";
import { personRoles, qaTemplateSave, runDailyJobs, scoringTemplateSave, settingsSet } from "@/app/actions";
import { SEGMENT, ago, fmtDateTime } from "@/lib/format";

export const metadata = { title: "System" };

const TABS = [["sync", "Sync health"], ["scoring", "Scoring templates"], ["templates", "QA templates"], ["rules", "Rules and drafts"], ["access", "Roles and access"], ["audit", "Audit log"]] as const;
const ROLES = ["segment_owner", "education_principal", "senior_instructor", "education_officer", "operations", "instructor", "lead_instructor", "ta", "content_creator", "hr", "gm", "system_owner"];

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  const tab = (await searchParams).tab ?? "sync";
  const supabase = await db();
  const owner = has(me, "system_owner");

  return (
    <div>
      <PageHeader eyebrow="System owner" title="System"
        sub="Runs the system: sync health, scoring weights and tiers, QA templates and rubric versions, roles and access, and the audit log. Does not approve people or release feedback." />
      <div className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin?tab=${k}`} className={cx("shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium", tab === k ? "bg-navy text-white" : "text-ink-600 hover:bg-white")}>{l}</Link>
        ))}
      </div>
      {tab === "sync" && <Sync supabase={supabase} owner={owner} />}
      {tab === "scoring" && <Scoring supabase={supabase} />}
      {tab === "templates" && <Templates supabase={supabase} />}
      {tab === "rules" && <Rules supabase={supabase} owner={owner} />}
      {tab === "access" && <Access supabase={supabase} owner={owner} />}
      {tab === "audit" && <Audit supabase={supabase} />}
    </div>
  );
}

async function Sync({ supabase, owner }: { supabase: any; owner: boolean }) {
  const { data } = await supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(30);
  const latest = ["erpnext", "coded_app", "surveys"].map((s) => (data ?? []).find((r: any) => r.source === s));
  const label: Record<string, string> = { erpnext: "ERPNext (contractors, contracts)", coded_app: "CODED App (attendance, submissions, chat)", surveys: "Surveys (pulse, final)" };
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {latest.map((r: any, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-navy">{label[["erpnext", "coded_app", "surveys"][i]]}</span>
              <span className={cx("h-2.5 w-2.5 rounded-full", !r ? "bg-ink-300" : r.status === "ok" ? "bg-tier1" : r.status === "warning" ? "bg-tier3" : "bg-tier4")} />
            </div>
            <div className="mt-2 font-mono text-[22px] font-semibold text-navy">{r?.records ?? "—"}</div>
            <div className="text-[12px] text-ink-500">records · last run {r ? ago(r.finished_at) : "never"}</div>
            {r?.message && <div className="mt-2 text-[12px] text-ink-600">{r.message}</div>}
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle icon="refresh" sub="Daily pull, 24/72 reminders and escalations, approval reminders after 3 working days, visit reminders, pulse triggers and JD checklist ticks. Schedule it daily once the system is in Portal v2.">Daily jobs</CardTitle>
        <Notice tone="brand">In this standalone build ERPNext and the CODED App are represented by sample tables. The daily pull records a sync run against them; Portal v2 replaces it with the real read.</Notice>
        {owner && <ActionForm action={runDailyJobs} className="mt-4"><Submit icon="refresh">Run daily jobs now</Submit></ActionForm>}
      </Card>
      <Card pad={false} className="px-5 pb-2 pt-4">
        <Table head={["Source", "Status", "Records", "Message", "When"]}>
          {(data ?? []).map((r: any) => (
            <tr key={r.id}><td className={td}>{r.source}</td><td className={td}><Badge tone={r.status === "ok" ? "green" : r.status === "warning" ? "amber" : "red"}>{r.status}</Badge></td><td className={`${td} font-mono`}>{r.records}</td><td className={td}>{r.message}</td><td className={td}>{fmtDateTime(r.started_at)}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

async function Scoring({ supabase }: { supabase: any }) {
  const { data } = await supabase.from("scoring_templates").select("*").order("created_at", { ascending: false });
  const active = (data ?? []).filter((t: any) => t.active);
  return (
    <div className="space-y-6">
      <Notice tone="amber" title="Sign-off">Changes to weights by anyone other than the Education Principal are saved as drafts for their sign-off (PRD assumption). Every change is versioned and logged.</Notice>
      {active.map((t: any) => (
        <Card key={t.id}>
          <CardTitle icon="chart" sub={`${t.scope_type === "default" ? "Applies when no segment, product or program template is set" : `${t.scope_type}: ${t.scope_id}`} · version ${t.version}`} right={<StatusBadge status={t.status} />}>{t.name}</CardTitle>
          <ActionForm action={scoringTemplateSave} className="space-y-4">
            <input type="hidden" name="id" value={t.id} /><input type="hidden" name="name" value={t.name} /><input type="hidden" name="scope_type" value={t.scope_type} /><input type="hidden" name="scope_id" value={t.scope_id ?? ""} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="QA observation %"><input name="qa" type="number" defaultValue={t.weights.qa} className={input} /></Field>
              <Field label="Operations QA %"><input name="ops" type="number" defaultValue={t.weights.ops} className={input} /></Field>
              <Field label="Classroom 360° %"><input name="r360" type="number" defaultValue={t.weights.r360} className={input} /></Field>
              <Field label="Accountability %"><input name="acc" type="number" defaultValue={t.weights.acc} className={input} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Gate: education QA visits (min)"><input name="min_edu_qa" type="number" defaultValue={t.gates.min_edu_qa} className={input} /></Field>
              <Field label="Gate: 360° reviewers (min)"><input name="min_360_reviewers" type="number" defaultValue={t.gates.min_360_reviewers} className={input} /></Field>
              <Field label="Gate: operations QA visits (min)"><input name="min_ops_qa" type="number" defaultValue={t.gates.min_ops_qa} className={input} /></Field>
            </div>
            <Submit size="sm">Save as version {t.version + 1}</Submit>
          </ActionForm>
        </Card>
      ))}
      <Card>
        <CardTitle icon="plus" sub="Weights can be set per segment, product or program; the most specific one wins">Add a scoring template</CardTitle>
        <ActionForm action={scoringTemplateSave} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input name="name" required className={input} /></Field>
            <Field label="Scope"><select name="scope_type" className={input}><option value="segment">Segment</option><option value="product">Product</option><option value="program">Program (id)</option></select></Field>
            <Field label="Scope value" hint="kids / youth / pro, a product name, or a program id"><input name="scope_id" required className={input} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-7">
            {[["qa", 50], ["ops", 20], ["r360", 20], ["acc", 10], ["min_edu_qa", 1], ["min_360_reviewers", 3], ["min_ops_qa", 0]].map(([k, v]) => <Field key={k} label={String(k)}><input name={String(k)} type="number" defaultValue={Number(v)} className={input} /></Field>)}
          </div>
          <Submit size="sm" variant="secondary">Create</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}

async function Templates({ supabase }: { supabase: any }) {
  const { data } = await supabase.from("qa_templates").select("*").order("key").order("version", { ascending: false });
  return (
    <div className="space-y-4">
      <Notice tone="draft" title="Drafts for the Education team">Every rubric except the CCTP mock class and the education QA structure was drafted for this build and needs sign-off. Saving creates a new version; old versions are retired, never deleted.</Notice>
      {(data ?? []).map((t: any) => (
        <Card key={t.id} className={t.status === "retired" ? "opacity-60" : ""}>
          <CardTitle icon="clipboard" sub={`${t.kind.replace("_", " ")} · scores: ${t.subjects.join(", ") || "checklist only"} · v${t.version}${t.is_special ? " · master class / challenge" : ""}`} right={<StatusBadge status={t.status} />}>{t.name}</CardTitle>
          {t.kind !== "shadowing" ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(t.rubric as Record<string, any>).map(([role, r]) => (
                <div key={role} className="rounded-lg border border-line p-3">
                  <div className="mb-2 text-[12.5px] font-semibold text-navy">{r.label ?? role}</div>
                  {r.sections?.map((s: any) => (
                    <div key={s.key} className="mb-2 last:mb-0">
                      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">{s.label} · {s.items.reduce((a: number, i: any) => a + i.max, 0)}</div>
                      {s.items.map((i: any) => <div key={i.key} className="flex justify-between gap-2 text-[12px]"><span>{i.label}</span><span className="font-mono text-ink-500">{i.max}</span></div>)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <ul className="grid gap-1 text-[12.5px] sm:grid-cols-2">{t.rubric.checklist.map((c: any) => <li key={c.key}>• {c.label}</li>)}</ul>}
          {t.status !== "retired" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] font-medium text-brand">Edit as a new version</summary>
              <ActionForm action={qaTemplateSave} className="mt-3 space-y-3">
                <input type="hidden" name="key" value={t.key} /><input type="hidden" name="kind" value={t.kind} /><input type="hidden" name="focus" value={t.focus} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><input name="name" defaultValue={t.name} className={input} /></Field>
                  <Field label="Subjects scored (comma separated)"><input name="subjects" defaultValue={t.subjects.join(", ")} className={input} /></Field>
                </div>
                <Field label="Rubric (JSON)"><textarea name="rubric" rows={10} defaultValue={JSON.stringify(t.rubric, null, 2)} className={`${input} font-mono text-[12px]`} /></Field>
                <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="special" defaultChecked={t.is_special} /> Master class or challenge template</label>
                <Submit size="sm">Save version {t.version + 1}</Submit>
              </ActionForm>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

async function Rules({ supabase, owner }: { supabase: any; owner: boolean }) {
  const { data } = await supabase.from("settings").select("*").order("status").order("key");
  return (
    <div className="space-y-3">
      <Notice tone="brand">Every rule the system enforces. <b>From Notion</b> means it is in CODED&apos;s frameworks; <b>Decided 25 Oct</b> is from the PRD decisions; <b>Assumption</b> answers an open PRD question; <b>Draft for review</b> was written for this build.</Notice>
      {(data ?? []).map((s: any) => (
        <Card key={s.key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-navy">{s.label}</div>
              {s.note && <p className="mt-0.5 text-[12.5px] text-ink-500">{s.note}</p>}
            </div>
            <StatusBadge status={s.status} />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[12.5px] text-brand">Value{owner ? " · edit" : ""}</summary>
            {owner ? (
              <ActionForm action={settingsSet} className="mt-2 space-y-2">
                <input type="hidden" name="key" value={s.key} />
                <textarea name="value" rows={Math.min(14, JSON.stringify(s.value, null, 2).split("\n").length + 1)} defaultValue={JSON.stringify(s.value, null, 2)} className={`${input} font-mono text-[12px]`} />
                <div className="flex items-center gap-2"><select name="status" defaultValue={s.status} className={`${input} w-auto`}><option value="from_notion">From Notion</option><option value="decided">Decided</option><option value="default">Assumption</option><option value="draft_review">Draft for review</option></select><Submit size="sm">Save</Submit></div>
              </ActionForm>
            ) : <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas p-3 text-[12px]">{JSON.stringify(s.value, null, 2)}</pre>}
          </details>
        </Card>
      ))}
    </div>
  );
}

async function Access({ supabase, owner }: { supabase: any; owner: boolean }) {
  const { data } = await supabase.from("people").select("*").order("full_name");
  return (
    <div className="space-y-3">
      <Notice tone="brand">Roles decide what each person sees (row-level security in the database). Changes are logged.</Notice>
      {(data ?? []).map((p: any) => (
        <Card key={p.id}>
          <ActionForm action={personRoles}>
            <input type="hidden" name="person" value={p.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-[14px] font-semibold text-navy">{p.full_name}</div><div className="text-[12px] text-ink-500">{p.email}{p.erp_supplier_id ? ` · ${p.erp_supplier_id}` : ""}</div></div>
              <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" name="full_timer" defaultChecked={p.is_full_timer} disabled={!owner} /> Full-timer</label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] ring-1 ring-line">
                  <input type="checkbox" name="roles" value={r} defaultChecked={p.roles.includes(r)} disabled={!owner} /> {r.replace(/_/g, " ")}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">Owns segments:
              {Object.entries(SEGMENT).map(([k, v]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="owned" value={k} defaultChecked={p.owned_segments.includes(k)} disabled={!owner} /> {v}</label>)}
              {owner && <span className="ml-auto"><Submit size="sm" variant="secondary">Save access</Submit></span>}
            </div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}

async function Audit({ supabase }: { supabase: any }) {
  const { data } = await supabase.from("audit_log").select("*, actor:people(full_name)").order("at", { ascending: false }).limit(150);
  return (
    <Card pad={false} className="px-5 pb-2 pt-4">
      <CardTitle icon="shield" sub="Who did what, when, with which version (R1). 360° review scores are never logged against the reviewer.">Audit log</CardTitle>
      <Table head={["When", "Who", "Action", "Entity", "Details"]}>
        {(data ?? []).map((a: any) => (
          <tr key={a.id}>
            <td className={`${td} whitespace-nowrap`}>{fmtDateTime(a.at)}</td>
            <td className={td}>{a.actor?.full_name ?? <span className="flex items-center gap-1 text-ink-500"><Icon name="settings" className="h-3.5 w-3.5" /> System</span>}</td>
            <td className={`${td} font-mono text-[12px]`}>{a.action}</td>
            <td className={td}>{a.entity}</td>
            <td className={`${td} max-w-[320px] truncate font-mono text-[11.5px] text-ink-500`}>{a.data ? JSON.stringify(a.data) : ""}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

