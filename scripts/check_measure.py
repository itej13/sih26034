"""
The one runnable check for the metrology core. No framework, no fixtures directory.

Generates a marker, warps it by a known perspective, and asserts that rectify() recovers
the scale. If this fails, nothing downstream can be trusted — so run it before blaming the
camera, the lighting, or the model.

    python3 scripts/check_measure.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.measure import MARKER_MM, PX_PER_MARKER, NoMarker, rectify, squareness_residual  # noqa: E402


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


def main():
    expected = MARKER_MM / PX_PER_MARKER

    # 1. A flat-on photograph recovers the scale exactly.
    _, mm_per_px, residual = rectify(synthetic_photo())
    assert abs(mm_per_px - expected) < 1e-9, f"scale drifted: {mm_per_px} vs {expected}"
    assert residual < 0.01, f"a flat marker should be square, got residual {residual}"

    # 2. mm_per_px is a property of the card, not of how far away the phone was.
    for marker_px in (180, 300, 460):
        _, mm, _ = rectify(synthetic_photo(marker_px=marker_px))
        assert abs(mm - expected) < 1e-9, f"scale moved with camera distance at {marker_px}px"

    # 3. A tilted card raises the residual — this is the gate that catches a card that is
    #    not coplanar with the panel being measured, which is the project's worst failure.
    _, _, tilted = rectify(synthetic_photo(tilt=55))
    assert tilted > residual, "tilt must raise the squareness residual"

    # 4. No marker is an explicit failure, never a silent default.
    try:
        rectify(np.full((400, 400, 3), 235, np.uint8))
    except NoMarker:
        pass
    else:
        raise AssertionError("a frame with no marker must raise NoMarker")

    # 5. The residual is scale-free — it must not depend on marker size in pixels.
    a = squareness_residual(np.float32([[0, 0], [100, 0], [100, 100], [0, 100]]))
    b = squareness_residual(np.float32([[0, 0], [400, 0], [400, 400], [0, 400]]))
    assert abs(a - b) < 1e-9, "residual must be normalised by marker size"

    print(f"ok — {expected} mm per pixel, flat residual {residual:.5f}, tilted {tilted:.5f}")


if __name__ == "__main__":
    main()
