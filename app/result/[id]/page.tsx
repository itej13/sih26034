// Shaurya · the screen judges look at longest. Build it entirely from the fixture first.
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">{scan.overall}</h1>
      <p className="mt-1 text-sm opacity-70">
        {scan.rule_pack} · {scan.calibration.mm_per_px} mm/px ±{" "}
        {scan.calibration.uncertainty_mm_per_px}
      </p>
      <ul className="mt-6 space-y-4">
        {scan.findings.map((f) => (
          <li key={f.rule_ref + f.verdict} className="rounded border p-4">
            <div className="text-xs uppercase tracking-wide opacity-60">
              Rule {f.rule_ref} · {f.verdict}
            </div>
            <div className="mt-1">
              {f.measured} — required {f.required}
            </div>
            {f.message && <p className="mt-2 text-sm opacity-80">{f.message}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs opacity-50">
        TODO: annotated overlay from the polygons, and the uncertainty bar per measurement —
        that component is the visual signature of the project.
      </p>
    </main>
  );
}
