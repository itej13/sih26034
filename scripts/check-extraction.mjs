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
const { getExtractionProvider, mapExtraction, parseModelJson } = await import("../lib/extraction.ts");
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

// ---------------------------------------------------------------------------
// Provider selection: VISION_MODEL_API_KEY is the only switch, and it must never crash.
// ---------------------------------------------------------------------------

const originalKey = process.env.VISION_MODEL_API_KEY;
delete process.env.VISION_MODEL_API_KEY;
assert.equal(getExtractionProvider().mode, "fixture", "no key must select the fixture provider");

process.env.VISION_MODEL_API_KEY = "sk-test-not-a-real-credential";
assert.equal(getExtractionProvider().mode, "vlm", "a present key must select the VLM provider");

delete process.env.VISION_MODEL_API_KEY;
assert.equal(getExtractionProvider().mode, "fixture", "removing the key must fall back to the fixture provider again");
if (originalKey !== undefined) process.env.VISION_MODEL_API_KEY = originalKey;

console.log("ok — provider selection follows VISION_MODEL_API_KEY alone, in both directions");

// ---------------------------------------------------------------------------
// The mapping (invariant 1's actual enforcement point) — proved against a RECORDED response,
// never a live call. This stands in for a captured Anthropic Messages API response body: the
// envelope is real, the inner JSON is what a model would return if it ignored the prompt's
// instruction not to measure or judge. Three poison attempts are planted on purpose —
// numeral_height_mm, pdp.area_cm2, and a bare "overall" verdict — plus a field with no located
// poly, one with an unrecognised key, and one with no reported confidence. mapExtraction must
// turn this into a Label Object Model that contains none of the poison.
// ---------------------------------------------------------------------------

const recordedVlmResponse = {
  id: "msg_recorded_check",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        fields: [
          {
            key: "mrp",
            text: "MRP Rs 45.00 (incl. of all taxes)",
            value: 45,
            poly: [[210, 340], [398, 340], [398, 372], [210, 372]],
            numeral_poly: [[268, 342], [352, 342], [352, 370], [268, 370]],
            confidence: 0.93,
            numeral_height_mm: 0.82, // poison: a metrology number the mapper must strip
          },
          {
            key: "net_qty",
            text: "Net Qty. 100 g",
            value: { n: 100, unit: "g" },
            poly: [[210, 392], [372, 392], [372, 420], [210, 420]],
            numeral_poly: [[286, 394], [330, 394], [330, 418], [286, 418]],
            confidence: 0.95,
          },
          {
            key: "generic_name",
            text: "Roasted Almonds",
            value: null,
            poly: [[60, 280], [300, 280], [300, 320], [60, 320]],
            numeral_poly: null,
            // confidence deliberately omitted — proves the "no reported confidence -> 0" floor
          },
          {
            key: "consumer_care", // no poly located — must be dropped, never fabricated
            text: "Consumer care: care@acmefoods.in",
            value: null,
            confidence: 0.4,
          },
          {
            key: "batch_number", // not in the six-key vocabulary — must be dropped
            text: "B-2291",
            poly: [[60, 530], [200, 530], [200, 550], [60, 550]],
            confidence: 0.9,
          },
        ],
        pdp: {
          poly: [[40, 24], [340, 24], [340, 224], [40, 224]],
          confidence: 0.9,
          area_cm2: 214, // poison: a physical area extraction has no calibration to compute
        },
        other_print: [
          { poly: [[340, 424], [460, 424], [460, 454], [340, 454]], note: "20% EXTRA flash" },
          { poly: "not-a-polygon", note: "malformed — must be dropped" },
        ],
        overall: "VIOLATION", // poison: a bare verdict the model has no authority to issue
      }),
    },
  ],
};

const mapped = mapExtraction(parseModelJson(recordedVlmResponse));

const FIELD_KEYS = new Set(["mrp", "net_qty", "mfg_date", "manufacturer", "consumer_care", "generic_name"]);
const isPoly = (p) => Array.isArray(p) && p.length >= 3 && p.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite));

assert.deepEqual(Object.keys(mapped).sort(), ["fields", "other_print", "pdp"]);
assert.equal(mapped.fields.length, 3, "the poly-less field and the unrecognised key must both be dropped, not fabricated");
for (const f of mapped.fields) {
  assert.ok(FIELD_KEYS.has(f.key), `mapped field key "${f.key}" is outside the Label Object Model's vocabulary`);
  assert.ok(isPoly(f.poly), `${f.key}.poly is malformed`);
  assert.ok(f.numeral_poly === null || isPoly(f.numeral_poly), `${f.key}.numeral_poly must be a polygon or null`);
  assert.ok(f.confidence >= 0 && f.confidence <= 1, `${f.key}.confidence out of range`);
  assert.equal(f.corrected_by_officer, false, "the model never sets corrected_by_officer");
}

const genericName = mapped.fields.find((f) => f.key === "generic_name");
assert.equal(genericName.confidence, 0, "a field with no reported confidence must fall to the option that raises no violation, not a free pass");

assert.ok(isPoly(mapped.pdp.poly));
assert.equal(mapped.pdp.area_cm2, 0, "extraction has no calibration yet; it must not invent a physical area");
assert.equal(mapped.other_print.length, 1, "a malformed other_print polygon must be dropped, not fabricated");

const serialized = JSON.stringify(mapped);
assert.ok(!/_mm\b/.test(serialized), "a millimetre-shaped key leaked into the extraction response");
assert.ok(!serialized.includes("0.82"), "the planted millimetre VALUE leaked into the extraction response");
assert.ok(!serialized.includes("214"), "the planted physical area leaked into the extraction response");
for (const verdict of ["COMPLIANT", "VIOLATION", "INDETERMINATE"]) {
  assert.ok(!serialized.includes(verdict), `a bare verdict "${verdict}" leaked into the extraction response`);
}

console.log("ok — mapExtraction strips every planted measurement, area, and verdict from a recorded VLM response");
