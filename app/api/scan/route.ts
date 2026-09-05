import { NextResponse } from "next/server";
import { sampleScan } from "@/lib/fixtures";
import { listScans, repositoryMode, saveScan } from "@/lib/repository";

/**
 * Day 2 persistence boundary. Assembling a real Label Object Model from a photograph is a
 * separate piece of work (see lib/api.ts's runPipeline and the routes it calls); this route's
 * job is narrower — make whatever Label Object Model reaches it durable. Until the pipeline is
 * wired here, that model is still the frozen fixture, so what changes below is not the DATA
 * but what happens to it: a stub flag becomes a written row.
 *
 * X-Scan-Repository says which store actually answered — "supabase" when a real database
 * wrote or read the row, "fixture" when no database is configured and the frozen fixture
 * answered instead. Dropping that distinction would let a screen print unpersisted fixture
 * data as though it were filed evidence.
 */

export async function GET() {
  const scans = await listScans();
  return NextResponse.json({ scans }, { headers: { "X-Scan-Repository": repositoryMode() } });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Attach the photograph as an 'image' field." },
      { status: 400 },
    );
  }

  // sampleScan stands in for the Label Object Model a photograph will eventually produce
  // (see the header comment). saveScan() is what's new here: this now becomes a row rather
  // than a response with a "stub" flag bolted on.
  const saved = await saveScan(sampleScan);
  return NextResponse.json(saved, { headers: { "X-Scan-Repository": repositoryMode() } });
}
