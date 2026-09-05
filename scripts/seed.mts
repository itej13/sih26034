/**
 * The one-command demo seed — item 14 on the remaining-work list ("no way to put the demo
 * machine into a known good state"). Reads the fixture scans lib/fixtures.ts already exports
 * and files each one the same way the real pipeline would: saveScan() then appendEvidence().
 * Nothing here copies a fixture value — allScans is imported, not retyped, so this can never
 * drift from lib/fixtures.ts.
 *
 * Idempotent by "insert what's missing" rather than delete-then-insert. Delete-then-insert was
 * the other option the task offered, but it's a dead end against the real schema: supabase/
 * migrations/20260905120000_evidence_chain_and_profiles.sql's evidence_no_delete trigger makes
 * every evidence row permanent (`raise exception 'evidence is append-only...'` on ANY delete,
 * unconditionally), and 20260905090000_init.sql's `evidence.scan_id references scans (scan_id)`
 * carries no ON DELETE CASCADE — so once an evidence row exists for a scan (true after this
 * script's first successful run), Postgres refuses to delete that scans row too, full stop.
 * Checking existence first sidesteps that entirely: this script never deletes a scan or an
 * evidence row. scripts/reset.mts explains what it wipes instead.
 *
 *     node scripts/seed.mts
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { repositoryMode, saveScan, getScan, type RepositoryMode } from "../lib/repository.ts";
import { appendEvidence } from "../lib/evidence.ts";
import type { Scan } from "../lib/types.ts";

// Same hook as scripts/check-packs.mts for the alias + JSON parts — see that file's header for
// the full explanation. Extended with one thing check-packs.mts never needed: extension probing.
// lib/repository.ts and lib/evidence.ts both do `await import("@/lib/supabase/server")` with no
// extension — webpack/turbopack (Next's bundlers) resolve that by probing extensions, but plain
// Node's ESM loader requires an exact file and throws ERR_MODULE_NOT_FOUND on the bare path
// (verified: ERR_MODULE_NOT_FOUND on "lib/supabase/server" with check-packs.mts's un-extended
// hook). check-packs.mts never hits this because its own "@/" specifiers already carry a real
// extension (JSON filenames). Fixed here, not in lib/repository.ts or lib/evidence.ts — this
// hook is scripts/seed.mts's own code, not theirs, and the fix is scoped to this process only.
const root = pathToFileURL(`${process.cwd()}/`).href;
// The hook source is percent-encoded before it becomes a data: URL. Left raw, the URL parser
// truncates it at the first character it treats as structural, and Node then compiles a partial
// module and reports "Unexpected end of input" — a syntax error in code that is not malformed.
const HOOK_SOURCE = `
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";
   export async function resolve(specifier, context, next) {
     if (!specifier.startsWith("@/")) return next(specifier, context);
     const target = ${JSON.stringify(root)} + specifier.slice(2);
     for (const candidate of [target, target + ".ts", target + ".tsx", target + ".js"]) {
       try {
         return await next(candidate, context);
       } catch (err) {
         if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
       }
     }
     // Let Node raise its own ERR_MODULE_NOT_FOUND against the original bare path instead of
     // inventing a message here - same failure, same code, just after trying every extension.
     return next(target, context);
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
  `;

register(`data:text/javascript,${encodeURIComponent(HOOK_SOURCE)}`, import.meta.url);

const { allScans } = (await import("../lib/fixtures.ts")) as { allScans: Scan[] };

/** The ids scripts/reset.mts is allowed to touch — derived only from here, so a delete can
 *  never widen its own blast radius by drifting from what this script actually seeds. */
export const SEEDED_SCAN_IDS: readonly string[] = allScans.map((scan) => scan.scan_id);

function rowCounts(scan: Scan) {
  return {
    fields: scan.fields.length,
    measurements: scan.measurements.length,
    findings: scan.findings.length,
  };
}

/** Files every fixture scan that isn't already present. Exported so scripts/reset.mts can call
 *  the same routine after it wipes fields/measurements/findings, instead of a second copy that
 *  could drift from this one. */
export async function seed(): Promise<void> {
  const mode: RepositoryMode = repositoryMode();

  if (mode === "fixture") {
    console.log("[seed] mode=fixture (no Supabase env configured) — DRY RUN, nothing written");
    for (const scan of allScans) {
      const { fields, measurements, findings } = rowCounts(scan);
      console.log(
        `[seed]   would insert ${scan.scan_id} — fields=${fields} measurements=${measurements} findings=${findings}`,
      );
    }
    console.log(`[seed] done — mode=fixture, ${allScans.length} scan(s) would be seeded, 0 rows written`);
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const scan of allScans) {
    const existing = await getScan(scan.scan_id);
    if (existing) {
      skipped += 1;
      console.log(`[seed]   ${scan.scan_id} already present — skipped (idempotent)`);
      continue;
    }
    await saveScan(scan);
    await appendEvidence(scan);
    inserted += 1;
    const { fields, measurements, findings } = rowCounts(scan);
    console.log(
      `[seed]   inserted ${scan.scan_id} — fields=${fields} measurements=${measurements} findings=${findings}`,
    );
  }
  console.log(
    `[seed] done — mode=supabase, ${inserted} scan(s) inserted, ${skipped} already present, ${allScans.length} total`,
  );
}

if (import.meta.main) {
  await seed();
}
