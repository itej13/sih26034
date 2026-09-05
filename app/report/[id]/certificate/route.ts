import { getScan } from "@/lib/fixtures";
import { buildCertificateDocument, docxResponse } from "@/lib/report/docx";

/**
 * Section 63 (Bharatiya Sakshya Adhiniyam, 2023) certificate draft for this scan, as a .docx
 * the inspecting officer reviews and signs. Every value comes from the Scan object; the
 * officer's determination is left blank on purpose — see lib/report/docx.ts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) {
    return new Response("Scan not found.", { status: 404 });
  }
  return docxResponse(buildCertificateDocument(scan), `${scan.scan_id}-section-63-certificate.docx`);
}
