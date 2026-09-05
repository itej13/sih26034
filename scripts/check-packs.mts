/**
 * The runnable check for the rule-pack swap.
 *
 * lib/packs.ts is a Next.js module: its JSON imports go through the "@/" alias, which only
 * webpack/turbopack resolve, and Node's own ESM loader refuses a default JSON import without
 * an import attribute Next.js never emits. Plain Node cannot import lib/packs.ts as written
 * (verified: ERR_MODULE_NOT_FOUND on the alias, then ERR_IMPORT_ATTRIBUTE_MISSING on the
 * JSON). So this script registers a throwaway resolve/load hook — scoped to this process,
 * touching no other file — that teaches Node the same two things webpack already knows: where
 * "@/" points, and that a .json file is JSON. Everything after that is the real lib/packs.ts,
 * exercised for real, the same way check-evaluate.mts exercises lib/evaluate.ts for real.
 *
 *     node --experimental-strip-types scripts/check-packs.mts
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { evaluate } from "../lib/evaluate.ts";
import type { EvaluableScan, RulePack } from "../lib/evaluate.ts";

const root = pathToFileURL(`${process.cwd()}/`).href;

register(
  `data:text/javascript,
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";
   export async function resolve(specifier, context, next) {
     if (specifier.startsWith("@/")) {
       return next(${JSON.stringify(root)} + specifier.slice(2), context);
     }
     return next(specifier, context);
   }
   export async function load(url, context, next) {
     if (url.endsWith(".json")) {
       return {
         format: "json",
         source: readFileSync(fileURLToPath(url), "utf8"),
         shortCircuit: true,
       };
     }
     return next(url, context);
   }
  `,
  import.meta.url,
);

const { latestPack, packById, packIds } = (await import("../lib/packs.ts")) as {
  latestPack: RulePack;
  packById: (id: string) => RulePack | undefined;
  packIds: () => string[];
};

// ---------------------------------------------------------------------------
// Both packs load — through lib/packs.ts itself, not a parallel readFileSync that could drift
// from what the app actually registers.
// ---------------------------------------------------------------------------

const ids = packIds();
assert.equal(ids.length, 2, `expected exactly two registered packs, got ${ids.length}`);
assert.equal(new Set(ids).size, ids.length, "pack ids must be distinct");

const pack2026 = packById("lmpc@2026-07-01");
const pack2021 = packById("lmpc@2021-01-01");
assert.ok(pack2026, "packById must find the 2026 pack");
assert.ok(pack2021, "packById must find the 2021 pack");
assert.notEqual(pack2026.pack, pack2021.pack, "distinct ids");
assert.equal(pack2021.effective_from, "2021-01-01");

// latestPack picks the newest effective_from — the 2021 pack must never become the default,
// or a caller that names no pack silently starts judging under the old law.
assert.equal(latestPack.pack, "lmpc@2026-07-01", "the 2021 pack must not become the default");

// ---------------------------------------------------------------------------
// Invariant 4, made machine-checkable: every rule_text in the 2021 pack must be a string that
// already exists verbatim in the 2026 pack. Not paraphrased, not re-keyed — literally one of
// the same strings, because the only legitimate way to put a rule in an earlier pack is to
// copy one that already survived contract + lint in a later one.
// ---------------------------------------------------------------------------

const texts2026 = new Set(pack2026.rules.map((r) => r.rule_text));
for (const rule of pack2021.rules) {
  assert.ok(
    texts2026.has(rule.rule_text),
    `2021 rule ${rule.id} (${rule.rule_ref}) has rule_text with no byte-identical match in the 2026 pack`,
  );
}

// ---------------------------------------------------------------------------
// The two packs judge the same photograph traceably: every finding is stamped with the pack
// that produced it, so an evidence trail always says which law it was judged under. (No rule
// in the 2026 pack is sourceable, from text already in this repo, as a 2022+ addition — see
// the report — so the 9 rules themselves currently carry over unchanged; the difference below
// is the pack attribution, not yet a differing verdict.)
// ---------------------------------------------------------------------------

const sample = JSON.parse(readFileSync("fixtures/scan.sample.json", "utf8")) as EvaluableScan;
const out2026 = evaluate(sample, pack2026);
const out2021 = evaluate(sample, pack2021);

assert.notDeepEqual(
  out2026.findings, out2021.findings,
  "the two packs must produce different findings for the same scan",
);
assert.ok(out2026.findings.every((f) => f.rule_pack === "lmpc@2026-07-01"));
assert.ok(out2021.findings.every((f) => f.rule_pack === "lmpc@2021-01-01"));

// Attribution is the only difference today, so assert that outright rather than letting
// notDeepEqual above imply the stage swap already flips a verdict on screen — it does not.
// When a real 2021/2026 divergence is sourced from the Gazette this assertion fails, which is
// the point: it forces whoever sources it to come back here, and stops a green line being
// read as "the demo beat works".
assert.deepEqual(
  out2026.findings.map((f) => f.verdict),
  out2021.findings.map((f) => f.verdict),
  "verdicts still identical across packs — if this fails, a real 2021 divergence landed: update this check and the stage script",
);

console.log(
  `ok — both packs load through lib/packs.ts, ids are distinct, every 2021 rule_text is ` +
  `byte-identical to a 2026 one, and findings differ by pack attribution only ` +
  `(verdicts identical — the swap does not yet change a verdict on screen)`,
);
