import type { Verdict } from "@/lib/types";

/**
 * The three words are the vocabulary and are never abbreviated to a letter, an icon, or a
 * colour swatch — at any breakpoint. The class only frames the word, so the badge still reads
 * correctly with colour crushed by a projector or removed altogether.
 */
const styles: Record<Verdict, string> = {
  COMPLIANT: "verdict-compliant",
  VIOLATION: "verdict-violation",
  INDETERMINATE: "verdict-indeterminate",
};

export function VerdictBadge({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  return (
    <span role="status" aria-label={`Verdict: ${verdict}`} className={`verdict-chip ${styles[verdict]} ${className}`}>
      {verdict}
    </span>
  );
}
