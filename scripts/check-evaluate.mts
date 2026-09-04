/**
 * The runnable check for stage 5.
 *
 * check-contract.mjs proves the fixtures have the right SHAPE. This proves the rule engine
 * reaches the right VERDICT over them — including the two cases that matter more than any
 * happy path: a measurement whose interval straddles the threshold must come back
 * INDETERMINATE, and a thing that was never measured must never come back a VIOLATION.
 *
 *     npm run check:evaluate
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluate, rollup } from "../lib/evaluate.ts";
import type { EvaluableScan, RulePack } from "../lib/evaluate.ts";

const pack = JSON.parse(
  readFileSync("packs/lmpc-2026-07-01.json", "utf8"),
) as RulePack;

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as EvaluableScan;

const byRef = (findings: { rule_ref: string; verdict: string }[], ref: string) =>
  findings.filter((f) => f.rule_ref === ref).map((f) => f.verdict);

// ---------------------------------------------------------------------------
// The two frozen fixtures
// ---------------------------------------------------------------------------

const sample = read("fixtures/scan.sample.json");
const sampleOut = evaluate(sample, pack);

assert.deepEqual(byRef(sampleOut.findings, "7(3)").sort(), ["COMPLIANT", "VIOLATION"],
  "sample: MRP height is 0.82 ± 0.10 against a 1 mm floor — a violation; the width ratio clears");
assert.deepEqual(byRef(sampleOut.findings, "7(2)"), ["INDETERMINATE"],
  "sample: net quantity 1.03 ± 0.14 straddles the 1 mm threshold and must stay open");
assert.deepEqual(byRef(sampleOut.findings, "6(2)"), ["COMPLIANT"],
  "sample: consumer care details are present");
assert.equal(sampleOut.overall, "VIOLATION", "sample: worst-wins rollup");

// Rule 8(1) is the one place the engine and the fixture disagree, and the engine is right.
// The fixture records a VIOLATION, but its own geometry does not support one: the "20% EXTRA"
// flash sits at x 402–520, y 318–352 while the net-quantity numeral is at x 286–330,
// y 394–418, so the flash is diagonally away from the declaration and outside the required
// rectangle on both axes. The fixture's finding was written by hand, not computed.
// Raised for the three of us rather than edited here — fixtures/ is the frozen contract.
assert.deepEqual(byRef(sampleOut.findings, "8(1)"), ["COMPLIANT"],
  "sample: the promotional flash does not intrude on the declaration's clear space");

const compliant = read("fixtures/scan.compliant.json");
const compliantOut = evaluate(compliant, pack);
assert.ok(
  compliantOut.findings.every((f) => f.verdict === "COMPLIANT"),
  "compliant fixture: every rule should pass",
);
assert.equal(compliantOut.overall, "COMPLIANT");

// ---------------------------------------------------------------------------
// Guard bands — the behaviour the project exists to get right
// ---------------------------------------------------------------------------

const base = structuredClone(compliant);
const heightRule = pack.rules.filter((r) => r.id === "r7-3-letter-height");
const onlyHeight: RulePack = { ...pack, rules: heightRule };
const mrpHeight = (s: EvaluableScan) =>
  s.measurements.find((m) => m.field === "mrp" && m.metric === "numeral_height_mm")!;

{
  const s = structuredClone(base);
  const m = mrpHeight(s);
  m.value = 1.02;
  m.expanded_uncertainty_mm = 0.15; // 0.87 … 1.17 — straddles 1 mm
  assert.equal(evaluate(s, onlyHeight).findings[0].verdict, "INDETERMINATE",
    "an interval straddling the threshold is never a verdict");
}

{
  const s = structuredClone(base);
  const m = mrpHeight(s);
  m.value = 0.5;
  m.expanded_uncertainty_mm = 0.05; // 0.45 … 0.55 — wholly below
  assert.equal(evaluate(s, onlyHeight).findings[0].verdict, "VIOLATION",
    "an interval wholly below the threshold is a violation");
}

{
  const s = structuredClone(base);
  s.measurements = s.measurements.filter(
    (m) => !(m.field === "mrp" && m.metric === "numeral_height_mm"),
  );
  assert.equal(evaluate(s, onlyHeight).findings[0].verdict, "INDETERMINATE",
    "a thing that was never measured is not an offence");
}

{
  // Low extractor confidence holds a violation open: the model chose which string was the
  // MRP, and a violation resting on an uncertain choice is an accusation we cannot support.
  const s = structuredClone(base);
  const m = mrpHeight(s);
  m.value = 0.5;
  m.expanded_uncertainty_mm = 0.05;
  const mrp = s.fields.find((f) => f.key === "mrp")!;
  mrp.confidence = 0.4;
  assert.equal(evaluate(s, onlyHeight).findings[0].verdict, "INDETERMINATE",
    "a violation on a low-confidence field is held open");

  mrp.corrected_by_officer = true;
  assert.equal(evaluate(s, onlyHeight).findings[0].verdict, "VIOLATION",
    "an officer confirming the field restores the violation");
}

{
  // Clear space, with print that genuinely intrudes: same row as the numeral, 10 px away
  // at 0.0412 mm/px — 0.41 mm against the 2 × 1.48 mm required.
  const s = structuredClone(compliant);
  s.other_print = [{ poly: [[340, 394], [420, 394], [420, 418], [340, 418]], note: "flash" }];
  const clearRule: RulePack = {
    ...pack,
    rules: pack.rules.filter((r) => r.id === "r8-1-clear-space"),
  };
  assert.equal(evaluate(s, clearRule).findings[0].verdict, "VIOLATION",
    "print beside the declaration inside the required space is a violation");
}

{
  // A rule the pipeline structurally cannot judge is reported, not folded into the verdict.
  // If this regresses, every scan goes INDETERMINATE forever the moment Rule 9(1)(b) enters
  // a pack — which would read on stage as caution and actually be a bug.
  // Built from one known rule rather than the whole pack, so the count below stays true as
  // Advik adds rules the pipeline cannot yet judge.
  const withUnassessable: RulePack = {
    ...pack,
    rules: [
      ...pack.rules.filter((r) => r.id === "r7-3-letter-height"),
      {
        id: "x-contrast",
        rule_ref: "9(1)(b)",
        rule_text:
          "numerals of the retail sale price and net quantity declaration shall be printed, painted or inscribed on the package in a colour that contrasts conspicuously with the background of the label;",
        applies_to: "mrp",
        predicate: "contrast_min",
        message: "The numerals do not contrast conspicuously with the background.",
      },
    ],
  };
  const out = evaluate(structuredClone(compliant), withUnassessable);
  assert.equal(out.not_assessed.length, 1, "the unjudgeable rule is reported");
  assert.equal(out.not_assessed[0].rule_ref, "9(1)(b)");
  assert.ok(out.not_assessed[0].reason.length > 20, "and it says why");
  assert.ok(
    out.findings.every((f) => f.rule_ref !== "9(1)(b)"),
    "it produces no finding, because no finding was reached",
  );
  assert.equal(out.overall, "COMPLIANT",
    "a check that never ran must not hold the whole scan open");
}

// ---------------------------------------------------------------------------
// Absence of evidence, for the textual predicates.
//
// A declaration the extractor returned NO entry for was never assessed, so it cannot be an
// offence. A declaration it DID locate and that came back empty is evidence of absence, and
// that one is. Both textual predicates must draw the line in the same place.
// ---------------------------------------------------------------------------

for (const predicate of ["present", "matches"] as const) {
  const rule = pack.rules.find((r) => r.predicate === predicate);
  assert.ok(rule, `the pack must carry a ${predicate} rule for this check to mean anything`);
  const only: RulePack = { ...pack, rules: [rule] };
  const key = rule.applies_to;

  assert.ok(
    compliant.fields.some((f) => f.key === key),
    `fixture must carry a ${key} field for the ${predicate} check`,
  );

  const blank = structuredClone(compliant);
  blank.fields = blank.fields.map((f) => (f.key === key ? { ...f, text: "" } : f));
  assert.equal(
    evaluate(blank, only).findings[0].verdict, "VIOLATION",
    `${predicate}: a located but empty ${key} is evidence of absence, so it is an offence`,
  );

  const missing = structuredClone(compliant);
  missing.fields = missing.fields.filter((f) => f.key !== key);
  assert.equal(
    evaluate(missing, only).findings[0].verdict, "INDETERMINATE",
    `${predicate}: ${key} was never extracted, so it must be held open, never accused`,
  );
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

assert.equal(rollup([{ verdict: "COMPLIANT" }, { verdict: "INDETERMINATE" }]), "INDETERMINATE");
assert.equal(rollup([{ verdict: "INDETERMINATE" }, { verdict: "VIOLATION" }]), "VIOLATION");
assert.equal(rollup([{ verdict: "COMPLIANT" }]), "COMPLIANT");

console.log(
  `ok — rule engine agrees with both fixtures over ${pack.rules.length} rules, guard bands hold`,
);
