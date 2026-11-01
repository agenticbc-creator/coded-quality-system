"use client";

import { Icon } from "./icons";
import { btn } from "./ui";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btn("primary")}>
      <Icon name="printer" className="h-4 w-4" /> {label}
    </button>
  );
}
