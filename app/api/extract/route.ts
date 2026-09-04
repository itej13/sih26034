import { NextResponse } from "next/server";
import { getExtractionProvider } from "@/lib/extraction";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "Attach the photograph as an 'image' field." }, { status: 400 });
  const provider = getExtractionProvider();
  const result = await provider.extract(image);
  return NextResponse.json(result, { headers: { "X-Extraction-Provider": provider.mode } });
}
