"""
Day 0 skeleton for the metrology core. Deployed as a Vercel Python function at /api/measure.

The purpose of this file on Day 0 is to prove the Python runtime and OpenCV deploy at all —
that is the riskiest piece of infrastructure in the project and the worst one to discover on
Day 5. The measurement itself is Day 1's spike (Tejas).

WHAT THIS FILE IS FOR
    Recovering real-world scale from a photograph, and measuring a glyph in millimetres.
    A camera maps a flat surface onto the image through a homography, which four point
    correspondences determine uniquely. The four corners of a printed ArUco marker whose
    true edge length we measured once with a caliper are those correspondences. Warp by
    that homography and one pixel becomes a known number of millimetres everywhere on the
    marker's plane.

THE ASSUMPTION THAT CAN SILENTLY BREAK EVERYTHING
    The homography is valid only for points on the marker's plane. Text on a curved bottle,
    or a card lying on the table beside a standing pack, is on a different plane and the
    scale applied to it is wrong — with no error, no exception, and a confident number on
    screen. squareness_residual() below is the cheap proxy for that; anything failing it
    must return INDETERMINATE rather than a value.
"""

import json
from http.server import BaseHTTPRequestHandler

import cv2
import numpy as np

# Measured once with the caliper on the printed, laminated card. If the cards are
# reprinted at a different scale this constant changes and every past scan is stale.
MARKER_MM = 40.0
# Rectified resolution for the marker. Sets mm_per_px: 400 px / 40 mm = 0.1 mm per pixel,
# so a 1 mm numeral is 10 px tall. Raising this does not create detail the source lacks.
PX_PER_MARKER = 400

_DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)


class NoMarker(Exception):
    """Preflight failure. Fail here, fast, before anything else runs."""


def rectify(img):
    """Detect the marker and return (rectified image, mm_per_px, squareness residual)."""
    detector = cv2.aruco.ArucoDetector(_DICT)
    corners, ids, _ = detector.detectMarkers(img)
    if ids is None or len(corners) == 0:
        raise NoMarker("No calibration marker found in frame.")

    src = corners[0].reshape(4, 2).astype(np.float32)
    # Winding must match detectMarkers' order or the image comes out mirrored while the
    # numbers stay plausible — which is exactly why nobody notices until they see an overlay.
    dst = np.float32(
        [
            [0, 0],
            [PX_PER_MARKER, 0],
            [PX_PER_MARKER, PX_PER_MARKER],
            [0, PX_PER_MARKER],
        ]
    )

    h_matrix = cv2.getPerspectiveTransform(src, dst)
    out_h, out_w = img.shape[0], img.shape[1]
    rect = cv2.warpPerspective(img, h_matrix, (out_w, out_h))

    return rect, MARKER_MM / PX_PER_MARKER, squareness_residual(src)


def squareness_residual(src):
    """
    How far the detected marker is from a projected square, normalised by its own size.

    A card lying flat on the panel being measured reprojects to a near-perfect square.
    A card at an angle to that panel does not. This is not a rigorous pose estimate — it is
    a cheap gate, and it exists so that a bad capture returns INDETERMINATE instead of a
    confident wrong millimetre value.
    """
    edges = [np.linalg.norm(src[i] - src[(i + 1) % 4]) for i in range(4)]
    return float(np.std(edges) / np.mean(edges))


def numeral_height_mm(rect, numeral_poly, mm_per_px):
    """
    Day 1 (Tejas). Measure the INK, not the bounding box.

    A bounding box includes ascenders, descenders and padding, and biases every reading
    upward — which hides exactly the violations this project exists to find.

        1. Crop numeral_poly out of the rectified image.
        2. Deskew: threshold to an ink mask, cv2.minAreaRect on the ink, rotate by its angle.
        3. Separate ink from background: Otsu, falling back to adaptive on low contrast.
           Decide polarity from the border ring of the crop — light-on-dark packaging is
           common and a global assumption measures the gaps between digits instead.
        4. Coverage profile: mask.sum(axis=1), ink pixels per row.
        5. Sub-pixel edges: the two rows where the profile crosses 50% of its plateau,
           interpolated. Not the first and last non-zero row, which one stray pixel of
           JPEG ringing moves.
        6. height_mm = height_px * mm_per_px.

    Return (value_mm, expanded_uncertainty_mm) — never a bare number. The uncertainty
    combines corner localisation, the squareness residual, edge localisation and threshold
    sensitivity in quadrature, expanded at k=2.
    """
    raise NotImplementedError("Day 1 spike")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Health check. Confirms the Python runtime and OpenCV actually deployed."""
        body = json.dumps(
            {
                "ok": True,
                "opencv": cv2.__version__,
                "numpy": np.__version__,
                "marker_mm": MARKER_MM,
                "mm_per_px": MARKER_MM / PX_PER_MARKER,
                "measure_implemented": False,
            }
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode())
