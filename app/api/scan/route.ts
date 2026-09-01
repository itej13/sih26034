import { NextResponse } from "next/server";
import { allScans, sampleScan } from "@/lib/fixtures";

/**
 * Day 0 stand-in. Returns the frozen fixture so the frontend and the persistence layer
 * both have something real to build against before the vision pipeline exists.
 *
 * Day 2 (Tejas): POST calls /api/measure and the extraction model, assembles a real Label
 * Object Model, and returns that instead. The response SHAPE does not change — which is the
 * entire point of freezing it today.
 */

export async function GET() {
  return NextResponse.json({ scans: allScans });
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

  // Not yet processed. Returning the fixture keeps the contract honest rather than
  // pretending — the flag says so out loud so nobody demos this by accident.
  return NextResponse.json({ ...sampleScan, stub: true });
}
