import Link from "next/link";
import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FieldList } from "@/components/scan/FieldList";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { VerdictBadge } from "@/components/scan/VerdictBadge";
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();
  const primaryMeasurement = scan.measurements.find((measurement) => measurement.field === "mrp" && measurement.metric === "numeral_height_mm");
  const primaryFinding = scan.findings.find((finding) => finding.rule_ref === "7(3)");
  return (
    <main className="page-shell">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-6">
        <div><p className="eyebrow">Legal metrology inspection · {scan.scan_id}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Inspection result</h1><p className="mt-2 text-sm text-slate-600">Captured {new Date(scan.captured_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-right"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-700">Overall verdict</p><div className="mt-2"><VerdictBadge verdict={scan.overall} /></div></div>
      </header>
      <section className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]"><AnnotatedImage fields={scan.fields} imageUrl={scan.image_url.replace(".jpg", ".svg")} /><div className="space-y-4"><section className="panel border-l-4 border-l-amber-600 p-5"><p className="eyebrow">Measured declaration</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">MRP ₹45.00</h2><p className="mt-2 text-sm text-slate-600">The amber annotation isolates the exact printed numeral supplied to measurement.</p></section>{primaryMeasurement && <MeasurementCard measurement={primaryMeasurement} finding={primaryFinding} />}<section className="panel p-5"><p className="eyebrow">Measurement provenance</p><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Calibration mode</dt><dd className="font-medium text-slate-900">ArUco calibration card</dd></div><div><dt className="text-slate-500">Scale</dt><dd className="font-medium text-slate-900">{scan.calibration.mm_per_px} mm/px ± {scan.calibration.uncertainty_mm_per_px}</dd></div><div><dt className="text-slate-500">Squareness residual</dt><dd className="font-medium text-slate-900">{scan.calibration.squareness_residual}</dd></div><div><dt className="text-slate-500">Rule pack</dt><dd className="font-medium text-slate-900">{scan.rule_pack}</dd></div></dl></section></div></section>
      <section className="mt-10 grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]"><div><p className="eyebrow">Findings</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">Rule-engine output</h2><div className="mt-4 space-y-4">{scan.findings.map((finding) => <FindingCard key={`${finding.rule_ref}-${finding.verdict}`} finding={finding} />)}</div></div><FieldList fields={scan.fields} /></section>
      <div className="mt-8 flex flex-wrap gap-3 no-print"><Link href={`/report/${scan.scan_id}`} className="button-primary">Open printable report</Link><Link href="/capture" className="button-secondary">Inspect another package</Link></div>
    </main>
  );
}
