import { NextResponse } from "next/server";
import { evaluate } from "@/lib/evaluate";
import { latestPack, packById, packIds } from "@/lib/packs";
import type { EvaluableScan } from "@/lib/evaluate";

/**
 * Stage 5 — Judge. Label Object Model in, findings and a rollup verdict out.
 *
 * Deterministic and offline: no model call, no network, no database. The same scan and the
 * same pack id always produce the same verdict, which is what makes a finding defensible
 * when someone challenges the notice it came from.
 */

interface Body {
  scan?: unknown;
  pack_id?: unknown;
}

/** Enough validation to fail loudly at the boundary rather than deep inside the geometry. */
function invalidScan(scan: unknown): string | null {
  if (typeof scan !== "object" || scan === null) return "scan must be an object";
  const s = scan as Partial<EvaluableScan>;
  if (typeof s.calibration?.mm_per_px !== "number" || s.calibration.mm_per_px <= 0) {
    return "scan.calibration.mm_per_px must be a positive number";
  }
  if (typeof s.calibration?.uncertainty_mm_per_px !== "number") {
    return "scan.calibration.uncertainty_mm_per_px is required";
  }
  if (!Array.isArray(s.fields)) return "scan.fields must be an array";
  if (!Array.isArray(s.measurements)) return "scan.measurements must be an array";
  if (!Array.isArray(s.other_print)) return "scan.other_print must be an array";
  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const problem = invalidScan(body.scan);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const pack =
    body.pack_id === undefined ? latestPack : packById(String(body.pack_id));
  if (!pack) {
    return NextResponse.json(
      { error: `Unknown rule pack. Available: ${packIds().join(", ")}` },
      { status: 400 },
    );
  }

  const { findings, overall, not_assessed } = evaluate(body.scan as EvaluableScan, pack);

  return NextResponse.json({
    findings,
    overall,
    // Rules the pipeline cannot judge at all, with the reason. Reported rather than folded
    // into the verdict: a check we never ran is not the same as one we ran and could not
    // settle, and a report that conflates them overstates what was inspected.
    not_assessed,
    // Echoed so a stored scan records which law it was judged under, not merely which law
    // was current when someone later opens the report.
    rule_pack: pack.pack,
    rule_pack_effective_from: pack.effective_from,
  });
}

export async function GET() {
  return NextResponse.json({ packs: packIds() });
}
