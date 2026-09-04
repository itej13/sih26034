/**
 * The one runnable check for the frozen contract.
 *
 * Every fixture must satisfy the Label Object Model, and every rule pack must use only the
 * agreed predicate vocabulary. Three people are building against these files at once, so
 * silent drift here is the expensive kind.
 *
 *     npm run check:contract
 */
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { UNASSESSABLE } from "../lib/evaluate.ts";

const FIELD_KEYS = new Set([
  "mrp", "net_qty", "mfg_date", "manufacturer", "consumer_care", "generic_name",
]);
const VERDICTS = new Set(["COMPLIANT", "VIOLATION", "INDETERMINATE"]);
const PREDICATES = new Set([
  "present", "matches", "in_set", "min_mm", "min_mm_lookup",
  "min_ratio", "clear_space", "contrast_min", "consistent_with",
]);

/**
 * What each predicate needs beyond the common fields, straight from packs/README.md. A
 * nested array means "at least one of these".
 *
 * Enforced only for predicates the evaluator actually implements. A rule whose predicate is
 * still in UNASSESSABLE has nothing to parameterise yet, and inventing a contrast threshold
 * to satisfy a checker would be inventing law. The day that predicate lands, deleting its
 * UNASSESSABLE entry turns this into a hard requirement automatically.
 */
const REQUIRED_FIELDS = {
  present: [],
  matches: [["pattern", "any_of"]],
  in_set: ["allowed"],
  min_mm: ["metric", "threshold"],
  min_mm_lookup: ["metric", "lookup_on", "table"],
  min_ratio: ["numerator", "denominator", "threshold"],
  clear_space: ["vertical_multiple", "horizontal_multiple"],
  contrast_min: ["threshold"],
  consistent_with: ["expression"],
};

// Adding a predicate to one list and not the other is exactly the drift this file exists to
// catch, so catch it here rather than in a pack review.
assert.deepEqual(
  new Set(Object.keys(REQUIRED_FIELDS)), PREDICATES,
  "REQUIRED_FIELDS and PREDICATES must describe the same vocabulary",
);

const isPoly = (p) =>
  Array.isArray(p) && p.length >= 3 &&
  p.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite));

let checked = 0;

for (const name of readdirSync("fixtures").filter((f) => f.endsWith(".json"))) {
  const s = JSON.parse(readFileSync(`fixtures/${name}`, "utf8"));
  const at = (m) => `${name}: ${m}`;

  for (const k of ["scan_id", "captured_at", "officer_id", "image_sha256", "rule_pack"]) {
    assert.equal(typeof s[k], "string", at(`${k} must be a string`));
  }
  assert.match(s.image_sha256, /^[0-9a-f]{64}$/, at("image_sha256 must be 64 hex chars"));
  assert.ok(VERDICTS.has(s.overall), at(`overall "${s.overall}" is not a verdict`));

  const c = s.calibration;
  assert.ok(c.mm_per_px > 0, at("mm_per_px must be positive"));
  assert.ok(c.uncertainty_mm_per_px >= 0, at("calibration uncertainty must not be negative"));
  assert.ok(isPoly(s.pdp.poly), at("pdp.poly is malformed"));

  for (const f of s.fields) {
    assert.ok(FIELD_KEYS.has(f.key), at(`unknown field key "${f.key}"`));
    assert.ok(isPoly(f.poly), at(`${f.key}.poly is malformed`));
    assert.ok(f.numeral_poly === null || isPoly(f.numeral_poly),
      at(`${f.key}.numeral_poly must be a polygon or null`));
    assert.ok(f.confidence >= 0 && f.confidence <= 1, at(`${f.key}.confidence out of range`));
    assert.equal(typeof f.corrected_by_officer, "boolean",
      at(`${f.key}.corrected_by_officer missing`));
  }

  for (const m of s.measurements) {
    assert.ok(FIELD_KEYS.has(m.field), at(`measurement on unknown field "${m.field}"`));
    assert.ok(m.value > 0, at(`${m.field} ${m.metric} must be positive`));
    // The whole project rests on this one: a measurement without an uncertainty is an
    // opinion, and a verdict computed from a bare point value is what we exist not to do.
    assert.ok(m.expanded_uncertainty_mm > 0,
      at(`${m.field} ${m.metric} has no expanded uncertainty`));
    assert.equal(m.k, 2, at(`${m.field} ${m.metric} must use k=2`));
  }

  for (const f of s.findings) {
    assert.ok(VERDICTS.has(f.verdict), at(`unknown verdict "${f.verdict}"`));
    assert.ok(f.rule_text?.length > 20, at(`rule ${f.rule_ref} has no quoted Gazette text`));
    assert.equal(f.rule_pack, s.rule_pack, at(`rule ${f.rule_ref} cites a different pack`));
  }

  // One verdict vocabulary, scan level and finding level. The rollup is worst-wins:
  // any violation makes the scan a violation; otherwise any indeterminate holds the whole
  // scan open. A scan is compliant only when nothing in it is not.
  const v = s.findings.map((f) => f.verdict);
  const rollup = v.includes("VIOLATION")
    ? "VIOLATION"
    : v.includes("INDETERMINATE")
      ? "INDETERMINATE"
      : "COMPLIANT";
  assert.equal(s.overall, rollup,
    at(`overall is "${s.overall}" but its findings roll up to "${rollup}"`));

  checked++;
}

for (const name of readdirSync("packs").filter((f) => f.endsWith(".json"))) {
  const p = JSON.parse(readFileSync(`packs/${name}`, "utf8"));
  const at = (m) => `${name}: ${m}`;
  assert.match(p.effective_from, /^\d{4}-\d{2}-\d{2}$/, at("effective_from must be YYYY-MM-DD"));
  const ids = new Set();
  for (const r of p.rules) {
    assert.ok(!ids.has(r.id), at(`duplicate rule id "${r.id}"`));
    ids.add(r.id);
    assert.ok(PREDICATES.has(r.predicate),
      at(`rule ${r.id} uses predicate "${r.predicate}", which the evaluator does not implement`));
    assert.ok(FIELD_KEYS.has(r.applies_to), at(`rule ${r.id} applies to unknown field`));
    assert.ok(r.rule_text?.length > 20, at(`rule ${r.id} must quote the Gazette verbatim`));
    assert.ok(r.message?.length > 0, at(`rule ${r.id} has no plain-English message`));
    if (!(r.predicate in UNASSESSABLE)) {
      for (const need of REQUIRED_FIELDS[r.predicate]) {
        const options = Array.isArray(need) ? need : [need];
        assert.ok(
          options.some((k) => r[k] !== undefined),
          at(`rule ${r.id} uses "${r.predicate}" but declares no ${options.join(" or ")}`),
        );
      }
    }
  }
  checked++;
}

console.log(`ok — ${checked} contract files valid`);
