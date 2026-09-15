import type { Finding } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";

/**
 * rule_text is quoted verbatim from the Gazette and is read aloud from this screen. It wraps;
 * it is never truncated, clamped, or hidden behind a disclosure a judge has to tap.
 */
export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Rule {finding.rule_ref}</p>
          <h3 className="mt-1 font-semibold text-ink">Legal finding</h3>
        </div>
        <VerdictBadge verdict={finding.verdict} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Measured</dt>
          <dd className="numeral mt-1 font-medium text-ink">{finding.measured}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Required</dt>
          <dd className="numeral mt-1 font-medium text-ink">{finding.required}</dd>
        </div>
      </dl>

      {finding.message && <p className="mt-4 text-sm leading-6 text-ink-muted">{finding.message}</p>}

      <blockquote className="mt-4 rounded-r-md border-l-[3px] border-brand bg-sunken/60 px-4 py-3 text-sm leading-6 text-ink-muted">
        {finding.rule_text}
      </blockquote>

      <p className="mt-3 text-xs font-medium text-ink-faint">Rule pack: {finding.rule_pack}</p>
    </article>
  );
}
