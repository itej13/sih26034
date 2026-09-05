import { getScan } from "@/lib/fixtures";
import { buildReportDocument, docxResponse } from "@/lib/report/docx";

/**
 * The same report as /report/[id], exported as an editable .docx — an officer without a
 * print-to-PDF workflow still leaves with a document they can annotate. Same sections, same
 * values as the print route; see lib/report/docx.ts for why the annotated image is left out.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) {
    return new Response("Scan not found.", { status: 404 });
  }
  return docxResponse(buildReportDocument(scan), `${scan.scan_id}-report.docx`);
}
