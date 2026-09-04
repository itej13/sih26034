import sample from "@/fixtures/scan.sample.json";
import type { ExtractResponse } from "@/lib/api";

export interface ExtractionProvider {
  extract(image: File): Promise<ExtractResponse>;
  readonly mode: "fixture" | "vlm";
}

/** Explicit development adapter. Replace this provider only when a VLM is configured. */
export class FixtureExtractionProvider implements ExtractionProvider {
  readonly mode = "fixture" as const;
  async extract(_image: File): Promise<ExtractResponse> {
    return { fields: sample.fields, pdp: sample.pdp } as unknown as ExtractResponse;
  }
}

export function getExtractionProvider(): ExtractionProvider {
  // VISION_MODEL_API_KEY is intentionally not enough to pretend a provider exists; the
  // provider implementation and schema mapping must be added together by the extraction owner.
  return new FixtureExtractionProvider();
}
