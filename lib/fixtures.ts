import sample from "@/fixtures/scan.sample.json";
import compliant from "@/fixtures/scan.compliant.json";
import type { Scan } from "@/lib/types";

/**
 * Day 0 through Day 2, every screen reads from here rather than from the API.
 * Swap the import for a fetch once /api/scan returns real data — nothing else changes.
 */
export const sampleScan = sample as unknown as Scan;
export const compliantScan = compliant as unknown as Scan;
export const allScans: Scan[] = [sampleScan, compliantScan];

export function getScan(id: string): Scan | undefined {
  return allScans.find((s) => s.scan_id === id);
}
