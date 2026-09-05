/**
 * The evidence writer — one row per saved scan, appended to the hash chain.
 *
 * The chain itself is not this module's job. supabase/migrations/20260905120000_evidence_
 * chain_and_profiles.sql computes `row_hash` and `prev_hash` in a `before insert` trigger,
 * holding an advisory lock per `scan_id` so two concurrent inserts can't both claim the same
 * previous link. This module only ever sends the four columns the trigger doesn't own —
 * `scan_id`, `officer_id`, `image_sha256`, `payload_sha256` — and computes the last of those
 * over a canonical (key-order-independent) serialisation of the scan, so the same scan hashes
 * the same way on every machine and every run. Duplicating the chain math here would give the
 * evidence table two authors that can silently disagree; the database stays the only one.
 *
 * Follows lib/repository.ts's shape: a public function gated on repositoryMode(), an internal
 * one that takes a DbClient explicitly so selfCheck() can hand it an in-memory double, and a
 * demo() run through import.meta.main.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Scan } from "./types.ts";
import { repositoryMode, RepositoryError, type DbClient } from "./repository.ts";

// Same augmentation as lib/repository.ts — see that file's comment. Declaring it again here
// is safe: TypeScript merges identical ambient interface members across files.
declare global {
  interface ImportMeta {
    main?: boolean;
  }
}

/** Loaded lazily, same reason as lib/repository.ts's getDbClient: next/headers only resolves
 *  inside a Next.js request, and this module also has to run standalone under import.meta.main. */
async function getDbClient(): Promise<DbClient> {
  const { createClient } = await import("@/lib/supabase/server");
  return (await createClient()) as unknown as DbClient;
}

// ---------------------------------------------------------------------------
// Canonical JSON. "Canonical" means byte-stable: the same scan hashes the same regardless of
// the order its own keys happen to be in, because object key order is an accident of how the
// value was built (spread order, JSON.parse, whatever), not a fact about the scan.
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  // Arrays keep their own order — position is semantic there (polygon points, finding order).
  return value;
}

export function payloadSha256(scan: Scan): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(scan))).digest("hex");
}

// ---------------------------------------------------------------------------
// The write path.
// ---------------------------------------------------------------------------

async function writeEvidenceRow(db: DbClient, scan: Scan): Promise<void> {
  // Exactly these four columns. row_hash and prev_hash are absent on purpose: the trigger
  // overwrites whatever a client sends, so computing them here would be dead code that lies
  // about being load-bearing — see the migration's header comment.
  const row = {
    scan_id: scan.scan_id,
    officer_id: scan.officer_id,
    image_sha256: scan.image_sha256,
    payload_sha256: payloadSha256(scan),
  };
  const { error } = await db.from("evidence").insert([row]);
  if (error) throw new RepositoryError(`evidence insert failed: ${error.message}`);
}

/** One evidence row per saved scan. No-op when Supabase isn't configured — repositoryMode()
 *  "fixture" means saveScan() never filed anything either, so there is no chain to append to. */
export async function appendEvidence(scan: Scan): Promise<void> {
  if (repositoryMode() === "fixture") return;
  await writeEvidenceRow(await getDbClient(), scan);
}

// ---------------------------------------------------------------------------
// In-memory double + self-check.
// ---------------------------------------------------------------------------

// Named locally rather than imported: lib/repository.ts keeps its Row/DbFilter shapes private,
// exporting only DbClient. These mirror them structurally, just enough to satisfy DbClient.
interface StubResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}
interface StubFilter extends PromiseLike<StubResult> {
  eq(column: string, value: unknown): StubFilter;
  order(column: string, options: { ascending: boolean }): StubFilter;
}

function createCapturingDb(): { db: DbClient; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];
  const db: DbClient = {
    from(table) {
      return {
        insert(rows) {
          if (table === "evidence") inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
        select(): StubFilter {
          // appendEvidence only ever inserts — this branch exists to satisfy DbTable's shape,
          // never to be exercised.
          const filter: StubFilter = {
            eq: () => filter,
            order: () => filter,
            then(onFulfilled, onRejected) {
              return Promise.resolve<StubResult>({ data: null, error: null }).then(onFulfilled, onRejected);
            },
          };
          return filter;
        },
      };
    },
  };
  return { db, inserted };
}

/** Deep clone with every object's keys reversed, recursively. Exists only to prove the hash
 *  really is order-independent — a shallow reorder wouldn't touch nested objects like
 *  `calibration` or the entries inside `fields`. */
function reverseKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).reverse()) {
      out[key] = reverseKeysDeep(v);
    }
    return out;
  }
  return value;
}

const selfCheckScan: Scan = {
  scan_id: "sc_evidence_selfcheck",
  captured_at: "2026-09-05T09:00:00Z",
  officer_id: "off_selfcheck",
  image_url: "https://example.test/selfcheck.jpg",
  image_sha256: "0".repeat(64),
  gps: { lat: 28.6139, lon: 77.209 },
  calibration: {
    mode: "aruco_card",
    marker_mm: 40,
    mm_per_px: 0.12,
    uncertainty_mm_per_px: 0.002,
    squareness_residual: 0.01,
  },
  pdp: { poly: [[0, 0], [100, 0], [100, 50], [0, 50]], area_cm2: 42, confidence: 0.95 },
  fields: [
    {
      key: "mrp",
      text: "MRP ₹99",
      value: 99,
      poly: [[10, 10], [40, 10], [40, 20], [10, 20]],
      numeral_poly: [[30, 10], [40, 10], [40, 20], [30, 20]],
      confidence: 0.9,
      corrected_by_officer: false,
    },
  ],
  other_print: [{ poly: [[0, 0], [1, 0], [1, 1], [0, 1]], note: "batch code" }],
  measurements: [{ field: "mrp", metric: "numeral_height_mm", value: 1.2, expanded_uncertainty_mm: 0.15, k: 2 }],
  findings: [
    {
      rule_ref: "7(3)",
      verdict: "COMPLIANT",
      measured: "1.20 mm ± 0.15",
      required: "≥ 1 mm",
      rule_pack: "lmpc@2026-07-01",
      rule_text: "Selfcheck fixture text — never printed on a real report.",
      message: null,
    },
  ],
  rule_pack: "lmpc@2026-07-01",
  overall: "COMPLIANT",
};

/** Run directly: `node lib/evidence.ts`. */
export async function selfCheck(): Promise<void> {
  const first = payloadSha256(selfCheckScan);
  const second = payloadSha256(selfCheckScan);
  assert.equal(first, second, "hashing the same scan twice must produce the same payload_sha256");

  const reordered = reverseKeysDeep(selfCheckScan) as Scan;
  assert.equal(
    payloadSha256(reordered),
    first,
    "a scan with every object's keys reversed must hash identically — that is what canonical means",
  );

  const otherScan: Scan = { ...selfCheckScan, scan_id: "sc_evidence_selfcheck_2" };
  assert.notEqual(
    payloadSha256(otherScan),
    first,
    "two different scans must produce two different payload_sha256 values",
  );

  const { db, inserted } = createCapturingDb();
  await writeEvidenceRow(db, selfCheckScan);
  assert.equal(inserted.length, 1, "writing a scan must append exactly one evidence row");
  assert.deepEqual(
    Object.keys(inserted[0]).sort(),
    ["image_sha256", "officer_id", "payload_sha256", "scan_id"],
    "an evidence row must carry only scan_id/officer_id/image_sha256/payload_sha256",
  );
  assert.ok(
    !("row_hash" in inserted[0]) && !("prev_hash" in inserted[0]),
    "must never compute or send row_hash/prev_hash — the before-insert trigger owns the chain",
  );

  console.log(
    "ok — payload_sha256 is deterministic and key-order-independent, differs across scans, " +
      "and evidence rows never carry a client-computed row_hash/prev_hash",
  );
}

async function demo(): Promise<void> {
  await selfCheck();
}

if (import.meta.main) {
  await demo();
}
