import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { TIER, initials, num } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ eyebrow, title, sub, actions, back }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-brand">
            <Icon name="back" className="h-3.5 w-3.5" /> {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand"><span className="h-[2px] w-5 bg-brand" />{eyebrow}</div>}
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-navy">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={cx("rounded-xl border border-line bg-white shadow-card", pad && "p-5 md:p-6", className)}>{children}</section>;
}

export function CardTitle({ children, sub, right, icon }: { children: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-navy text-white">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-navy">{children}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "navy" | "draft";
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-600 ring-line",
  brand: "bg-brand-50 text-brand ring-brand-100",
  green: "bg-tier1-bg text-tier1 ring-[#BFE5D5]",
  amber: "bg-tier3-bg text-tier3 ring-[#F5DDAF]",
  red: "bg-tier4-bg text-tier4 ring-[#F6C9C6]",
  navy: "bg-navy text-white ring-navy",
  draft: "bg-[#F3EEFF] text-[#5B3FB8] ring-[#E0D6FB]",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, Tone]> = {
    from_notion: ["From Notion", "green"],
    decided: ["Decided 25 Oct", "brand"],
    default: ["Assumption", "amber"],
    draft_review: ["Draft for review", "draft"],
    active: ["Active", "green"],
    retired: ["Retired", "neutral"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TierBadge({ tier, provisional, size = "sm" }: { tier: number | null | undefined; provisional?: boolean; size?: "sm" | "lg" }) {
  if (!tier) return <Badge>No score</Badge>;
  const t = TIER[tier as 1 | 2 | 3 | 4];
  const cls = { 1: "bg-tier1-bg text-tier1 ring-[#BFE5D5]", 2: "bg-tier2-bg text-tier2 ring-brand-100", 3: "bg-tier3-bg text-tier3 ring-[#F5DDAF]", 4: "bg-tier4-bg text-tier4 ring-[#F6C9C6]" }[tier as 1 | 2 | 3 | 4];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset", cls, size === "lg" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[11.5px]", provisional && "ring-dashed")}>
      {t.label} · {t.name}
      {provisional && <span className="font-normal opacity-80">(provisional)</span>}
    </span>
  );
}

export function tierColor(score: number | null | undefined) {
  if (score === null || score === undefined) return "#D2D2D2";
  if (score >= 90) return "#0E7A55";
  if (score >= 85) return "#004AA3";
  if (score >= 75) return "#A35F00";
  return "#B42E28";
}

/** Horizontal score bar with target (90) and floor (85) markers. */
export function ScoreBar({ value, max = 100, showMarks = true, height = "h-2" }: { value: number | null | undefined; max?: number; showMarks?: boolean; height?: string }) {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, (Number(value) / max) * 100));
  return (
    <div className={cx("relative w-full overflow-visible rounded-full bg-canvas", height)}>
      <div className={cx("absolute inset-y-0 left-0 rounded-full transition-all", height)} style={{ width: `${pct}%`, background: tierColor(value === null || value === undefined ? null : (Number(value) / max) * 100) }} />
      {showMarks && (
        <>
          <span className="absolute -top-1 h-4 w-px bg-ink-400" style={{ left: "85%" }} title="Floor 85" />
          <span className="absolute -top-1 h-4 w-px bg-navy" style={{ left: "90%" }} title="Target 90" />
        </>
      )}
    </div>
  );
}

/** Large circular score for the "where do I stand" hero. */
export function ScoreRing({ value, size = 168, provisional }: { value: number | null | undefined; size?: number; provisional?: boolean }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined ? 0 : Number(value);
  const color = tierColor(value);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === "#004AA3" ? "#6FA3EA" : color === "#0E7A55" ? "#3FD39B" : color === "#A35F00" ? "#F2B248" : color === "#D2D2D2" ? "#9AA6BC" : "#F07A72"}
          strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} strokeDashoffset={0}
          style={provisional ? { strokeDasharray: `${(v / 100) * c} ${c}`, opacity: 0.85 } : undefined} />
        {/* target tick at 90 */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={14} strokeDasharray={`2 ${c}`} strokeDashoffset={-(0.9 * c)} opacity={0.9} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[46px] font-bold leading-none tracking-tight tabular-nums text-white">{value === null || value === undefined ? "—" : num(value)}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/60">{provisional ? "provisional" : "composite"}</div>
        </div>
      </div>
    </div>
  );
}

export function Avatar({ name, size = 32, tone = "brand" }: { name: string; size?: number; tone?: "brand" | "navy" | "light" }) {
  const cls = tone === "navy" ? "bg-navy text-white" : tone === "light" ? "bg-white/10 text-white" : "bg-brand-50 text-brand";
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold", cls)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "amber" | "green"; icon?: string }) {
  const color = tone === "red" ? "text-tier4" : tone === "amber" ? "text-tier3" : tone === "green" ? "text-tier1" : "text-navy";
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between text-[12px] font-medium text-ink-500">
        {label}
        {icon && <Icon name={icon} className="h-4 w-4 text-ink-400" />}
      </div>
      <div className={cx("mt-2 text-[30px] font-bold leading-none tracking-tight tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-ink-500">{sub}</div>}
    </div>
  );
}

export function Empty({ title, sub, icon = "sparkle" }: { title: string; sub?: string; icon?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line bg-canvas/50 px-6 py-10 text-center">
      <Icon name={icon} className="mb-2 h-5 w-5 text-ink-400" />
      <div className="text-[14px] font-medium text-ink-600">{title}</div>
      {sub && <div className="mt-1 max-w-sm text-[12.5px] text-ink-500">{sub}</div>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary", icon }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; icon?: string }) {
  return (
    <Link href={href} className={btn(variant)}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}

export function btn(variant: "primary" | "secondary" | "ghost" | "danger" = "primary", size: "sm" | "md" = "md") {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50";
  const s = size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]";
  const v = {
    primary: "bg-navy text-white hover:bg-brand shadow-sm",
    secondary: "bg-white text-navy ring-1 ring-inset ring-line hover:bg-canvas",
    ghost: "text-ink-600 hover:bg-canvas hover:text-navy",
    danger: "bg-white text-tier4 ring-1 ring-inset ring-[#F6C9C6] hover:bg-tier4-bg",
  }[variant];
  return cx(base, s, v);
}

export const input = "block w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const label = "mb-1.5 block text-[12.5px] font-medium text-ink-600";

export function Field({ label: l, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 text-[13px] last:border-0">
      <span className="text-ink-500">{k}</span>
      <span className="text-right font-medium text-ink">{v}</span>
    </div>
  );
}

export function Notice({ tone = "brand", title, children, icon }: { tone?: "brand" | "amber" | "red" | "green" | "draft"; title?: string; children: ReactNode; icon?: string }) {
  const cls = {
    brand: "border-brand-100 bg-brand-50 text-navy",
    amber: "border-[#F5DDAF] bg-tier3-bg text-[#6B4300]",
    red: "border-[#F6C9C6] bg-tier4-bg text-[#7A1F1A]",
    green: "border-[#BFE5D5] bg-tier1-bg text-[#0A5A3E]",
    draft: "border-[#E0D6FB] bg-[#F7F4FF] text-[#3F2A85]",
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed", cls)}>
      <Icon name={icon ?? (tone === "red" ? "alert" : tone === "amber" ? "clock" : tone === "green" ? "check" : "sparkle")} className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <div className="font-semibold">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("-mx-5 overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
            {head.map((h, i) => (
              <th key={i} className={cx("px-5 py-2.5 font-semibold", i > 0 && "")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}
export const td = "px-5 py-3 align-middle";
