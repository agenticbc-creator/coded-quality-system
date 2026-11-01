export { SEGMENT, fmtDate, fmtDateTime } from "@/lib/format";

/** Working days since a moment (Kuwait weekend: Friday and Saturday). */
export function working(since: string) {
  let n = 0;
  const d = new Date(since);
  const now = new Date();
  d.setDate(d.getDate() + 1);
  while (d <= now) {
    const day = d.getDay();
    if (day !== 5 && day !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
