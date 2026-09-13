import type { Finding, Measurement } from "@/lib/types";
import { UncertaintyBar } from "./UncertaintyBar";
import { VerdictBadge } from "./VerdictBadge";

function thresholdFromRequired(required: string) {
  const number = required.match(/\d+(?:\.\d+)?/);
  return number ? Number(number[0]) : null;
}

// The frozen contract carries a single uncertainty field, expanded_uncertainty_mm, for every
// metric — including contrast_ratio, which is dimensionless. Printing "mm" beside a ratio puts
// a wrong unit on a screen the panel reads, so the unit comes from the metric rather than the
// field name. Renaming the contract field would need all three lanes in the room.
function unitFor(metric: string) {
  return metric.endsWith("_mm") ? "mm" : null;
}

export function MeasurementCard({ measurement, finding }: { measurement: Measurement; finding?: Finding }) {
  const threshold = finding ? thresholdFromRequired(finding.required) : null;
  const unit = unitFor(measurement.metric);

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Calibrated measurement</p>
          <h3 className="mt-1 font-semibold capitalize text-ink">
            {measurement.field.replace("_", " ")} · {measurement.metric.replaceAll("_", " ")}
          </h3>
        </div>
        {finding && <VerdictBadge verdict={finding.verdict} />}
      </div>

      {/*
        Value and uncertainty are one quantity set in one line, not two cells a narrow screen
        can separate. There is no breakpoint at which the ± or the k is dropped to save width;
        it wraps instead. A bare number is the thing this project exists to prevent.
      */}
      <div className="mt-5 rounded-lg border border-line bg-sunken/60 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          Measured value with expanded uncertainty
        </p>
        <p className="numeral mt-2 text-2xl font-semibold leading-tight text-ink sm:text-4xl">
          {measurement.value.toFixed(2)}
          <span className="mx-1.5 text-ink-muted">±</span>
          {measurement.expanded_uncertainty_mm.toFixed(2)}
          {unit && <span className="ml-1.5 font-sans text-base font-medium text-ink-muted">{unit}</span>}
        </p>
        <p className="numeral mt-1.5 text-xs font-medium text-ink-faint">k = 2</p>
      </div>

      {finding && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Legal requirement</p>
          <p className="numeral mt-1 text-base font-semibold text-ink">{finding.required}</p>
        </div>
      )}

      {finding && threshold !== null && (
        <UncertaintyBar
          value={measurement.value}
          uncertainty={measurement.expanded_uncertainty_mm}
          threshold={threshold}
          verdict={finding.verdict}
          unit={unit}
        />
      )}
    </article>
  );
}
