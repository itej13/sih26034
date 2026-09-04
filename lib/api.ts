import type { Calibration, Finding, LabelField, Measurement, Pdp, Poly, Scan, OverallVerdict } from "@/lib/types";

export interface ExtractResponse { fields: LabelField[]; pdp: Pdp; }
export interface MeasureResponse { calibration: Calibration; measurements: Measurement[]; }
export interface EvaluateResponse { findings: Finding[]; overall: OverallVerdict; }

export class PipelineUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "PipelineUnavailableError"; }
}

export class PipelineRequestError extends Error {
  constructor(message: string) { super(message); this.name = "PipelineRequestError"; }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    if (response.status === 404) throw new PipelineUnavailableError(`${url} is not deployed.`);
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
  return requestJson<EvaluateResponse>("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan: input, rule_pack: rulePack }) });
}

/**
 * Runs the production stage boundary without deriving measurements or verdicts in React.
 * The returned values are exactly those supplied by the three backend contracts.
 */
export async function runPipeline(file: File, rulePack: string): Promise<Scan> {
  const extraction = await extractDeclarations(file);
  const field = extraction.fields.find((candidate) => candidate.numeral_poly);
  if (!field?.numeral_poly) throw new PipelineUnavailableError("Extraction returned no numeral_poly to measure.");
  const measurement = await measureNumeral(file, field.numeral_poly, field.key);
  const draft: Omit<Scan, "findings" | "overall"> = { scan_id: `live_${Date.now()}`, captured_at: new Date().toISOString(), officer_id: "unassigned", image_url: "", image_sha256: "", gps: null, calibration: measurement.calibration, pdp: extraction.pdp, fields: extraction.fields, other_print: [], measurements: measurement.measurements, rule_pack: rulePack };
  const evaluation = await evaluateScan(draft, rulePack);
  return { ...draft, findings: evaluation.findings, overall: evaluation.overall };
}
