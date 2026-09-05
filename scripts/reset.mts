/**
 * The one-command demo reset — wipe what can honestly be wiped, then reseed via scripts/seed.mts.
 *
 * "Wipe" is narrower than the task description, and on purpose. fields/measurements/findings
 * are ordinary child rows and come out cleanly. `scans` and `evidence` do not, by design:
 *
 *   - 20260905120000_evidence_chain_and_profiles.sql's evidence_no_delete trigger rejects every
 *     DELETE on `evidence` unconditionally — `raise exception 'evidence is append-only; % is
 *     not permitted', tg_op` fires for any row, any caller, no filter that avoids it. That's
 *     the point of an append-only chain backing a Section 63 certificate, not a gap to close.
 *   - 20260905090000_init.sql declares `evidence.scan_id references scans (scan_id)` with no
 *     ON DELETE CASCADE. Once an evidence row exists for a scan_id — true after the very first
 *     seed — Postgres refuses to delete that scans row too: a foreign-key violation, not a
 *     maybe.
 *
 * So this script never attempts either delete. It wipes findings, measurements and fields for
 * the seeded ids, then calls seed()'s own "insert what's missing" logic, which leaves the
 * (unwiped, unwipeable) scans/evidence rows alone and refiles the child rows the fixtures
 * describe — undoing exactly the kind of hand-edit the schema's own comment calls out
 * ("correcting a field after evidence is written deliberately breaks the chain hash"). That is
 * as close to "known good state" as the schema's invariants allow; see the task report for what
 * that means on stage day.
 *
 *     node scripts/reset.mts
 */
import assert from "node:assert/strict";
import { seed, SEEDED_SCAN_IDS } from "./seed.mts";
import { repositoryMode } from "../lib/repository.ts";

// Children of `scans` with no foreign keys to each other (see 20260905090000_init.sql — fields,
// measurements and findings each reference scans directly, never one another), so their
// relative order doesn't matter for FK safety. What matters is that none of this ever reaches
// `scans` or `evidence` — see the header.
const CHILD_TABLES = ["findings", "measurements", "fields"] as const;

/** Never issue a delete without an explicit, non-empty, known-seeded id list. This is the one
 *  guard standing between "wipe the demo data" and "wipe the table" — every id must come from
 *  SEEDED_SCAN_IDS (itself derived only from lib/fixtures.ts, see scripts/seed.mts), and this
 *  runs before any delete is even constructed, in both dry-run and real mode. */
function assertScopedToSeededIds(ids: readonly string[]): void {
  assert.ok(
    Array.isArray(ids) && ids.length > 0,
    "refusing to delete: empty id list — an unscoped delete must never be reachable from here",
  );
  for (const id of ids) {
    assert.ok(
      typeof id === "string" && id.length > 0 && SEEDED_SCAN_IDS.includes(id),
      `refusing to delete: "${String(id)}" is not one of the seeded ids — a delete must never widen past what seed.mts wrote`,
    );
  }
}

async function wipeChildRows(): Promise<void> {
  assertScopedToSeededIds(SEEDED_SCAN_IDS);

  if (repositoryMode() === "fixture") {
    console.log("[reset] mode=fixture (no Supabase env configured) — DRY RUN, nothing deleted");
    for (const table of CHILD_TABLES) {
      console.log(`[reset]   would delete from ${table} where scan_id in (${SEEDED_SCAN_IDS.join(", ")})`);
    }
    console.log("[reset]   scans/evidence rows are never deleted — see this file's header comment");
    return;
  }

  // lib/repository.ts exposes no delete and must not gain one — go straight to the real client,
  // as the task specifies, rather than through the repository's DbClient port.
  const { createClient } = await import("../lib/supabase/server.ts");
  const client = await createClient();
  for (const table of CHILD_TABLES) {
    const { error } = await client.from(table).delete().in("scan_id", SEEDED_SCAN_IDS as string[]);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    console.log(`[reset]   deleted from ${table} where scan_id in (${SEEDED_SCAN_IDS.join(", ")})`);
  }
}

export async function reset(): Promise<void> {
  await wipeChildRows();
  await seed();
  console.log(`[reset] done — mode=${repositoryMode()}`);
}

if (import.meta.main) {
  await reset();
}
