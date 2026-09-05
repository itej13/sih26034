import sample from "../fixtures/scan.sample.json" with { type: "json" };
import type { ExtractResponse } from "@/lib/api";
import type { FieldKey, LabelField, Pdp, Poly, Scan } from "@/lib/types";

export interface ExtractionProvider {
  extract(image: File): Promise<ExtractResponse>;
  readonly mode: "fixture" | "vlm";
}

/** Explicit development adapter. Replace this provider only when a VLM is configured. */
export class FixtureExtractionProvider implements ExtractionProvider {
  readonly mode = "fixture" as const;
  async extract(_image: File): Promise<ExtractResponse> {
    return { fields: sample.fields, pdp: sample.pdp, other_print: sample.other_print } as unknown as ExtractResponse;
  }
}

const FIELD_KEYS = new Set<FieldKey>([
  "mrp", "net_qty", "mfg_date", "manufacturer", "consumer_care", "generic_name",
]);

/** Same shape rule scripts/check-contract.mjs enforces on every fixture. */
function isPoly(value: unknown): value is Poly {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (pt) => Array.isArray(pt) && pt.length === 2 && pt.every((n) => typeof n === "number" && Number.isFinite(n)),
    )
  );
}

/** No reported confidence is the least trust a field can have, never the most. */
function clampConfidence(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}

/**
 * The declared value a label prints — a price, a quantity, a date — read off the packaging
 * text. This is OCR, not metrology: `mrp`'s 45 is what the pack SAYS it costs, not a length
 * OpenCV measured, so the model may report it. What must never happen is a physical unit
 * sneaking in here; the per-key shape below is the fence, and anything that doesn't fit one
 * of these three shapes collapses to null rather than being passed through.
 */
function sanitizeValue(key: FieldKey, raw: unknown): LabelField["value"] {
  if (key === "mrp") {
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (key === "net_qty") {
    if (raw && typeof raw === "object" && "n" in raw && "unit" in raw) {
      const { n, unit } = raw as { n: unknown; unit: unknown };
      if (typeof n === "number" && Number.isFinite(n) && n >= 0 && typeof unit === "string") return { n, unit };
    }
    return null;
  }
  if (key === "mfg_date") {
    return typeof raw === "string" ? raw : null;
  }
  return null; // manufacturer, consumer_care, generic_name carry their reading in `text`
}

interface RawField {
  key?: unknown;
  text?: unknown;
  value?: unknown;
  poly?: unknown;
  numeral_poly?: unknown;
  confidence?: unknown;
}

/**
 * Whitelist construction, not a spread. Every property of the returned object is named and
 * validated here; anything the model's JSON carries beyond these — a stray `numeral_height_mm`,
 * a `verdict`, whatever a prompt-injected or malformed response might add — has nowhere to
 * attach and is discarded by construction rather than by a denylist that has to keep up with
 * every new way a model could misbehave.
 *
 * Returns null when the field cannot be placed: an unrecognised key, or no located poly. A
 * declaration extraction did not find is absent evidence, not a field with a guessed box.
 */
function mapField(raw: RawField): LabelField | null {
  const key = raw.key;
  if (typeof key !== "string" || !FIELD_KEYS.has(key as FieldKey)) return null;
  if (!isPoly(raw.poly)) return null;

  return {
    key: key as FieldKey,
    text: typeof raw.text === "string" ? raw.text : "",
    value: sanitizeValue(key as FieldKey, raw.value),
    poly: raw.poly,
    // Enum-shaped judgement in disguise: a numeral box the model was not confident about is
    // worse than no box at all, because a wrong box measures something that isn't the numeral.
    // Falling to null means the rule engine sees "not measured" and returns INDETERMINATE,
    // never a fabricated VIOLATION off a bad crop.
    numeral_poly: isPoly(raw.numeral_poly) ? raw.numeral_poly : null,
    confidence: clampConfidence(raw.confidence),
    // Only an officer's own correction sets this. The model never gets to mark itself trusted.
    corrected_by_officer: false,
  };
}

interface RawPdp {
  poly?: unknown;
  confidence?: unknown;
}

function mapPdp(raw: RawPdp | undefined): Pdp {
  if (!raw || !isPoly(raw.poly)) {
    throw new Error("Vision model response did not locate a principal display panel.");
  }
  return {
    poly: raw.poly,
    // area_cm2 needs mm_per_px, and extraction runs with no calibration in hand — that
    // arrives at the measurement stage. 0 marks "not measured", never an invented figure.
    area_cm2: 0,
    confidence: clampConfidence(raw.confidence),
  };
}

function mapOtherPrint(raw: unknown): Scan["other_print"] {
  if (!Array.isArray(raw)) return [];
  const out: Scan["other_print"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { poly, note } = entry as { poly?: unknown; note?: unknown };
    if (!isPoly(poly)) continue;
    out.push(typeof note === "string" ? { poly, note } : { poly });
  }
  return out;
}

/**
 * Pure mapping from the model's raw JSON to the Label Object Model. Kept separate from the
 * network call so the mapping — the part invariant 1 is actually about — can be exercised
 * against a recorded response in scripts/check-extraction.mjs without a live API key.
 */
export function mapExtraction(raw: unknown): ExtractResponse {
  const body = (raw ?? {}) as { fields?: unknown; pdp?: unknown; other_print?: unknown };
  const fields = Array.isArray(body.fields)
    ? body.fields.map((f) => mapField(f as RawField)).filter((f): f is LabelField => f !== null)
    : [];
  return { fields, pdp: mapPdp(body.pdp as RawPdp | undefined), other_print: mapOtherPrint(body.other_print) };
}

/** Unwraps the Anthropic Messages API envelope down to the JSON the prompt asked the model for. */
export function parseModelJson(body: unknown): unknown {
  const content = (body as { content?: { type?: string; text?: string }[] } | undefined)?.content;
  const text = content?.find((block) => block?.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Vision model response carried no text content.");
  return JSON.parse(text);
}

/**
 * Told explicitly, and repeatedly, not to measure or judge — the mapper above is the actual
 * enforcement, but a model that never sees the instruction is more likely to try.
 */
const EXTRACTION_PROMPT = `You are reading a photograph of a packaged commodity's label for a Legal Metrology inspection tool.

Identify these declarations if present: mrp, net_qty, mfg_date, manufacturer, consumer_care, generic_name.
For each one found, report:
- key: one of the six names above, exactly.
- text: the declaration exactly as printed, including symbols and units.
- value: the reading only — mrp as a plain number (e.g. 45), net_qty as {"n": 100, "unit": "g"}, mfg_date as a string, others null.
- poly: a 4-point bounding box [[x,y],...] clockwise from top-left, in this image's pixel coordinates, around the whole declaration.
- numeral_poly: the same shape, but tight around only the numeral/digits inside the declaration (e.g. "45.00", not "MRP Rs 45.00"). Omit or null it if you are not confident of a tight box.
- confidence: your confidence in this reading, 0 to 1.

Also report:
- pdp: {"poly": [...], "confidence": 0-1} — the principal display panel's boundary.
- other_print: an array of {"poly": [...], "note": "..."} for other printed regions near the declarations (promotional flashes, other text), used only to check clear space.

Reply with exactly one JSON object with keys "fields" (array), "pdp", and "other_print" (array). No other text.

You are a reader, not a ruler: never report a measurement in millimetres, a physical length or area, a legal threshold, or a compliance verdict (COMPLIANT/VIOLATION/INDETERMINATE) — those come from calibrated image measurement and a rule pack, not from you. Report only text, classification, pixel location, and your own confidence.`;

/** hosted vision-language model. Anthropic Messages API — see .env.example for the key name. */
export class VlmExtractionProvider implements ExtractionProvider {
  readonly mode = "vlm" as const;
  private readonly apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extract(image: File): Promise<ExtractResponse> {
    const data = Buffer.from(await image.arrayBuffer()).toString("base64");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              { type: "image", source: { type: "base64", media_type: image.type || "image/jpeg", data } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Vision model request failed: ${response.status} ${await response.text().catch(() => "")}`);
    }
    return mapExtraction(parseModelJson(await response.json()));
  }
}

export function getExtractionProvider(): ExtractionProvider {
  // VISION_MODEL_API_KEY is intentionally not enough to pretend a provider exists beyond
  // this: without it we fall back rather than crash, and with it we select a provider whose
  // mapping still holds every invariant above regardless of what the model sends back.
  const apiKey = process.env.VISION_MODEL_API_KEY;
  return apiKey ? new VlmExtractionProvider(apiKey) : new FixtureExtractionProvider();
}
