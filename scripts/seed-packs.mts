/**
 * Files the rule packs into the `rule_packs` table.
 *
 * This gap is easy to miss: `scans.rule_pack` and `findings.rule_pack` both carry a foreign key
 * to `rule_packs (pack_id)`, but nothing writes that table. `scripts/seed.mts` files scans and
 * evidence and never mentions it, and `rule_packs` has a SELECT policy and no INSERT policy — so
 * neither an officer nor the app can ever create a row. Against a real database every saveScan()
 * therefore fails on the foreign key before RLS is even consulted.
 *
 * Run once per environment, before scripts/seed.mts:
 *
 *     NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-packs.mts
 *
 * The service role key is required because of the missing INSERT policy, and it is read from the
 * environment rather than a file so it never lands in the repo. It bypasses RLS — do not wire
 * this into anything that serves a request.
 *
 * Idempotent: upserts on pack_id, so a re-run refreshes the stored pack rather than erroring.
 * The pack is read from packs/*.json and passed through untouched — rule_text reaches the
 * database byte-identical to the file, which is what invariant 4 is about.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Both are in the\nSupabase dashboard under Project Settings -> API.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const files = readdirSync("packs").filter((name) => name.endsWith(".json"));
if (files.length === 0) { console.error("No packs/*.json found."); process.exit(1); }

const rows = files.map((name) => {
  const pack = JSON.parse(readFileSync(`packs/${name}`, "utf8")) as {
    pack: string; effective_from: string; title: string; rules: unknown[];
  };
  return { pack_id: pack.pack, effective_from: pack.effective_from, title: pack.title, pack };
});

const { error } = await db.from("rule_packs").upsert(rows, { onConflict: "pack_id" });
if (error) { console.error(`rule_packs upsert failed: ${error.message}`); process.exit(1); }

// Read back and compare rule_text byte for byte, because "it inserted" and "the Gazette text
// survived the round trip" are different claims and only the second one matters here.
const { data, error: readError } = await db.from("rule_packs").select("pack_id, pack");
if (readError) { console.error(`read-back failed: ${readError.message}`); process.exit(1); }

for (const row of rows) {
  const stored = data?.find((candidate) => candidate.pack_id === row.pack_id);
  if (!stored) { console.error(`${row.pack_id} did not come back`); process.exit(1); }
  const before = row.pack.rules.map((rule) => (rule as { rule_text: string }).rule_text);
  const after = (stored.pack as { rules: { rule_text: string }[] }).rules.map((rule) => rule.rule_text);
  if (before.length !== after.length || before.some((text, index) => text !== after[index])) {
    console.error(`${row.pack_id}: rule_text did not survive the round trip`);
    process.exit(1);
  }
}

console.log(`ok — ${rows.length} rule pack${rows.length === 1 ? "" : "s"} filed (${rows.map((row) => row.pack_id).join(", ")}); every rule_text round-trips byte-identical`);
