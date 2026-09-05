/**
 * The scan repository — Day 2's persistence boundary.
 *
 * Everything above this file works in Label Object Models (`Scan`, from ./types.ts). Everything
 * below it is four Postgres tables that mirror that shape one-to-one — see
 * supabase/migrations/20260905090000_init.sql, which is the source of truth for column names.
 * This module is the only place that knows both languages; nothing else in the app should ever
 * import @/lib/supabase/server directly to touch scans/fields/measurements/findings.
 *
 * No Supabase project is guaranteed to exist wherever this runs (a judge's laptop, this dev
 * environment). repositoryMode() reports which store actually answered a given call, so a
 * caller — currently app/api/scan/route.ts — can put that in a response header rather than let
 * a screen print unpersisted fixture data as though it were filed evidence.
 *
 * The Postgres client is accessed through a small duck-typed port (DbClient below) rather than
 * the real `@supabase/supabase-js` types, for one reason: it lets selfCheck() below exercise the
 * exact insert/select code path against an in-memory double, with no network and no Python
 * process, from a plain `node lib/repository.ts`.
 */

import assert from "node:assert/strict";
import type {
  Calibration,
  FieldKey,
  Finding,
  LabelField,
  Measurement,
  OverallVerdict,
  Pdp,
  Poly,
  Scan,
  Verdict,
} from "./types.ts";

// @types/node here (20.19) predates Node's own `import.meta.main` (added 20.19+ at runtime) —
// this augments the ambient type rather than the runtime, so no package.json bump is needed.
declare global {
  interface ImportMeta {
    main?: boolean;
  }
}

export type RepositoryMode = "supabase" | "fixture";

export interface ScanSearchFilters {
  verdict?: Verdict;
  ruleRef?: string;
  capturedFrom?: string;
  capturedTo?: string;
  /** Free text over scan_id, manufacturer and generic_name — CONTRIBUTING's "brand and product". */
  q?: string;
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** True only when both public Supabase env vars are present — see .env.example. */
export function repositoryMode(): RepositoryMode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? "supabase"
    : "fixture";
}

// ---------------------------------------------------------------------------
// The port. Real supabase-js satisfies this structurally (its query builders are
// thenable and chain .eq()/.order()); the in-memory double below implements it directly.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
interface DbResult {
  data: Row[] | null;
  error: { message: string } | null;
}
interface DbFilter extends PromiseLike<DbResult> {
  eq(column: string, value: unknown): DbFilter;
  order(column: string, options: { ascending: boolean }): DbFilter;
}
interface DbTable {
  insert(rows: Row[]): PromiseLike<{ error: { message: string } | null }>;
  select(columns?: string): DbFilter;
}
export interface DbClient {
  from(table: string): DbTable;
}

/** Loaded lazily — next/headers only works inside a Next.js request, and this module must
 *  also run standalone (see the `import.meta.main` block) where that context doesn't exist. */
async function getDbClient(): Promise<DbClient> {
  const { createClient } = await import("@/lib/supabase/server");
  return (await createClient()) as unknown as DbClient;
}

// ---------------------------------------------------------------------------
// Row <-> Label Object Model. One field, one column. Nothing invented, nothing dropped —
// see supabase/migrations/20260905090000_init.sql for the columns this must match.
// ---------------------------------------------------------------------------

function scanToRow(scan: Scan): Row {
  return {
    scan_id: scan.scan_id,
    captured_at: scan.captured_at,
    officer_id: scan.officer_id,
    image_url: scan.image_url,
    image_sha256: scan.image_sha256,
    gps_lat: scan.gps?.lat ?? null,
    gps_lon: scan.gps?.lon ?? null,
    calibration: scan.calibration,
    pdp: scan.pdp,
    other_print: scan.other_print,
    rule_pack: scan.rule_pack,
    overall: scan.overall,
  };
}

function fieldToRow(scanId: string, field: LabelField): Row {
  return {
    scan_id: scanId,
    key: field.key,
    text: field.text,
    value: field.value,
    poly: field.poly,
    numeral_poly: field.numeral_poly,
    confidence: field.confidence,
    corrected_by_officer: field.corrected_by_officer,
  };
}

function measurementToRow(scanId: string, measurement: Measurement): Row {
  return {
    scan_id: scanId,
    field: measurement.field,
    metric: measurement.metric,
    value: measurement.value,
    expanded_uncertainty_mm: measurement.expanded_uncertainty_mm,
    k: measurement.k,
  };
}

function findingToRow(scanId: string, finding: Finding): Row {
  return {
    scan_id: scanId,
    rule_ref: finding.rule_ref,
    verdict: finding.verdict,
    measured: finding.measured,
    required: finding.required,
    rule_pack: finding.rule_pack,
    rule_text: finding.rule_text,
    message: finding.message,
  };
}

function rowToField(row: Row): LabelField {
  return {
    key: row.key as FieldKey,
    text: row.text as string,
    value: row.value as LabelField["value"],
    poly: row.poly as Poly,
    numeral_poly: row.numeral_poly as Poly | null,
    confidence: row.confidence as number,
    corrected_by_officer: row.corrected_by_officer as boolean,
  };
}

function rowToMeasurement(row: Row): Measurement {
  return {
    field: row.field as FieldKey,
    metric: row.metric as Measurement["metric"],
    value: row.value as number,
    expanded_uncertainty_mm: row.expanded_uncertainty_mm as number,
    k: row.k as 2,
  };
}

function rowToFinding(row: Row): Finding {
  return {
    rule_ref: row.rule_ref as string,
    verdict: row.verdict as Verdict,
    measured: row.measured as string,
    required: row.required as string,
    rule_pack: row.rule_pack as string,
    rule_text: row.rule_text as string,
    message: row.message as string | null,
  };
}

function rowToScan(scanRow: Row, fieldRows: Row[], measurementRows: Row[], findingRows: Row[]): Scan {
  return {
    scan_id: scanRow.scan_id as string,
    captured_at: scanRow.captured_at as string,
    officer_id: scanRow.officer_id as string,
    image_url: scanRow.image_url as string,
    image_sha256: scanRow.image_sha256 as string,
    gps:
      scanRow.gps_lat != null && scanRow.gps_lon != null
        ? { lat: scanRow.gps_lat as number, lon: scanRow.gps_lon as number }
        : null,
    calibration: scanRow.calibration as Calibration,
    pdp: scanRow.pdp as Pdp,
    fields: fieldRows.map(rowToField),
    other_print: scanRow.other_print as Scan["other_print"],
    measurements: measurementRows.map(rowToMeasurement),
    findings: findingRows.map(rowToFinding),
    rule_pack: scanRow.rule_pack as string,
    overall: scanRow.overall as OverallVerdict,
  };
}

// ---------------------------------------------------------------------------
// The persistence path. Takes a DbClient explicitly so selfCheck() can hand it the
// in-memory double — the public functions below are the only callers that reach for a
// real one.
// ---------------------------------------------------------------------------

function assertNoError(result: { error: { message: string } | null }, table: string, op: string): void {
  if (result.error) throw new RepositoryError(`${table} ${op} failed: ${result.error.message}`);
}

async function writeScan(db: DbClient, scan: Scan): Promise<void> {
  assertNoError(await db.from("scans").insert([scanToRow(scan)]), "scans", "insert");
  if (scan.fields.length > 0) {
    const rows = scan.fields.map((field) => fieldToRow(scan.scan_id, field));
    assertNoError(await db.from("fields").insert(rows), "fields", "insert");
  }
  if (scan.measurements.length > 0) {
    const rows = scan.measurements.map((measurement) => measurementToRow(scan.scan_id, measurement));
    assertNoError(await db.from("measurements").insert(rows), "measurements", "insert");
  }
  if (scan.findings.length > 0) {
    const rows = scan.findings.map((finding) => findingToRow(scan.scan_id, finding));
    assertNoError(await db.from("findings").insert(rows), "findings", "insert");
  }
}

async function readChildren(db: DbClient, table: string, scanId: string): Promise<Row[]> {
  const result = await db.from(table).select("*").eq("scan_id", scanId);
  assertNoError(result, table, "select");
  return result.data ?? [];
}

async function readScanById(db: DbClient, scanId: string): Promise<Scan | undefined> {
  const scanResult = await db.from("scans").select("*").eq("scan_id", scanId);
  assertNoError(scanResult, "scans", "select");
  const scanRow = scanResult.data?.[0];
  if (!scanRow) return undefined;

  const [fields, measurements, findings] = await Promise.all([
    readChildren(db, "fields", scanId),
    readChildren(db, "measurements", scanId),
    readChildren(db, "findings", scanId),
  ]);
  return rowToScan(scanRow, fields, measurements, findings);
}

/** N+1 by design — ponytail: fine at hackathon scale (dozens of scans, not millions);
 *  push child rows into one .in("scan_id", ids) query if listScans ever shows up in a profile. */
async function readAllScans(db: DbClient): Promise<Scan[]> {
  const scanResult = await db.from("scans").select("*").order("captured_at", { ascending: false });
  assertNoError(scanResult, "scans", "select");
  const scanRows = scanResult.data ?? [];
  return Promise.all(
    scanRows.map(async (scanRow) => {
      const scanId = scanRow.scan_id as string;
      const [fields, measurements, findings] = await Promise.all([
        readChildren(db, "fields", scanId),
        readChildren(db, "measurements", scanId),
        readChildren(db, "findings", scanId),
      ]);
      return rowToScan(scanRow, fields, measurements, findings);
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** No Supabase configured: nothing was written. The scan is returned unchanged so a caller
 *  can still show it, but repositoryMode() — not this return value — is what says whether it
 *  was actually filed. See the header comment; this is the "don't lie about persistence" rule. */
export async function saveScan(scan: Scan): Promise<Scan> {
  if (repositoryMode() === "fixture") return scan;
  await writeScan(await getDbClient(), scan);
  return scan;
}

export async function getScan(scanId: string): Promise<Scan | undefined> {
  if (repositoryMode() === "fixture") {
    const fixtures = await import("@/lib/fixtures");
    return fixtures.getScan(scanId);
  }
  return readScanById(await getDbClient(), scanId);
}

export async function listScans(): Promise<Scan[]> {
  if (repositoryMode() === "fixture") {
    const fixtures = await import("@/lib/fixtures");
    return fixtures.allScans;
  }
  return readAllScans(await getDbClient());
}

function matchesFilters(scan: Scan, filters: ScanSearchFilters): boolean {
  if (filters.verdict && scan.overall !== filters.verdict) return false;
  if (filters.ruleRef && !scan.findings.some((finding) => finding.rule_ref === filters.ruleRef)) return false;
  if (filters.capturedFrom && scan.captured_at < filters.capturedFrom) return false;
  if (filters.capturedTo && scan.captured_at > filters.capturedTo) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      scan.scan_id,
      ...scan.fields.filter((field) => field.key === "manufacturer" || field.key === "generic_name").map((field) => field.text),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** CONTRIBUTING's Day 3 ask ("filter by date, verdict, brand and rule; full-text over
 *  manufacturer and product name") filtered in JS over listScans() rather than pushed into
 *  SQL — ponytail: fine at this scale, and it's the same code whether the source was
 *  Supabase or the fixture fallback. */
export async function searchScans(filters: ScanSearchFilters): Promise<Scan[]> {
  const scans = await listScans();
  return scans.filter((scan) => matchesFilters(scan, filters));
}

// ---------------------------------------------------------------------------
// In-memory double + self-check. Proves the row mapping round-trips without a database —
// see the sabotage note in the PR description for how this was verified to actually fail
// when the mapping breaks.
// ---------------------------------------------------------------------------

function makeFilter(rows: Row[]): DbFilter {
  const filter: DbFilter = {
    eq(column, value) {
      return makeFilter(rows.filter((row) => row[column] === value));
    },
    order(column, { ascending }) {
      const sorted = [...rows].sort((a, b) => {
        const left = String(a[column]);
        const right = String(b[column]);
        return left < right ? -1 : left > right ? 1 : 0;
      });
      return makeFilter(ascending ? sorted : sorted.reverse());
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve<DbResult>({ data: rows, error: null }).then(onFulfilled, onRejected);
    },
  };
  return filter;
}

function createInMemoryDb(): DbClient {
  const tables = new Map<string, Row[]>();
  const rowsFor = (table: string): Row[] => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };
  return {
    from(table) {
      return {
        insert(rows) {
          rowsFor(table).push(...rows);
          return Promise.resolve({ error: null });
        },
        select() {
          return makeFilter([...rowsFor(table)]);
        },
      };
    },
  };
}

const selfCheckScan: Scan = {
  scan_id: "sc_selfcheck",
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

/** Exercises the exact insert/select code the real Supabase path runs, against an in-memory
 *  double instead of a live database. Run directly: `node lib/repository.ts`. */
export async function selfCheck(): Promise<void> {
  const db = createInMemoryDb();

  await writeScan(db, selfCheckScan);
  const roundTripped = await readScanById(db, selfCheckScan.scan_id);
  assert.ok(roundTripped, "a saved scan must read back by id");
  assert.deepEqual(
    roundTripped,
    selfCheckScan,
    "round-tripped scan must equal what was saved — a dropped column here is a dropped legal record",
  );

  const listed = await readAllScans(db);
  assert.equal(listed.length, 1, "listScans must see the scan that was just saved");
  assert.deepEqual(listed[0], selfCheckScan, "the listed scan must match the saved scan exactly");

  console.log("ok — repository round-trips scans/fields/measurements/findings through the in-memory double");
}

async function demo(): Promise<void> {
  await selfCheck();
}

if (import.meta.main) {
  await demo();
}
