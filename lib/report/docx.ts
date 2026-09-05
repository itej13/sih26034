/**
 * DOCX construction for the editable report export and the Section 63 certificate draft.
 *
 * Both read only from the frozen `Scan` shape (lib/types.ts) — they format numbers and
 * strings the pipeline already produced. Neither computes a measurement or a verdict; that
 * would violate invariant 1 (a model, or a document builder, may read, never measure or
 * decide). If a value isn't on `Scan`, it does not appear here.
 */
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { NextResponse } from "next/server";
import type { Finding, Measurement, Scan } from "@/lib/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function docxResponse(doc: Document, filename: string): Promise<NextResponse> {
  // ArrayBuffer, not Buffer<ArrayBufferLike> — matches web BodyInit without a generic mismatch
  // between Node's and lib.dom's Uint8Array typings.
  const buffer = await Packer.toArrayBuffer(doc);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

const humanize = (key: string) => key.replaceAll("_", " ");

function heading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } });
}

function subheading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
}

function body(text: string, opts: { bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 100 } });
}

function labelValue(label: string, value: string) {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
    spacing: { after: 80 },
  });
}

const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "999999" } as const;
const tableCellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function headerCell(text: string) {
  return new TableCell({
    borders: tableCellBorders,
    shading: { fill: "F1F5F9" },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function dataCell(text: string) {
  return new TableCell({ borders: tableCellBorders, children: [new Paragraph(text)] });
}

/**
 * Every measurement's uncertainty and coverage factor travels alongside the value — never a
 * bare number (invariant 2). The interactive uncertainty bar on /report has no Word
 * equivalent, so this table carries the same figures instead of trying to redraw the chart.
 */
function measurementsTable(measurements: Measurement[]) {
  const header = new TableRow({
    children: ["Field", "Metric", "Value (mm)", "Expanded uncertainty (mm)", "k"].map(headerCell),
  });
  const rows = measurements.map(
    (m) =>
      new TableRow({
        children: [
          dataCell(humanize(m.field)),
          dataCell(humanize(m.metric)),
          dataCell(m.value.toFixed(2)),
          dataCell(`± ${m.expanded_uncertainty_mm.toFixed(2)}`),
          dataCell(String(m.k)),
        ],
      }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

/** rule_text is quoted verbatim from the Gazette (invariant 4) — never paraphrased here. */
function findingSection(finding: Finding): Paragraph[] {
  return [
    subheading(`Rule ${finding.rule_ref} · ${finding.verdict}`),
    labelValue("Measured", finding.measured),
    labelValue("Required", finding.required),
    ...(finding.message ? [body(finding.message, { italics: true })] : []),
    new Paragraph({
      children: [new TextRun({ text: finding.rule_text, italics: true })],
      indent: { left: 360 },
      spacing: { before: 80, after: 80 },
    }),
    body(`Rule pack: ${finding.rule_pack}`, { italics: true }),
  ];
}

/**
 * Same sections as app/report/[id]/page.tsx — evidence & provenance, measurements, findings —
 * in an editable container. Not a redesign: the annotated image overlay is a raster artefact
 * with no Word equivalent, so it is left to the web report and the print route.
 */
export function buildReportDocument(scan: Scan): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Legal metrology inspection report", heading: HeadingLevel.TITLE }),
          body(`Compliance report · ${scan.scan_id}`, { bold: true }),
          body(`Captured ${scan.captured_at} · Assessed under ${scan.rule_pack}`),

          heading("Evidence & provenance"),
          labelValue("Image SHA-256", scan.image_sha256),
          labelValue(
            "Calibration",
            `${scan.calibration.mode}, ${scan.calibration.mm_per_px} mm/px ± ${scan.calibration.uncertainty_mm_per_px}`,
          ),
          labelValue("Overall verdict", scan.overall),

          heading("Measurements"),
          measurementsTable(scan.measurements),

          heading("Legal findings"),
          ...scan.findings.flatMap(findingSection),
        ],
      },
    ],
  });
}

function officerBlank(label: string) {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun("_".repeat(40))],
    spacing: { after: 160 },
  });
}

/**
 * Draft certificate under Section 63, Bharatiya Sakshya Adhiniyam, 2023 — the certificate an
 * officer signs to produce this scan as evidence. It states what was measured, with what
 * uncertainty, under which rule pack and against which quoted rule_text, then stops: the
 * determination of an offence is the officer's, never this system's (invariant 1 and 3).
 */
export function buildCertificateDocument(scan: Scan): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Certificate — Section 63, Bharatiya Sakshya Adhiniyam, 2023",
            heading: HeadingLevel.TITLE,
          }),
          body("Draft. For review and signature by the inspecting officer before use.", { italics: true }),

          heading("Record identification"),
          labelValue("Scan ID", scan.scan_id),
          labelValue("Captured", scan.captured_at),
          labelValue("Recording officer", scan.officer_id),
          labelValue("Image SHA-256", scan.image_sha256),
          labelValue("Rule pack applied", scan.rule_pack),

          heading("Calibration"),
          labelValue("Mode", scan.calibration.mode),
          labelValue(
            "Scale",
            `${scan.calibration.mm_per_px} mm/px ± ${scan.calibration.uncertainty_mm_per_px} mm/px`,
          ),
          labelValue("Squareness residual", String(scan.calibration.squareness_residual)),

          heading("Measurements taken"),
          body(
            "Every measurement below carries its expanded uncertainty at coverage factor k = 2, " +
              "per the system's measurement contract. The interval, not the point value, is what " +
              "was compared to each rule's threshold.",
          ),
          measurementsTable(scan.measurements),

          heading("Rules evaluated, with the Gazette text relied upon"),
          ...scan.findings.flatMap(findingSection),

          heading("Automated overall result"),
          labelValue("Overall verdict", scan.overall),
          ...(scan.overall === "INDETERMINATE"
            ? [
                body(
                  "This scan's overall verdict is INDETERMINATE: at least one measurement's " +
                    "uncertainty interval straddles its legal threshold, so automated evaluation " +
                    "could not settle compliance from this capture. This is not a finding of violation.",
                  { italics: true },
                ),
              ]
            : []),

          heading("Officer's determination"),
          body(
            "This section is completed by the inspecting officer, not the system. The material " +
              "above reports measurements and rule evaluations only; it does not determine an offence.",
          ),
          officerBlank("Determination"),
          officerBlank("Officer name"),
          officerBlank("Designation"),
          officerBlank("Signature"),
          officerBlank("Date"),
        ],
      },
    ],
  });
}
