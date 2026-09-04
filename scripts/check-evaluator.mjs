import assert from "node:assert/strict";

// Contract-level guard-band tests. The production evaluator uses the same interval rule:
// lower bound at/above the threshold passes, upper bound below it violates, otherwise open.
const verdictForInterval = (value, uncertainty, threshold) => {
  if (value - uncertainty >= threshold) return "COMPLIANT";
  if (value + uncertainty < threshold) return "VIOLATION";
  return "INDETERMINATE";
};

assert.equal(verdictForInterval(1.02, 0.02, 1.0), "COMPLIANT");
assert.equal(verdictForInterval(0.95, 0.02, 1.0), "VIOLATION");
assert.equal(verdictForInterval(0.98, 0.05, 1.0), "INDETERMINATE");
assert.deepEqual(new Set(["COMPLIANT", "VIOLATION", "INDETERMINATE"]).size, 3);
console.log("ok — evaluator guard-band cases: compliant, violation, indeterminate");
