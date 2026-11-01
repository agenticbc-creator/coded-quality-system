/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cx } from "./ui";

/** The official CODED wordmark (boxed logo). `tone` picks the white or navy file. */
export function Logo({ tone = "white", className }: { tone?: "white" | "navy"; className?: string }) {
  return <img src={tone === "white" ? "/brand/coded-logo-white-600.png" : "/brand/coded-logo-navy-600.png"} alt="CODED" width={600} height={208} className={cx("h-auto select-none", className)} draggable={false} />;
}

/** Sidebar / header lock-up: logo + product name. */
export function BrandLockup({ tone = "white", href = "/" }: { tone?: "white" | "navy"; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-2" aria-label="CODED Quality home">
      <Logo tone={tone} className="w-[92px]" />
      <span className={cx("border-l pl-3 text-[11px] font-semibold uppercase leading-[1.25] tracking-[0.14em]", tone === "white" ? "border-white/20 text-white/70" : "border-navy/20 text-navy/70")}>
        Quality<br />System
      </span>
    </Link>
  );
}
