import Link from "next/link";
import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FieldList } from "@/components/scan/FieldList";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { PackProvenance } from "@/components/scan/PackProvenance";
import { VerdictBadge } from "@/components/scan/VerdictBadge";
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();
  const primaryMeasurement = scan.measurements.find((measurement) => measurement.field === "mrp" && measurement.metric === "numeral_height_mm");
  const primaryFinding = scan.findings.find((finding) => finding.rule_ref === "7(3)");
  const mrpField = scan.fields.find((field) => field.key === "mrp");

  return (
    <main className="page-shell">
      {/*
        The projector is 1024x768, so the usable height is about 600px and this header is the
        moment the demo builds to. It stays one short band: the verdict must be on screen
        without a scroll at that size, and it is the first thing on a phone too.
      */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="order-2 sm:order-1">
          <p className="eyebrow">Legal metrology inspection · <span className="numeral">{scan.scan_id}</span></p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Inspection result</h1>
          <p className="numeral mt-1.5 text-sm text-ink-muted">
            Captured {new Date(scan.captured_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
          </p>
        </div>
        <div className="order-1 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:order-2">
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.16em] text-ink-faint">Overall<br className="hidden sm:block" /> verdict</p>
          <VerdictBadge verdict={scan.overall} className="text-sm" />
        </div>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]">
        <AnnotatedImage fields={scan.fields} imageUrl={scan.image_url.replace(".jpg", ".svg")} />
        <div className="space-y-4">
          <section className="panel border-l-4 border-l-measure p-5">
            <p className="eyebrow">Measured declaration</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              {mrpField ? mrpField.text : <span className="italic text-ink-faint">No MRP field extracted</span>}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">The amber annotation isolates the exact printed numeral supplied to measurement.</p>
          </section>

          {primaryMeasurement && <MeasurementCard measurement={primaryMeasurement} finding={primaryFinding} />}

          <section className="panel p-5">
            <p className="eyebrow">Measurement provenance</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Calibration mode</dt>
                <dd className="mt-0.5 font-medium text-ink">{scan.calibration.mode === "aruco_card" ? "ArUco calibration card" : "Manual two-tap calibration"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Scale</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">{scan.calibration.mm_per_px} mm/px ± {scan.calibration.uncertainty_mm_per_px}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Squareness residual</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">{scan.calibration.squareness_residual}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Rule pack</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">{scan.rule_pack}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]">
        <div>
          <p className="eyebrow">Findings</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Rule-engine output</h2>
          {/* Keyed by position: two different rules both cite rule_ref "7(3)", so keying by
              rule_ref alone silently drops one of them from the list. */}
          <div className="mt-4 space-y-4">
            {scan.findings.map((finding, index) => <FindingCard key={`${finding.rule_ref}-${index}`} finding={finding} />)}
          </div>
        </div>
        <FieldList fields={scan.fields} />
      </section>

      <section className="no-print mt-10">
        <p className="eyebrow">Judged under which law</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Rule pack provenance</h2>
        <div className="mt-4"><PackProvenance scan={scan} /></div>
      </section>

      <div className="no-print mt-8 flex flex-wrap gap-3">
        <Link href={`/report/${scan.scan_id}`} className="button-primary">Open printable report</Link>
        <Link href="/capture" className="button-secondary">Inspect another package</Link>
      </div>
    </main>
  );
}
