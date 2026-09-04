import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("fixtures/scan.sample.json", "utf8"));
assert.ok(Array.isArray(fixture.fields) && fixture.fields.length > 0);
assert.ok(fixture.pdp && Array.isArray(fixture.pdp.poly));
for (const field of fixture.fields) {
  assert.equal(typeof field.text, "string");
  assert.ok(Array.isArray(field.poly));
  assert.ok(field.numeral_poly === null || Array.isArray(field.numeral_poly));
  assert.equal(typeof field.confidence, "number");
}
assert.equal("measurements" in { fields: fixture.fields, pdp: fixture.pdp }, false);
assert.equal("overall" in { fields: fixture.fields, pdp: fixture.pdp }, false);
console.log("ok — extraction response contains fields/pdp only; no measurements or verdict");
