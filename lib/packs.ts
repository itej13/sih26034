/**
 * The rule packs available to stage 5, as data rather than as filesystem reads — a bundled
 * import survives deployment tracing, a readFileSync of a repo path does not always.
 *
 * Adding a pack is two lines here plus the JSON file. When the second pack lands, the live
 * 2026 → 2021 swap becomes `packById` with a different id and nothing else changes.
 */

import lmpc20260701 from "@/packs/lmpc-2026-07-01.json";
import type { RulePack } from "./evaluate";

const PACKS = [lmpc20260701 as unknown as RulePack];

/** Newest effective_from wins, so a caller that names no pack gets current law. */
export const latestPack: RulePack = [...PACKS].sort((a, b) =>
  b.effective_from.localeCompare(a.effective_from),
)[0];

export function packById(id: string): RulePack | undefined {
  return PACKS.find((p) => p.pack === id);
}

export function packIds(): string[] {
  return PACKS.map((p) => p.pack);
}
