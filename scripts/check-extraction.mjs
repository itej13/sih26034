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

/**
 * The contract that matters here isn't the fixture's shape (checked above) — it's that the
 * extraction PROVIDER hands the rule engine fields/pdp/other_print and nothing else. The
 * previous version built a `{ fields, pdp }` object literal and then asked whether IT had a
 * "measurements" key — true by construction whatever the provider does, so it could never
 * fail. This calls the real provider, so a provider that started leaking measurements,
 * findings or a verdict would actually fail here.
 */
const { getExtractionProvider } = await import("../lib/extraction.ts");
const stubFile = new File(["stub"], "stub.jpg", { type: "image/jpeg" });
const response = await getExtractionProvider().extract(stubFile);

assert.deepEqual(
  Object.keys(response).sort(),
  ["fields", "other_print", "pdp"],
  "extraction response must carry exactly fields/pdp/other_print",
);
assert.ok(!("measurements" in response), "extraction must not leak measurements — that is the measure stage's job");
assert.ok(!("findings" in response), "extraction must not leak findings — that is the evaluate stage's job");
assert.ok(!("overall" in response), "extraction must not leak a verdict — that is the evaluate stage's job");

console.log("ok — extraction provider response contains fields/pdp/other_print only; no measurements, findings, or verdict");
