import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { PrintButton } from "@/components/scan/PrintButton";
import { VerdictBadge } from "@/components/scan/VerdictBadge";
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();
  const heightFinding = scan.findings.find((finding) => finding.rule_ref === "7(3)");

  return (
    <main className="page-shell max-w-4xl">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>

      <header className="border-b-2 border-ink pb-5">
        <p className="eyebrow">Legal metrology inspection report</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-ink">Compliance report · <span className="numeral">{scan.scan_id}</span></h1>
            <p className="numeral mt-2 text-sm text-ink-muted">Captured {scan.captured_at} · Assessed under {scan.rule_pack}</p>
          </div>
          <VerdictBadge verdict={scan.overall} className="text-sm" />
        </div>
      </header>

      <section className="mt-7 grid gap-6 md:grid-cols-2">
        <AnnotatedImage fields={scan.fields} imageUrl={scan.image_url.replace(".jpg", ".svg")} />
        <section className="panel p-5">
          <p className="eyebrow">Evidence &amp; provenance</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Image SHA-256</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-ink">{scan.image_sha256}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Calibration</dt>
              <dd className="numeral mt-0.5 font-medium text-ink">{scan.calibration.mode}, {scan.calibration.mm_per_px} mm/px ± {scan.calibration.uncertainty_mm_per_px}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Overall verdict</dt>
              <dd className="mt-1"><VerdictBadge verdict={scan.overall} /></dd>
            </div>
          </dl>
        </section>
      </section>

      <section className="mt-7">
        <p className="eyebrow">Measurements</p>
        <div className="mt-4 space-y-4">
          {scan.measurements.map((measurement) => (
            <MeasurementCard
              key={`${measurement.field}-${measurement.metric}`}
              measurement={measurement}
              // Only the MRP letter-height measurement is the subject of rule 7(3); pairing any
              // other metric with it would put the wrong threshold under the wrong figure.
              finding={measurement.field === "mrp" && measurement.metric === "numeral_height_mm" ? heightFinding : undefined}
            />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <p className="eyebrow">Legal findings</p>
        {/* Positional keys: two different rules both cite rule_ref "7(3)". */}
        <div className="mt-4 space-y-4">
          {scan.findings.map((finding, index) => <FindingCard key={`${finding.rule_ref}-${index}`} finding={finding} />)}
        </div>
      </section>
    </main>
  );
}
