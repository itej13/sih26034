// Dhruv · Stage 6. Print-styled route; the browser's own print-to-PDF makes the file.
// No PDF library — what prints is exactly what is on screen.
import { getScan } from "@/lib/fixtures";
import { notFound } from "next/navigation";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();

  return (
    <main className="mx-auto max-w-3xl p-10 print:p-0">
      <h1 className="text-xl font-bold">Compliance report — {scan.scan_id}</h1>
      <p className="mt-1 text-sm">
        Captured {scan.captured_at} · image SHA-256 {scan.image_sha256.slice(0, 16)}…
      </p>
      <p className="mt-1 text-sm">Assessed under {scan.rule_pack}.</p>
      <p className="mt-6 text-xs opacity-50">
        TODO: findings table, evidence chain position, and the drafted certificate under
        Section 63 of the Bharatiya Sakshya Adhiniyam, 2023.
      </p>
    </main>
  );
}
