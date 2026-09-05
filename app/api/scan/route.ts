import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appendEvidence } from "@/lib/evidence";
import { sampleScan } from "@/lib/fixtures";
import { listScans, repositoryMode, saveScan } from "@/lib/repository";
import { storageMode, uploadScanImage } from "@/lib/storage";
import type { Scan } from "@/lib/types";

/**
 * Day 2 persistence boundary. Assembling a real Label Object Model from a photograph is a
 * separate piece of work (see lib/api.ts's runPipeline and the routes it calls); this route's
 * job is narrower — make whatever Label Object Model reaches it durable. It now takes that
 * model two ways: a multipart photo (the Day 0 stub path, still backed by sampleScan until a
 * caller sends a real image) or a JSON Scan body (what app/capture/page.tsx sends once
 * runPipeline has actually assembled one).
 *
 * X-Scan-Repository says which store actually answered — "supabase" when a real database wrote
 * or read the row, "fixture" when no database is configured and the frozen fixture answered
 * instead. X-Scan-Storage is the same distinction for the image bytes. Dropping either would let
 * a screen print unpersisted fixture data as though it were filed evidence.
 */

export async function GET() {
  const scans = await listScans();
  return NextResponse.json({ scans }, { headers: { "X-Scan-Repository": repositoryMode() } });
}

/**
 * Every persisted scan gets a freshly minted id, regardless of what arrived. Before this, a
 * POST always persisted sampleScan under its own fixed id (sc_0142); a second POST against a
 * real database then hit scans.scan_id's primary key. Deriving from the incoming scan's own id
 * (when the caller supplied one, e.g. runPipeline's "live_<ms>") keeps the id readable — the
 * random suffix is what actually guarantees two POSTs can never collide, and it deliberately
 * never reuses a fixture's id (the multipart path never passes sampleScan.scan_id in as a base).
 */
function mintScanId(baseId?: string): string {
  const base = baseId?.trim() || "sc";
  return `${base}_${randomUUID().slice(0, 8)}`;
}

function responseHeaders(): HeadersInit {
  return { "X-Scan-Repository": repositoryMode(), "X-Scan-Storage": storageMode() };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Scan | null;
    if (!body || typeof body.scan_id !== "string") {
      return NextResponse.json({ error: "Body must be a complete Scan object." }, { status: 400 });
    }
    const scan: Scan = { ...body, scan_id: mintScanId(body.scan_id) };
    const saved = await saveScan(scan);
    await appendEvidence(saved);
    return NextResponse.json(saved, { headers: responseHeaders() });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Attach the photograph as an 'image' field." },
      { status: 400 },
    );
  }

  // sampleScan stands in for the Label Object Model a photograph will eventually produce (see
  // the header comment). Its own image_url/image_sha256 are placeholders; uploadScanImage's
  // result — the real hash of the bytes that were actually attached — overwrites them below.
  const scanId = mintScanId();
  const upload = await uploadScanImage(image, scanId);
  const scan: Scan = { ...sampleScan, scan_id: scanId, image_url: upload.image_url, image_sha256: upload.image_sha256 };
  const saved = await saveScan(scan);
  await appendEvidence(saved);
  return NextResponse.json(saved, { headers: responseHeaders() });
}
