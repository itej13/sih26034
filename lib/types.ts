/**
 * The Label Object Model — the frozen Day 0 contract.
 *
 * Every input source (a photograph today, an e-commerce listing later) reduces to this
 * shape, and every rule in a rule pack is a predicate over it. Changing a field name here
 * breaks all three development lanes at once, so it happens only with all three developers
 * in the same conversation.
 *
 * The canonical examples live in fixtures/. Run `npm run check:contract` after any edit.
 */

export type FieldKey =
  | "mrp"
  | "net_qty"
  | "mfg_date"
  | "manufacturer"
  | "consumer_care"
  | "generic_name";

export type Verdict = "COMPLIANT" | "VIOLATION" | "INDETERMINATE";

/** Clockwise from top-left, in RECTIFIED image pixels — never raw camera pixels. */
export type Poly = [number, number][];

export interface Calibration {
  mode: "aruco_card" | "manual_two_tap";
  marker_mm: number;
  mm_per_px: number;
  uncertainty_mm_per_px: number;
  /** Rectified squareness residual — a proxy for the card not lying flat on the panel. */
  squareness_residual: number;
}

export interface LabelField {
  key: FieldKey;
  text: string;
  value: number | string | { n: number; unit: string } | null;
  poly: Poly;
  /** The bare digits, isolated from prefixes like "MRP ₹". Null where the rule measures nothing. */
  numeral_poly: Poly | null;
  confidence: number;
  corrected_by_officer: boolean;
}

export interface Measurement {
  field: FieldKey;
  metric: "numeral_height_mm" | "numeral_width_mm";
  value: number;
  /** Expanded uncertainty. Compare the INTERVAL to the legal limit, never the point value. */
  expanded_uncertainty_mm: number;
  k: 2;
}

export interface Finding {
  rule_ref: string;
  verdict: Verdict;
  measured: string;
  required: string;
  rule_pack: string;
  /** Quoted verbatim from the Gazette. Never paraphrased. */
  rule_text: string;
  message: string | null;
}

export interface Scan {
  scan_id: string;
  captured_at: string;
  officer_id: string;
  image_url: string;
  image_sha256: string;
  gps: { lat: number; lon: number } | null;
  calibration: Calibration;
  pdp: { poly: Poly; area_cm2: number; confidence: number };
  fields: LabelField[];
  /** Every other printed region — needed only for the Rule 8(1) clear-space check. */
  other_print: { poly: Poly; note?: string }[];
  measurements: Measurement[];
  findings: Finding[];
  rule_pack: string;
  /** Worst-wins rollup of `findings`: any violation wins, else any indeterminate. */
  overall: Verdict;
}

/** Guard band. The reason a marginal measurement never becomes an accusation. */
export function verdictFor(
  value: number,
  expandedUncertainty: number,
  minimum: number,
): Verdict {
  if (value - expandedUncertainty > minimum) return "COMPLIANT";
  if (value + expandedUncertainty < minimum) return "VIOLATION";
  return "INDETERMINATE";
}
