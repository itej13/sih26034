"""
Day 1 spike, standalone. No web app, no model — a photograph in, millimetres out.

    # 1. see what the rectifier makes of the photo
    python3 scripts/spike.py packs/IMG_0021.jpg

    # 2. read a box off the saved rectified image, then measure it
    python3 scripts/spike.py packs/IMG_0021.jpg --box 268,342,84,28 --limit 1.0 --debug

The box is in RECTIFIED pixels, read off the *.rectified.png this writes — not off the
original photograph. At the default grid one pixel is 0.1 mm, so the box coordinates are
already millimetres divided by ten.

Compare every number this prints against the caliper. That comparison, on real packaging,
is the half of Day 1 that no synthetic test can stand in for.
"""

import argparse
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.measure import NoMarker, _crop, _deskew, _ink_mask, measure_numeral, rectify  # noqa: E402


def main():
    p = argparse.ArgumentParser(description="Measure a numeral on a packaged commodity.")
    p.add_argument("image", type=Path)
    p.add_argument("--box", help="x,y,w,h in rectified pixels")
    p.add_argument("--limit", type=float, default=1.0, help="legal minimum in mm")
    p.add_argument("--debug", action="store_true", help="also write the crop and ink mask")
    args = p.parse_args()

    img = cv2.imread(str(args.image))
    if img is None:
        sys.exit(f"cannot read {args.image}")

    try:
        r = rectify(img)
    except NoMarker as e:
        sys.exit(f"{e}  Lay the calibration card flat on the panel and reshoot.")

    out = args.image.with_suffix(".rectified.png")
    cv2.imwrite(str(out), r["image"])

    print(f"scale        {r['mm_per_px']:.4f} mm/px  (±{r['uncertainty_mm_per_px']:.6f} mm/px)")
    print(f"squareness   {r['squareness']:.4f}")
    if r["squareness"] > 0.05:
        print("             ^ the card is not flat against the panel. Reshoot before")
        print("               believing any millimetre value from this frame.")
    print(f"rectified    {out}")

    if not args.box:
        print("\nOpen that image, read the numeral's box, and rerun with --box x,y,w,h")
        return

    x, y, w, h = (int(v) for v in args.box.split(","))
    poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

    try:
        m = measure_numeral(
            r["image"], poly, r["mm_per_px"], r["uncertainty_mm_per_px"], r["squareness"]
        )
    except ValueError as e:
        sys.exit(f"could not measure: {e}")

    lo = m["height_mm"] - m["expanded_uncertainty_mm"]
    hi = m["height_mm"] + m["expanded_uncertainty_mm"]
    call = "COMPLIANT" if lo > args.limit else "VIOLATION" if hi < args.limit else "INDETERMINATE"

    print(f"\nheight       {m['height_mm']:.3f} ± {m['expanded_uncertainty_mm']:.3f} mm  (k=2)")
    if m["width_mm"]:
        ratio = m["width_mm"] / m["height_mm"]
        print(f"width        {m['width_mm']:.3f} mm   ratio {ratio:.2f}"
              f"   {'ok' if ratio >= 1 / 3 else 'BELOW one third — Rule 7(3)'}")
    print(f"limit        {args.limit:.2f} mm")
    print(f"interval     [{lo:.3f}, {hi:.3f}]")
    print(f"verdict      {call}")

    budget = ", ".join(f"{k} {v:.3f}" for k, v in m["components_mm"].items())
    print(f"budget (mm)  {budget}")
    if call == "INDETERMINATE":
        worst = max(m["components_mm"], key=m["components_mm"].get)
        print(f"             widest term is '{worst}' — that is what to attack for a decision")

    if args.debug:
        crop = _deskew(_crop(r["image"], poly))
        mask, level = _ink_mask(crop)
        cv2.imwrite(str(args.image.with_suffix(".crop.png")), crop)
        cv2.imwrite(str(args.image.with_suffix(".mask.png")), mask.astype("uint8") * 255)
        print(f"debug        wrote .crop.png and .mask.png (ink threshold {level:.0f})")


if __name__ == "__main__":
    main()
