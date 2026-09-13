import type { Verdict } from "@/lib/types";

/**
 * The signature visual: the measured INTERVAL against the legal threshold, never the point
 * value against it.
 *
 * The labels used to be absolutely positioned at their own computed percentages, which meant
 * they collided exactly when the measurement was interesting — value close to threshold, the
 * case being demonstrated — and clipped out of the container at the extremes. The bar now
 * carries only marks, and the reading moves to a legend beneath it: legible at 320px by
 * construction, at any value, with no collision case to get right.
 *
 * `unit` comes from the caller, never from the field name: expanded_uncertainty_mm carries a
 * dimensionless contrast_ratio too, and printing "mm" beside a ratio would put a wrong unit on
 * a screen the panel reads aloud.
 */
export function UncertaintyBar({
  value,
  uncertainty,
  threshold,
  verdict,
  unit,
}: {
  value: number;
  uncertainty: number;
  threshold: number;
  verdict: Verdict;
  unit: string | null;
}) {
  const ceiling = Math.max(value + uncertainty, threshold) * 1.18;
  const position = (number: number) => `${Math.min(100, Math.max(0, (number / ceiling) * 100))}%`;
  const suffix = unit ? ` ${unit}` : "";
  const low = value - uncertainty;
  const high = value + uncertainty;

  return (
    <div
      className="mt-5"
      aria-label={`Measured interval ${low.toFixed(2)} to ${high.toFixed(2)}${suffix}; legal threshold ${threshold.toFixed(2)}${suffix}; verdict ${verdict}`}
    >
      <div className="relative h-9" aria-hidden="true">
        <div className="absolute top-4 h-2.5 w-full rounded-full bg-sunken" />
        <div
          className="absolute top-4 h-2.5 rounded-full bg-brand"
          style={{ left: position(low), width: `calc(${position(high)} - ${position(low)})` }}
        />
        {/* The two marks differ in height and side so they stay tellable apart when the
            measurement sits right on the limit and they land on the same pixel. */}
        <span className="absolute top-4 h-5 w-0.5 bg-white" style={{ left: position(value) }} />
        <span className="absolute top-0 h-8 w-0.5 bg-measure" style={{ left: position(threshold) }} />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="flex items-center gap-1.5 font-semibold text-ink-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            Measured
          </dt>
          <dd className="numeral mt-1 text-sm font-semibold text-ink">
            {value.toFixed(2)} ± {uncertainty.toFixed(2)}
            {unit && <span className="font-sans text-xs font-medium text-ink-muted"> {unit}</span>}
          </dd>
          <dd className="numeral text-[11px] text-ink-faint">k = 2</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 font-semibold text-measure">
            <span className="h-2.5 w-0.5 shrink-0 bg-measure" aria-hidden="true" />
            Required
          </dt>
          <dd className="numeral mt-1 text-sm font-semibold text-ink">
            {threshold.toFixed(2)}
            {unit && <span className="font-sans text-xs font-medium text-ink-muted"> {unit}</span>}
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-line pt-2 text-xs leading-5 text-ink-muted">
        Interval <span className="numeral font-semibold text-ink">{low.toFixed(2)}–{high.toFixed(2)}{suffix}</span> compared to the limit · backend verdict <strong className="text-ink">{verdict}</strong>
      </p>
    </div>
  );
}
