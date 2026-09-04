import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { PrintButton } from "@/components/scan/PrintButton";
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();
  return <main className="page-shell max-w-4xl"><div className="no-print mb-6 flex justify-end"><PrintButton /></div><header className="border-b-2 border-slate-900 pb-5"><p className="eyebrow">Legal metrology inspection report</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Compliance report · {scan.scan_id}</h1><p className="mt-2 text-sm text-slate-600">Captured {scan.captured_at} · Assessed under {scan.rule_pack}</p></header><section className="mt-7 grid gap-6 md:grid-cols-2"><AnnotatedImage fields={scan.fields} imageUrl={scan.image_url.replace(".jpg", ".svg")} /><section className="panel p-5"><p className="eyebrow">Evidence & provenance</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-slate-500">Image SHA-256</dt><dd className="break-all font-mono text-xs text-slate-900">{scan.image_sha256}</dd></div><div><dt className="text-slate-500">Calibration</dt><dd className="font-medium">{scan.calibration.mode}, {scan.calibration.mm_per_px} mm/px ± {scan.calibration.uncertainty_mm_per_px}</dd></div><div><dt className="text-slate-500">Overall verdict</dt><dd className="font-semibold">{scan.overall}</dd></div></dl></section></section><section className="mt-7"><p className="eyebrow">Measurements</p><div className="mt-4 space-y-4">{scan.measurements.map((measurement) => <MeasurementCard key={`${measurement.field}-${measurement.metric}`} measurement={measurement} finding={scan.findings.find((finding) => finding.rule_ref === "7(3)") && measurement.field === "mrp" && measurement.metric === "numeral_height_mm" ? scan.findings.find((finding) => finding.rule_ref === "7(3)") : undefined} />)}</div></section><section className="mt-7"><p className="eyebrow">Legal findings</p><div className="mt-4 space-y-4">{scan.findings.map((finding) => <FindingCard key={`${finding.rule_ref}-${finding.verdict}`} finding={finding} />)}</div></section></main>;
}
