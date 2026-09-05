"""
The runnable check for the metrology core. No framework, no fixtures directory.

    python3 scripts/check_measure.py

Two things are proven here, and one is deliberately not.

PROVEN — the geometry. Scale is recovered exactly from a marker, does not move with camera
distance, and a card tilted out of the panel's plane raises the squareness residual that
gates the whole pipeline.

PROVEN — the measurement survives perspective. Digits of a known physical height are drawn
on a synthetic pack, photographed at an angle, rectified, and measured back. The same
estimator supplies the ground truth on the flat master, so this isolates the error added by
perspective and rectification, which is exactly the stage under test.

Resolution ceiling worth knowing: PX_PER_MARKER fixes the rectified grid at 0.1 mm per
pixel, so a 0.5 mm numeral is five pixels tall however good the camera was. The measurement
still lands, but its uncertainty roughly triples and the answer becomes INDETERMINATE — which
is the correct behaviour, not a bug. Raise PX_PER_MARKER only if the source photographs
actually carry the detail to justify it.

NOT PROVEN — absolute agreement with a caliper on real packaging. That is Day 1's other half
and it needs the ground-truth sheet: glossy laminate, curved packs, and print that was never
as clean as cv2.putText.
"""

import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.measure import (  # noqa: E402
    MARKER_MM,
    MAX_SQUARENESS_RESIDUAL,
    MARKER_MM_REL_U,
    PX_PER_MARKER,
    NoMarker,
    _half_max_extent,
    _ink_mask,
    measure_numeral,
    measure_image_bytes,
    rectify,
    squareness_residual,
    to_rectified,
    verdict,
)

MASTER_PX_PER_MM = 20.0  # the flat master is drawn in millimetre space


def synthetic_photo(tilt=0.0, size=900, marker_px=300):
    """A marker on a light ground, optionally seen at an angle."""
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker = cv2.aruco.generateImageMarker(dictionary, 7, marker_px)
    canvas = np.full((size, size), 235, np.uint8)
    x = y = (size - marker_px) // 2
    canvas[y : y + marker_px, x : x + marker_px] = marker

    src = np.float32([[x, y], [x + marker_px, y],
                      [x + marker_px, y + marker_px], [x, y + marker_px]])
    # Keystone, not a uniform shrink: the top edge narrows while the bottom stays put, which
    # is what a card tilted away from the lens actually looks like.
    dst = src + np.float32([[tilt, 0], [-tilt, 0], [0, 0], [0, 0]])
    warped = cv2.warpPerspective(canvas, cv2.getPerspectiveTransform(src, dst), (size, size),
                                 borderValue=235)
    return cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)


def _font_scale_for(height_px, text, thickness):
    """Find the fontScale whose cap height is closest to height_px."""
    best, err = 1.0, 1e9
    for s in np.arange(0.2, 12.0, 0.02):
        h = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, float(s), thickness)[0][1]
        if abs(h - height_px) < err:
            best, err = float(s), abs(h - height_px)
    return best


def synthetic_pack(numeral_mm, text="45.00", light_on_dark=False, ink=35, ground=232,
                   marker_at=(6, 6), text_at=(12, 72)):
    """A flat master drawn in millimetre space: a 40 mm marker and digits of known height.

    Returns the master image, the digits' polygon in master pixels, and the true height of
    the drawn ink in millimetres — measured from the ink itself rather than from the font
    metrics, because line thickness and antialiasing move it by a pixel or two.
    """
    px_mm = MASTER_PX_PER_MM
    w, h = int(120 * px_mm), int(90 * px_mm)
    fg, bg = (ink, ground) if not light_on_dark else (ground, ink)
    canvas = np.full((h, w), bg, np.uint8)

    marker_px = int(MARKER_MM * px_mm)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker = cv2.aruco.generateImageMarker(dictionary, 7, marker_px)
    mx, my = int(marker_at[0] * px_mm), int(marker_at[1] * px_mm)
    canvas[my : my + marker_px, mx : mx + marker_px] = marker

    target_px = numeral_mm * px_mm
    thickness = max(1, int(round(target_px / 8)))
    scale = _font_scale_for(target_px, text, thickness)
    org = (int(text_at[0] * px_mm), int(text_at[1] * px_mm))
    cv2.putText(canvas, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, int(fg), thickness,
                cv2.LINE_AA)

    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
    pad = int(0.6 * px_mm)
    poly = [[org[0] - pad, org[1] - th - pad], [org[0] + tw + pad, org[1] - th - pad],
            [org[0] + tw + pad, org[1] + pad], [org[0] - pad, org[1] + pad]]

    colour = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)
    crop = colour[poly[0][1] : poly[2][1], poly[0][0] : poly[1][0]]
    mask, _ = _ink_mask(crop)
    true_mm = _half_max_extent(mask.sum(axis=1).astype(float)) / px_mm
    return colour, poly, true_mm


def photograph(master, tilt_px=0.0, camera_px_per_mm=10.0):
    """Simulate a camera: perspective, then a resize down to a realistic resolution."""
    h, w = master.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + np.float32([[tilt_px, 0], [-tilt_px, 0], [0, 0], [0, 0]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(master, M, (w, h), borderValue=(232, 232, 232))

    f = camera_px_per_mm / MASTER_PX_PER_MM
    photo = cv2.resize(warped, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    S = np.diag([f, f, 1.0]).astype(np.float64)
    return photo, S @ M  # master pixels -> photo pixels


def measure_through_pipeline(master, poly, tilt_px, camera_px_per_mm=10.0):
    photo, M = photograph(master, tilt_px, camera_px_per_mm)
    r = rectify(photo)
    poly_photo = cv2.perspectiveTransform(
        np.asarray(poly, np.float32).reshape(-1, 1, 2), M
    ).reshape(-1, 2)
    poly_rect = to_rectified(r["H"], poly_photo)
    # The scale budget is calculated from this image's marker-corner localisation.
    return measure_numeral(
        r["image"], poly_rect, r["mm_per_px"], r["uncertainty_mm_per_px"], r["squareness"]
    )


def main():
    expected = MARKER_MM / PX_PER_MARKER

    # --- 1. geometry --------------------------------------------------------
    flat = rectify(synthetic_photo())
    assert abs(flat["mm_per_px"] - expected) < 1e-9, "scale drifted"
    assert flat["squareness"] < 0.01, "a flat marker should be square"

    for marker_px in (180, 300, 460):
        r = rectify(synthetic_photo(marker_px=marker_px))
        assert abs(r["mm_per_px"] - expected) < 1e-9, "scale moved with camera distance"

    near = rectify(synthetic_photo(marker_px=180))["uncertainty_mm_per_px"]
    far = rectify(synthetic_photo(marker_px=460))["uncertainty_mm_per_px"]
    assert near > far > 0, "scale uncertainty must be derived from corner localisation"

    tilted = rectify(synthetic_photo(tilt=55))["squareness"]
    assert tilted > MAX_SQUARENESS_RESIDUAL, (
        f"a tilted card must FAIL the gate, not merely score higher than a flat one: "
        f"{tilted:.5f} against the {MAX_SQUARENESS_RESIDUAL} threshold"
    )

    # Shear is the half of "tilted" that edge lengths cannot see. A card sheared into a
    # rhombus keeps four equal edges however far it leans, so std(edges)/mean(edges) returned
    # exactly 0.00000 for a card at 10 degrees and the gate passed the very capture it exists
    # to reject — a wrong millimetre value with no error and full confidence on screen.
    def rhombus(degrees):
        a = math.radians(degrees)
        return np.float32([
            [0, 0],
            [400, 0],
            [400 + 400 * math.cos(a), 400 * math.sin(a)],
            [400 * math.cos(a), 400 * math.sin(a)],
        ])

    for degrees in (80, 60, 30, 10):
        sheared = squareness_residual(rhombus(degrees))
        assert sheared > MAX_SQUARENESS_RESIDUAL, (
            f"a card sheared to {degrees} degrees has four equal edges and must still fail "
            f"the gate, got {sheared:.5f}"
        )

    # ...while the corner jitter of an ordinary good capture must not trip it, or every
    # honest photograph returns INDETERMINATE and the tool is useless.
    jitter = squareness_residual(np.float32([[1, 0], [401, 2], [399, 401], [0, 400]]))
    assert jitter < MAX_SQUARENESS_RESIDUAL, f"a near-square must pass, got {jitter:.5f}"

    try:
        rectify(np.full((400, 400, 3), 235, np.uint8))
    except NoMarker:
        pass
    else:
        raise AssertionError("a frame with no marker must raise NoMarker")

    a = squareness_residual(np.float32([[0, 0], [100, 0], [100, 100], [0, 100]]))
    b = squareness_residual(np.float32([[0, 0], [400, 0], [400, 400], [0, 400]]))
    assert abs(a - b) < 1e-9, "residual must be normalised by marker size"

    # --- 2. measurement through the full pipeline ---------------------------
    for numeral_mm in (1.0, 2.0, 4.0):
        master, poly, true_mm = synthetic_pack(numeral_mm)
        for tilt in (0.0, 40.0):
            m = measure_through_pipeline(master, poly, tilt)
            err = abs(m["height_mm"] - true_mm)
            assert err < max(0.06, 0.05 * true_mm), (
                f"{numeral_mm} mm at tilt {tilt}: measured {m['height_mm']:.3f}, "
                f"true {true_mm:.3f}, error {err:.3f} mm"
            )
            assert m["expanded_uncertainty_mm"] > 0, "a measurement must carry an uncertainty"
            # The stated interval has to actually contain the truth, or the guard band is
            # decoration rather than a guarantee.
            assert err <= m["expanded_uncertainty_mm"], (
                f"{numeral_mm} mm at tilt {tilt}: error {err:.3f} exceeds the stated "
                f"±{m['expanded_uncertainty_mm']:.3f}"
            )

    # --- 2b. the card does not have to sit above and left of the declaration -
    # The rectified canvas used to keep the source's dimensions with the marker pinned at the
    # origin, so anything above or left of the card landed at a negative coordinate and fell
    # off it. A card placed below or right of the numerals failed with "numeral polygon is
    # too small to measure" — an undocumented capture rule wearing a measurement error's face.
    for label, marker_at, text_at in (
        ("card above-left of the declaration", (6, 6), (12, 72)),
        ("card below-right of the declaration", (74, 44), (8, 14)),
        ("card to the right of the declaration", (70, 35), (6, 40)),
    ):
        master, poly, true_mm = synthetic_pack(4.0, marker_at=marker_at, text_at=text_at)
        m = measure_through_pipeline(master, poly, 0.0)
        err = abs(m["height_mm"] - true_mm)
        assert err <= m["expanded_uncertainty_mm"], (
            f"{label}: measured {m['height_mm']:.3f} against true {true_mm:.3f}, outside the "
            f"stated ±{m['expanded_uncertainty_mm']:.3f}"
        )

    # --- 3. polarity: light text on dark packaging --------------------------
    master, poly, true_mm = synthetic_pack(2.0, light_on_dark=True)
    m = measure_through_pipeline(master, poly, 0.0)
    assert abs(m["height_mm"] - true_mm) < max(0.06, 0.05 * true_mm), (
        f"light-on-dark measured {m['height_mm']:.3f} against true {true_mm:.3f}"
    )

    # --- 4. width, for Rule 7(3)'s one-third clause -------------------------
    master, poly, _ = synthetic_pack(4.0, text="4500")
    m = measure_through_pipeline(master, poly, 0.0)
    assert m["width_mm"] is not None, "width must be measured for the ratio clause"
    assert 0.3 < m["width_mm"] / m["height_mm"] < 1.2, (
        f"implausible width-to-height ratio {m['width_mm'] / m['height_mm']:.2f}"
    )

    # The width carries its OWN uncertainty, not the height's. They are different lengths:
    # the scale and plane terms each scale with the dimension being measured, and the
    # threshold term is the spread of the width readings, which was being collected and then
    # thrown away. Rule 7(3)'s ratio clause is decided on this interval.
    master, poly, _ = synthetic_pack(4.0, text="4500")
    photo, transform = photograph(master, 0.0, camera_px_per_mm=10.0)
    calibrated = rectify(photo)
    poly_rect = to_rectified(calibrated["H"], cv2.perspectiveTransform(
        np.asarray(poly, np.float32).reshape(-1, 1, 2), transform).reshape(-1, 2))
    ok, encoded = cv2.imencode(".png", photo)
    assert ok, "synthetic photo must encode"
    both = measure_image_bytes(encoded.tobytes(), poly_rect.tolist(), "mrp")
    height = next(m for m in both["measurements"] if m["metric"] == "numeral_height_mm")
    width = next(m for m in both["measurements"] if m["metric"] == "numeral_width_mm")
    assert width["expanded_uncertainty_mm"] > 0, "a width without an uncertainty is an opinion"
    assert width["expanded_uncertainty_mm"] != height["expanded_uncertainty_mm"], (
        "the width must carry its own uncertainty budget, not be handed the height's"
    )
    assert width["value"] < height["value"], "these digits are taller than they are wide"
    assert width["expanded_uncertainty_mm"] < height["expanded_uncertainty_mm"], (
        f"a smaller dimension must earn a smaller budget: width "
        f"{width['value']:.2f}±{width['expanded_uncertainty_mm']:.3f} against height "
        f"{height['value']:.2f}±{height['expanded_uncertainty_mm']:.3f}"
    )

    # --- 5. the guard band --------------------------------------------------
    assert verdict(1.24, 0.12, 1.0) == "COMPLIANT"
    assert verdict(0.82, 0.10, 1.0) == "VIOLATION"
    assert verdict(1.03, 0.14, 1.0) == "INDETERMINATE"
    # A wide enough uncertainty must never produce a verdict, however far the point value sits.
    assert verdict(0.50, 0.60, 1.0) == "INDETERMINATE"

    # The HTTP entrypoint must carry the image-derived corner-localisation uncertainty.
    master, poly, _ = synthetic_pack(2.0)
    photo, transform = photograph(master, 0.0, camera_px_per_mm=10.0)
    calibrated = rectify(photo)
    poly_photo = cv2.perspectiveTransform(np.asarray(poly, np.float32).reshape(-1, 1, 2), transform).reshape(-1, 2)
    poly_rect = to_rectified(calibrated["H"], poly_photo)
    ok, encoded = cv2.imencode(".png", photo)
    assert ok, "synthetic photo must encode"
    entrypoint = measure_image_bytes(encoded.tobytes(), poly_rect.tolist(), "mrp")
    assert entrypoint["measurement_valid"] is True
    assert abs(entrypoint["calibration"]["uncertainty_mm_per_px"] - calibrated["uncertainty_mm_per_px"]) < 1e-12

    # ...and it must MEASURE with that uncertainty, not merely report it. Comparing the reported
    # metadata against a second rectify() says nothing about the value actually handed to
    # measure_numeral: with only that check in place, hardcoding the argument back to the historic
    # 0.0006 — or to 1e-9 — still passed this file.
    independent = measure_numeral(
        calibrated["image"], poly_rect, calibrated["mm_per_px"],
        calibrated["uncertainty_mm_per_px"], calibrated["squareness"],
    )
    reported = next(m for m in entrypoint["measurements"] if m["metric"] == "numeral_height_mm")
    assert abs(reported["expanded_uncertainty_mm"] - independent["expanded_uncertainty_mm"]) < 1e-9, (
        "the entrypoint's interval must follow from the calibration it reported, got "
        f"{reported['expanded_uncertainty_mm']:.6f} against "
        f"{independent['expanded_uncertainty_mm']:.6f}"
    )

    # However sharp the photograph, scale can never be known better than the printed card is.
    floor = calibrated["mm_per_px"] * MARKER_MM_REL_U
    assert calibrated["uncertainty_mm_per_px"] >= floor, (
        f"scale uncertainty {calibrated['uncertainty_mm_per_px']:.6f} fell below the card's own "
        f"tolerance {floor:.6f} — corner localisation cannot buy confidence the card lacks"
    )

    # A clearly undersized numeral must be called, not hedged.
    master, poly, true_mm = synthetic_pack(0.6)
    assert true_mm < 1.0, "the 0.6 mm case must actually render under the limit"
    m = measure_through_pipeline(master, poly, 0.0)
    assert verdict(m["height_mm"], m["expanded_uncertainty_mm"], 1.0) == "VIOLATION", (
        f"an undersized numeral should fail the 1 mm limit, got "
        f"{m['height_mm']:.3f} ± {m['expanded_uncertainty_mm']:.3f}"
    )

    # A numeral sitting on the limit must be held open rather than guessed either way.
    master, poly, true_mm = synthetic_pack(0.95)
    m = measure_through_pipeline(master, poly, 0.0)
    assert verdict(m["height_mm"], m["expanded_uncertainty_mm"], 1.0) == "INDETERMINATE", (
        f"a marginal numeral must not be decided, got "
        f"{m['height_mm']:.3f} ± {m['expanded_uncertainty_mm']:.3f}"
    )

    # The claim the whole project is sold on: never manufacture a violation. A compliant
    # numeral may come back INDETERMINATE, which costs an officer a re-scan — it may never
    # come back VIOLATION, which costs a manufacturer a notice.
    for target in (1.2, 2.0, 4.0):
        master, poly, true_mm = synthetic_pack(target)
        assert true_mm >= 1.0
        for tilt in (0.0, 40.0):
            m = measure_through_pipeline(master, poly, tilt)
            assert verdict(m["height_mm"], m["expanded_uncertainty_mm"], 1.0) != "VIOLATION", (
                f"false violation on a {true_mm:.2f} mm numeral at tilt {tilt}: "
                f"{m['height_mm']:.3f} ± {m['expanded_uncertainty_mm']:.3f}"
            )

    print(
        f"ok — {expected} mm/px; flat residual {flat['squareness']:.5f}, tilted {tilted:.5f}; "
        f"measurement within tolerance at 1, 2 and 4 mm, with and without perspective"
    )


if __name__ == "__main__":
    main()
