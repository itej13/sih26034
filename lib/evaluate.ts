/**
 * Stage 5 — Judge.
 *
 * A rule pack a human wrote, evaluated over the Label Object Model. No model is consulted
 * here and none ever should be: this file is the reason "it's just an LLM wrapper" is not
 * true of the project. Every verdict below traces to a quoted line of the Gazette and a
 * number OpenCV measured.
 *
 * The one discipline that matters: a verdict compares the measurement INTERVAL to the legal
 * threshold, never the point value. Where the interval straddles the threshold the answer is
 * INDETERMINATE, and where the pipeline did not measure the thing at all the answer is also
 * INDETERMINATE — never VIOLATION. Absence of evidence is not evidence of an offence.
 */

import { verdictFor } from "./types.ts";
import type { FieldKey, Finding, LabelField, Poly, Scan, Verdict } from "./types.ts";

/** A scan as it exists before stage 5 runs. Findings and the rollup are this file's output. */
export type EvaluableScan = Omit<Scan, "findings" | "overall">;

export interface Rule {
  id: string;
  rule_ref: string;
  rule_text: string;
  applies_to: FieldKey;
  predicate: string;
  message: string;
  metric?: "numeral_height_mm" | "numeral_width_mm";
  threshold?: number;
  threshold_embossed?: number;
  numerator?: "numeral_height_mm" | "numeral_width_mm";
  denominator?: "numeral_height_mm" | "numeral_width_mm";
  lookup_on?: string;
  table?: { up_to: number | null; mm: number; embossed_mm?: number }[];
  vertical_multiple?: number;
  horizontal_multiple?: number;
  pattern?: string;
  allowed?: string[];
}

export interface RulePack {
  pack: string;
  effective_from: string;
  title: string;
  rules: Rule[];
}

/**
 * Below this, a field's identification is treated as unsettled and a would-be VIOLATION is
 * held open as INDETERMINATE instead. The model does not measure, but it does decide which
 * string on the pack is the MRP — and that choice selects which rule fires. An officer who
 * has confirmed the field overrides this entirely.
 *
 * ponytail: one global floor. Split it per field key if extraction turns out to be reliably
 * confident on some declarations and shaky on others.
 */
const CONFIDENCE_FLOOR = 0.7;

const GRAMS_PER: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const MILLILITRES_PER: Record<string, number> = { ml: 1, l: 1000, cl: 10 };

/** A rule this pipeline structurally cannot judge yet — reported, never silently dropped. */
export interface NotAssessed {
  rule_ref: string;
  rule_id: string;
  reason: string;
}

/**
 * Predicates the pipeline has no input for. These produce no finding at all rather than a
 * permanent INDETERMINATE, and the difference matters: an INDETERMINATE is a verdict held
 * open pending a better photograph, and it drags the whole scan open with it. A rule we
 * cannot assess at all would do that to every scan forever, which would make the rollup
 * meaningless and every demo INDETERMINATE.
 *
 * So they are reported separately. "Nine checks run, two not assessed, here is why" is both
 * honest and a stronger claim than a verdict that quietly never resolves. Delete an entry
 * here the day its measurement lands.
 */
const UNASSESSABLE: Record<string, string> = {
  contrast_min:
    "No colour or contrast measurement is produced by the pipeline, so Rule 9(1)(b) cannot be judged from this scan.",
  consistent_with:
    "No sticker or overlaid-declaration detection exists yet, so this rule cannot be judged from this scan.",
};

export function evaluate(
  scan: EvaluableScan,
  pack: RulePack,
): { findings: Finding[]; overall: Verdict; not_assessed: NotAssessed[] } {
  const findings: Finding[] = [];
  const not_assessed: NotAssessed[] = [];

  for (const rule of pack.rules) {
    const reason = UNASSESSABLE[rule.predicate];
    if (reason) {
      not_assessed.push({ rule_ref: rule.rule_ref, rule_id: rule.id, reason });
      continue;
    }
    findings.push(applyRule(scan, rule, pack.pack));
  }

  return { findings, overall: rollup(findings), not_assessed };
}

/** Worst-wins. Any violation carries the scan; otherwise any indeterminate holds it open. */
export function rollup(findings: { verdict: Verdict }[]): Verdict {
  const seen = findings.map((f) => f.verdict);
  if (seen.includes("VIOLATION")) return "VIOLATION";
  if (seen.includes("INDETERMINATE")) return "INDETERMINATE";
  return "COMPLIANT";
}

function applyRule(scan: EvaluableScan, rule: Rule, packId: string): Finding {
  const field = scan.fields.find((f) => f.key === rule.applies_to);

  const decided = decide(scan, rule, field);

  return {
    rule_ref: rule.rule_ref,
    verdict: guard(decided.verdict, field),
    measured: decided.measured,
    required: decided.required,
    rule_pack: packId,
    rule_text: rule.rule_text,
    message: decided.verdict === "COMPLIANT" ? null : (decided.note ?? rule.message),
  };
}

/**
 * The model's classification is an input, not a verdict. A violation resting on a field the
 * extractor was unsure it had identified is held open rather than asserted.
 */
function guard(verdict: Verdict, field: LabelField | undefined): Verdict {
  if (verdict !== "VIOLATION") return verdict;
  if (!field) return verdict;
  if (field.corrected_by_officer) return verdict;
  return field.confidence < CONFIDENCE_FLOOR ? "INDETERMINATE" : verdict;
}

interface Decision {
  verdict: Verdict;
  measured: string;
  required: string;
  note?: string;
}

function undecided(required: string, note: string): Decision {
  return { verdict: "INDETERMINATE", measured: "not measured", required, note };
}

function decide(
  scan: EvaluableScan,
  rule: Rule,
  field: LabelField | undefined,
): Decision {
  switch (rule.predicate) {
    case "min_mm":
      return minMm(scan, rule);
    case "min_mm_lookup":
      return minMmLookup(scan, rule, field);
    case "min_ratio":
      return minRatio(scan, rule);
    case "clear_space":
      return clearSpace(scan, rule, field);
    case "present":
      return present(field);
    case "matches":
      return matches(rule, field);
    case "in_set":
      return inSet(rule, field);
    default:
      return undecided("a known predicate", `Unknown predicate "${rule.predicate}".`);
  }
}

// ---------------------------------------------------------------------------
// Metric predicates
// ---------------------------------------------------------------------------

function measurementOf(
  scan: EvaluableScan,
  fieldKey: FieldKey,
  metric: string | undefined,
) {
  if (!metric) return undefined;
  return scan.measurements.find((m) => m.field === fieldKey && m.metric === metric);
}

function mm(value: number) {
  return value.toFixed(2);
}

function minMm(scan: EvaluableScan, rule: Rule): Decision {
  const required = `≥ ${mm(rule.threshold ?? 0)} mm`;
  const m = measurementOf(scan, rule.applies_to, rule.metric);
  if (!m) {
    return undecided(required, `${rule.applies_to} was not measured, so this rule is open.`);
  }
  // threshold_embossed is deliberately unused: nothing in the Label Object Model records
  // whether a declaration is embossed, so applying the doubled threshold would be a guess
  // that raises violations. Defaults to the printed threshold, which is the lenient one.
  return {
    verdict: verdictFor(m.value, m.expanded_uncertainty_mm, rule.threshold ?? 0),
    measured: `${mm(m.value)} ± ${mm(m.expanded_uncertainty_mm)} mm`,
    required,
  };
}

/** Net quantity in grams or millilitres, or null when the unit is not one we know. */
function netQuantity(field: LabelField | undefined): number | null {
  const v = field?.value;
  if (!v || typeof v !== "object" || !("n" in v) || !("unit" in v)) return null;
  const unit = String(v.unit).toLowerCase();
  const factor = GRAMS_PER[unit] ?? MILLILITRES_PER[unit];
  return factor === undefined ? null : v.n * factor;
}

function minMmLookup(
  scan: EvaluableScan,
  rule: Rule,
  field: LabelField | undefined,
): Decision {
  const quantity = netQuantity(field);
  if (quantity === null) {
    return undecided(
      "a height from Table I",
      "Net quantity could not be read in a known unit, so the required height is unknown.",
    );
  }

  const row = (rule.table ?? []).find((r) => r.up_to === null || quantity <= r.up_to);
  if (!row) {
    return undecided("a height from Table I", "No row of Table I covers this net quantity.");
  }

  const required = `≥ ${mm(row.mm)} mm (Table I, ${
    row.up_to === null ? "above the largest band" : `up to ${row.up_to} g/ml`
  })`;

  const m = measurementOf(scan, rule.applies_to, rule.metric);
  if (!m) {
    return undecided(required, `${rule.applies_to} was not measured, so this rule is open.`);
  }

  return {
    verdict: verdictFor(m.value, m.expanded_uncertainty_mm, row.mm),
    measured: `${mm(m.value)} ± ${mm(m.expanded_uncertainty_mm)} mm`,
    required,
  };
}

function minRatio(scan: EvaluableScan, rule: Rule): Decision {
  const required = `width ≥ ${(rule.threshold ?? 0).toFixed(4)} × height`;
  const num = measurementOf(scan, rule.applies_to, rule.numerator);
  const den = measurementOf(scan, rule.applies_to, rule.denominator);
  if (!num || !den || den.value === 0) {
    return undecided(
      required,
      "Both numeral width and height are needed for the ratio, and one is missing.",
    );
  }

  const ratio = num.value / den.value;
  // A quotient's relative uncertainty is the two relative uncertainties in quadrature.
  // Both inputs are already expanded at k=2, so the result is too — the expansion factor
  // is linear and passes straight through.
  const u =
    ratio *
    Math.hypot(
      num.expanded_uncertainty_mm / num.value,
      den.expanded_uncertainty_mm / den.value,
    );

  return {
    verdict: verdictFor(ratio, u, rule.threshold ?? 0),
    measured: `${ratio.toFixed(3)} ± ${u.toFixed(3)}`,
    required,
  };
}

// ---------------------------------------------------------------------------
// Geometry — Rule 8(1) clear space
// ---------------------------------------------------------------------------

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function bbox(poly: Poly): Box {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

/** Separation between two boxes along one axis, in pixels. Zero when they overlap. */
function gap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.max(a0 - b1, b0 - a1));
}

function clearSpace(
  scan: EvaluableScan,
  rule: Rule,
  field: LabelField | undefined,
): Decision {
  const poly = field?.numeral_poly ?? field?.poly;
  const height = measurementOf(scan, rule.applies_to, "numeral_height_mm");

  if (!poly || !height) {
    return undecided(
      "clear space proportional to the numeral height",
      "The numeral was not located and measured, so the required clear space is unknown.",
    );
  }

  const requiredH = (rule.horizontal_multiple ?? 0) * height.value;
  const requiredV = (rule.vertical_multiple ?? 0) * height.value;
  const required = `≥ ${mm(requiredV)} mm above and below, ≥ ${mm(requiredH)} mm left and right`;

  if (scan.other_print.length === 0) {
    return { verdict: "COMPLIANT", measured: "no other printed matter nearby", required };
  }

  const mmPerPx = scan.calibration.mm_per_px;
  const numeral = bbox(poly);
  // The requirement scales with the numeral height, so its uncertainty is the height's,
  // multiplied through. The measured gap carries the scale uncertainty over its own length.
  const uRequiredH = (rule.horizontal_multiple ?? 0) * height.expanded_uncertainty_mm;
  const uRequiredV = (rule.vertical_multiple ?? 0) * height.expanded_uncertainty_mm;
  const relScale = scan.calibration.uncertainty_mm_per_px / mmPerPx;

  let worst: Verdict = "COMPLIANT";
  let tightest = "";

  for (const other of scan.other_print) {
    const box = bbox(other.poly);
    const gapXmm = gap(numeral.x0, numeral.x1, box.x0, box.x1) * mmPerPx;
    const gapYmm = gap(numeral.y0, numeral.y1, box.y0, box.y1) * mmPerPx;

    // Clearing in EITHER axis means the print is outside the required rectangle, so the
    // better of the two verdicts is the one that stands for this box.
    const byX = verdictFor(
      gapXmm,
      Math.hypot(gapXmm * relScale, uRequiredH),
      requiredH,
    );
    const byY = verdictFor(
      gapYmm,
      Math.hypot(gapYmm * relScale, uRequiredV),
      requiredV,
    );
    const forBox = better(byX, byY);

    if (worseThan(forBox, worst)) {
      worst = forBox;
      tightest = `printed matter ${mm(Math.min(gapXmm, gapYmm))} mm from the declaration${
        other.note ? ` (${other.note})` : ""
      }`;
    }
  }

  return {
    verdict: worst,
    measured: tightest || "clear on every side",
    required,
  };
}

const SEVERITY: Record<Verdict, number> = {
  COMPLIANT: 0,
  INDETERMINATE: 1,
  VIOLATION: 2,
};

function better(a: Verdict, b: Verdict): Verdict {
  return SEVERITY[a] <= SEVERITY[b] ? a : b;
}

function worseThan(a: Verdict, b: Verdict): boolean {
  return SEVERITY[a] > SEVERITY[b];
}

// ---------------------------------------------------------------------------
// Textual predicates
// ---------------------------------------------------------------------------

function present(field: LabelField | undefined): Decision {
  const required = "present on the principal display panel";
  // No entry at all means extraction never assessed this declaration, which is absence of
  // evidence. A field that WAS located and came back empty is evidence of absence, and only
  // that second case is an offence.
  if (!field) return undecided(required, "Extraction returned no entry for this declaration.");
  const text = field.text?.trim() ?? "";
  return {
    verdict: text.length > 0 ? "COMPLIANT" : "VIOLATION",
    measured: text.length > 0 ? "present" : "absent",
    required,
  };
}

function matches(rule: Rule, field: LabelField | undefined): Decision {
  const required = `matching the prescribed form`;
  if (!rule.pattern) return undecided(required, "The rule declares no pattern to match.");
  // Same distinction as present(): no entry means never assessed, not non-compliant.
  if (!field) return undecided(required, "Extraction returned no entry for this declaration.");

  const text = field.text?.trim() ?? "";
  if (text.length === 0) {
    return { verdict: "VIOLATION", measured: "absent", required };
  }

  let re: RegExp;
  try {
    // Patterns come from rule packs in this repo, not from user input — but a pack is edited
    // by hand in a browser, so a malformed one must fail as an open question rather than a
    // 500 on the route.
    re = new RegExp(rule.pattern, "iu");
  } catch {
    return undecided(required, `Rule ${rule.id} carries a pattern that is not valid.`);
  }

  return {
    verdict: re.test(text) ? "COMPLIANT" : "VIOLATION",
    measured: text,
    required,
  };
}

function inSet(rule: Rule, field: LabelField | undefined): Decision {
  const allowed = rule.allowed ?? [];
  const required = `one of: ${allowed.join(", ")}`;
  if (allowed.length === 0) return undecided(required, "The rule declares no allowed set.");

  const value = field?.value;
  const unit =
    value && typeof value === "object" && "unit" in value
      ? String(value.unit)
      : typeof value === "string"
        ? value
        : null;

  if (unit === null) {
    return undecided(required, "No unit was extracted from this declaration.");
  }

  const ok = allowed.some((a) => a.toLowerCase() === unit.toLowerCase());
  return { verdict: ok ? "COMPLIANT" : "VIOLATION", measured: unit, required };
}
