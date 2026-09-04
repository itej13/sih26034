import type { Verdict } from "@/lib/types";
const styles: Record<Verdict, string> = { COMPLIANT: "border-emerald-200 bg-emerald-50 text-emerald-800", VIOLATION: "border-red-200 bg-red-50 text-red-800", INDETERMINATE: "border-amber-200 bg-amber-50 text-amber-900" };
export function VerdictBadge({ verdict }: { verdict: Verdict }) { return <span role="status" aria-label={`Verdict: ${verdict}`} className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${styles[verdict]}`}>{verdict}</span>; }
