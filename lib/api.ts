import type { Calibration, Finding, LabelField, Measurement, Pdp, Poly, Scan, OverallVerdict } from "@/lib/types";

/**
 * `other_print` is required, not optional, on purpose. runPipeline used to fabricate an empty
 * array here, which told the evaluator "we looked and found no other printing" when in truth
 * nothing had looked — and Rule 8(1) reads an empty list as clear space, so every live scan
 * passed the clear-space check regardless of the packet. Making the field mandatory forces any
 * future extraction provider to say what it actually found rather than inheriting a silent pass.
 */
export interface ExtractResponse { fields: LabelField[]; pdp: Pdp; other_print: Scan["other_print"]; }
export interface MeasureResponse { calibration: Calibration; measurements: Measurement[]; }
export interface EvaluateResponse { findings: Finding[]; overall: OverallVerdict; }

export class PipelineUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "PipelineUnavailableError"; }
}

export class PipelineRequestError extends Error {
  constructor(message: string) { super(message); this.name = "PipelineRequestError"; }
}

/**
 * The backend declined to produce a value rather than guessing one — a card that was not lying
 * flat on the panel, or a numeral polygon it could not resolve. This is the project's central
 * claim working, not a failure, so it is a distinct type: the UI must render it as
 * INDETERMINATE and never as a crash.
 */
export class PipelineIndeterminateError extends Error {
  constructor(message: string) { super(message); this.name = "PipelineIndeterminateError"; }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    if (response.status === 404) throw new PipelineUnavailableError(`${url} is not deployed.`);
    // 422 is the metrology core refusing to answer. Its body carries the reason in the
    // officer's terms, so read it rather than discarding it behind a status code.
    if (response.status === 422) {
      const reason = await response.json().then((body) => (body as { error?: string }).error).catch(() => undefined);
      throw new PipelineIndeterminateError(reason ?? "The backend could not measure this capture reliably.");
    }
    throw new PipelineRequestError(`${url} returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

async function postImage<T>(url: string, file: File, extra?: Record<string, string>) {
  const form = new FormData(); form.append("image", file);
  Object.entries(extra ?? {}).forEach(([key, value]) => form.append(key, value));
  return requestJson<T>(url, { method: "POST", body: form });
}

export async function extractDeclarations(file: File): Promise<ExtractResponse> {
  return postImage<ExtractResponse>("/api/extract", file);
}

export async function measureNumeral(file: File, numeralPoly: Poly, field = "mrp"): Promise<MeasureResponse> {
  return postImage<MeasureResponse>("/api/measure", file, { numeral_poly: JSON.stringify(numeralPoly), field });
}

export async function evaluateScan(input: Omit<Scan, "findings" | "overall">, rulePack: string): Promise<EvaluateResponse> {
  return requestJson<EvaluateResponse>("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan: input, pack_id: rulePack }) });
}

/**
 * Runs the production stage boundary without deriving measurements or verdicts in React.
 * The returned values are exactly those supplied by the three backend contracts.
 *
 * EVERY field carrying a numeral polygon is measured, not just the first one. Measuring only
 * the first meant `net_qty` was never measured on a live scan, so Rule 7(2) — the Table I
 * height that is half of what this tool exists to check — returned INDETERMINATE for every
 * packet regardless of what was photographed.
 */
export async function runPipeline(file: File, rulePack: string): Promise<Scan> {
  const extraction = await extractDeclarations(file);
  const measurable = extraction.fields.filter((candidate) => candidate.numeral_poly);
  if (measurable.length === 0) throw new PipelineUnavailableError("Extraction returned no numeral_poly to measure.");

  let calibration: Calibration | undefined;
  const measurements: Measurement[] = [];
  for (const field of measurable) {
    try {
      const measured = await measureNumeral(file, field.numeral_poly!, field.key);
      calibration ??= measured.calibration;
      measurements.push(...measured.measurements);
    } catch (error) {
      // Calibration is a property of the photograph, so if the very first attempt cannot
      // calibrate, no later field will either — surface it. A later field failing on its own
      // polygon is local: drop that measurement and let the rule engine return INDETERMINATE
      // for the rules that needed it, which is the honest answer rather than a failed scan.
      if (!calibration) throw error;
      if (!(error instanceof PipelineIndeterminateError)) throw error;
    }
  }
  if (!calibration) throw new PipelineUnavailableError("No calibration was recovered from this photograph.");

  const draft: Omit<Scan, "findings" | "overall"> = { scan_id: `live_${Date.now()}`, captured_at: new Date().toISOString(), officer_id: "unassigned", image_url: "", image_sha256: "", gps: null, calibration, pdp: extraction.pdp, fields: extraction.fields, other_print: extraction.other_print, measurements, rule_pack: rulePack };
  const evaluation = await evaluateScan(draft, rulePack);
  return { ...draft, findings: evaluation.findings, overall: evaluation.overall };
}
