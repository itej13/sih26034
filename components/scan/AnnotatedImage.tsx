import Image from "next/image";
import type { LabelField, Poly } from "@/lib/types";

const points = (poly: Poly) => poly.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * Overlay coordinate space, stated plainly because it is the thing that is easy to get wrong:
 *
 *   Poly is documented as RECTIFIED image pixels, and the only rectified image this app has is
 *   the fixture /public/fixtures/sample-pack.svg, which is exactly 560×600 — matching both the
 *   viewBox below and the 14/15 container. That path aligns exactly.
 *
 *   /result/live shows the ORIGINAL camera photograph, in raw camera pixels and an arbitrary
 *   aspect. Drawing these polygons over it does not merely misalign them; with no
 *   VISION_MODEL_API_KEY set, /api/extract answers from FixtureExtractionProvider, so the
 *   polygons are the sample packet's boxes regardless of what was photographed. Aligning them
 *   more carefully would only make a fabricated annotation land convincingly on an unfamiliar
 *   packet, which is exactly what invariant 5 forbids.
 *
 * So the overlay is drawn only when a caller supplies `fields`, and /result/live deliberately
 * supplies none.
 *
 * ponytail: the viewBox is fixed at the fixture's 560×600. The day the contract carries the
 * rectified image's dimensions (and the pipeline returns the rectified image), take the
 * viewBox from those and this component works for live captures too.
 */
export function AnnotatedImage({ fields, imageUrl, caption }: { fields?: LabelField[]; imageUrl: string; caption?: string }) {
  const annotated = fields !== undefined;

  return (
    <figure className="panel overflow-hidden">
      <div className={`relative bg-sunken ${annotated ? "aspect-[14/15]" : "flex max-h-[28rem] min-h-64 items-center justify-center"}`}>
        {annotated ? (
          <>
            <Image src={imageUrl} alt="Package label used for this inspection" fill unoptimized className="object-contain" />
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 560 600"
              preserveAspectRatio="xMidYMid meet"
              aria-label="Declaration and measured numeral annotations"
              role="img"
            >
              {fields.filter((field) => field.poly.length > 0).map((field) => (
                <g key={field.key}>
                  <polygon points={points(field.poly)} fill="rgba(23, 55, 110, 0.14)" stroke="#17376e" strokeWidth="3" />
                  <title>{`${field.key.replace("_", " ")} declaration`}</title>
                </g>
              ))}
              {fields.filter((field) => field.numeral_poly).map((field) => (
                <g key={`${field.key}-numeral`}>
                  <polygon points={points(field.numeral_poly!)} fill="rgba(154, 84, 6, 0.2)" stroke="#9a5406" strokeWidth="3" />
                  <title>{`${field.key.replace("_", " ")} exact numeral`}</title>
                </g>
              ))}
            </svg>
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded border border-brand/30 bg-surface px-2 py-1 text-brand shadow-sm">Declaration region</span>
              <span className="rounded border border-measure/30 bg-surface px-2 py-1 text-measure shadow-sm">Measured numeral</span>
            </div>
          </>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- a data: URL capture must not go through the optimizer */
          <img src={imageUrl} alt="Original capture used for this inspection" className="max-h-[28rem] w-full object-contain" />
        )}
      </div>
      <figcaption className="border-t border-line px-4 py-3 text-sm leading-6 text-ink-muted">
        {caption ?? "Rectified label image · polygons supplied by the extraction pipeline."}
      </figcaption>
    </figure>
  );
}
