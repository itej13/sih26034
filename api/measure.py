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
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler

import cv2
import numpy as np

# Measured once with the caliper on the printed, laminated card. If the cards are
# reprinted at a different scale this constant changes and every past scan is stale.
MARKER_MM = 40.0
# Rectified resolution for the marker. Sets mm_per_px: 400 px / 40 mm = 0.1 mm per pixel,
# so a 1 mm numeral is 10 px tall. Raising this does not create detail the source lacks.
PX_PER_MARKER = 400
# Calibrated scale uncertainty carried into the measurement budget. This is the card/corner
# uncertainty, not a frontend estimate or a legal threshold.
# Relative scale uncertainty for the rectified grid. Keep this relative: mm_per_px changes
# with the chosen rectified grid, while the calibration-card corner uncertainty does not.
SCALE_RELATIVE_U = 0.015
MAX_SQUARENESS_RESIDUAL = 0.05

_DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)


class NoMarker(Exception):
    """Preflight failure. Fail here, fast, before anything else runs."""


def rectify(img):
    """Detect the marker and rectify the plane it lies on.

    Returns a dict with the rectified image, the millimetres-per-pixel constant that now
    holds across that plane, the squareness residual, and the homography itself — callers
    need H to map a point from the original photograph into rectified coordinates.
    """
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

    return {
        "image": rect,
        "mm_per_px": MARKER_MM / PX_PER_MARKER,
        "squareness": squareness_residual(src),
        "H": h_matrix,
    }


def to_rectified(h_matrix, points):
    """Map points from the original photograph into rectified coordinates."""
    pts = np.asarray(points, dtype=np.float32).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, h_matrix).reshape(-1, 2)


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


# ---------------------------------------------------------------------------
# Glyph metrology — Day 1 spike
#
# Rule 7 measures the height of the numeral. An OCR bounding box is not that: it
# includes ascenders, descenders and padding, and it is drawn around whatever the
# recogniser grouped together, which for an MRP field is usually "MRP ₹ 45.00
# (incl. of all taxes)". Measuring the box instead of the ink biases every reading
# upward, which hides exactly the violations this project exists to find.
#
# So we measure the ink.
# ---------------------------------------------------------------------------

# Sub-pixel localisation error at each half-maximum crossing, in pixels. Two crossings
# per measurement. Empirical placeholder until it is characterised against the caliper
# ground-truth sheet — see check_measure.py, which asserts the pipeline, not this number.
U_EDGE_PX_PER_CROSSING = 0.25


def _crop(rect, poly, margin_frac=0.25):
    """Axis-aligned crop around a polygon, with background margin left in place.

    The margin is not cosmetic: polarity detection reads the border ring, and the
    coverage profile needs to reach the background on both sides of the glyphs.
    """
    pts = np.asarray(poly, dtype=np.float32)
    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    m = max(2.0, (y1 - y0) * margin_frac)
    h, w = rect.shape[:2]
    xs, xe = int(max(0, x0 - m)), int(min(w, x1 + m))
    ys, ye = int(max(0, y0 - m)), int(min(h, y1 + m))
    if xe - xs < 4 or ye - ys < 4:
        raise ValueError("numeral polygon is too small to measure")
    return rect[ys:ye, xs:xe]


def _ink_mask(crop, threshold_shift=0.0):
    """Binary mask where True is ink, whichever way round the printing is.

    Polarity is decided from the border ring rather than assumed. Light text on a dark
    pack is common, and a global assumption measures the gaps between digits instead of
    the digits — a failure that produces a plausible number rather than an error.
    """
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    level = float(np.clip(otsu * (1.0 + threshold_shift), 1, 254))

    ring = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    background_is_light = float(np.median(ring)) > level

    mask = gray < level if background_is_light else gray > level
    # One open pass removes speckle without eating a thin stroke.
    mask = cv2.morphologyEx(
        mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
    ).astype(bool)
    return mask, level


def _deskew(crop):
    """Rotate so the baseline is horizontal. Printing is rarely square to the marker."""
    mask, _ = _ink_mask(crop)
    pts = cv2.findNonZero(mask.astype(np.uint8))
    if pts is None or len(pts) < 10:
        return crop
    angle = cv2.minAreaRect(pts)[-1]
    if angle > 45:
        angle -= 90
    if abs(angle) < 0.5 or abs(angle) > 20:
        # Nothing worth correcting, or a fit that has locked onto noise rather than a baseline.
        return crop
    h, w = crop.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        crop, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def _half_max_extent(profile):
    """Distance between the two half-maximum crossings, interpolated between samples.

    Not the first and last non-zero sample: one stray pixel of print noise or JPEG
    ringing moves those, and at 0.1 mm per pixel one pixel is 10% of a 1 mm numeral.
    """
    nz = profile[profile > 0]
    if nz.size == 0:
        raise ValueError("no ink found in the crop")
    half = float(np.percentile(nz, 75)) * 0.5

    above = np.flatnonzero(profile >= half)
    if above.size == 0:
        raise ValueError("coverage profile never reaches half maximum")
    first, last = int(above[0]), int(above[-1])

    def cross(i, step):
        """Linear interpolation between sample i and its neighbour outside the glyph."""
        j = i - step
        if j < 0 or j >= profile.size:
            return float(i)
        a, b = float(profile[j]), float(profile[i])
        if b == a:
            return float(i)
        return j + (half - a) / (b - a) * step

    return cross(last, -1) - cross(first, 1)


def _glyph_widths_px(mask):
    """Width of each connected glyph, so Rule 7(3)'s width-to-height ratio can be checked."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    tall = [s for s in stats[1:] if s[cv2.CC_STAT_HEIGHT] >= 0.4 * mask.shape[0]]
    return sorted(s[cv2.CC_STAT_WIDTH] for s in tall)


def measure_numeral(rect, poly, mm_per_px, u_mm_per_px, squareness=0.0):
    """Measure a run of numerals. Returns millimetres with an expanded uncertainty.

    Never returns a bare number. A measurement without a stated uncertainty is an
    opinion, and every verdict in this system compares an interval to the legal limit
    rather than a point value.
    """
    crop = _deskew(_crop(rect, poly))

    heights, widths = [], []
    for shift in (-0.10, 0.0, 0.10):
        mask, _ = _ink_mask(crop, threshold_shift=shift)
        heights.append(_half_max_extent(mask.sum(axis=1).astype(float)))
        w = _glyph_widths_px(mask)
        if w:
            # ponytail: median glyph width. Rule 7(3) exempts the numeral 1 and the
            # letters i/I/l, which are legitimately narrow; the median sidesteps them
            # without a glyph classifier. Swap for per-glyph widths keyed to recognised
            # characters if a pack is ever failed on this clause alone.
            widths.append(float(np.median(w)))

    height_px = heights[1]
    if height_px <= 0:
        raise ValueError("measured height is not positive")
    height_mm = height_px * mm_per_px

    # --- uncertainty budget, combined in quadrature -------------------------
    # Every term below is in MILLIMETRES. Mixing a pixel count into this sum silently
    # inflates the interval by 1/mm_per_px and turns every verdict into INDETERMINATE,
    # which looks like caution rather than a bug — so keep the units explicit.
    #
    # Scale: marker-corner localisation, as a relative error on mm_per_px.
    u_scale = height_mm * (u_mm_per_px / mm_per_px) if mm_per_px else 0.0
    # Plane: the card not lying flat on the panel. Dominant term on curved packs.
    u_plane = height_mm * squareness
    # Edge: sub-pixel localisation of the two half-maximum crossings.
    u_edge = (U_EDGE_PX_PER_CROSSING * np.sqrt(2)) * mm_per_px
    # Threshold: how much the answer moves when ink/background is separated differently.
    u_thresh = (max(heights) - min(heights)) / 2.0 * mm_per_px

    u_c = float(np.sqrt(u_scale**2 + u_plane**2 + u_edge**2 + u_thresh**2))

    return {
        "height_mm": height_mm,
        "width_mm": float(np.median(widths)) * mm_per_px if widths else None,
        "expanded_uncertainty_mm": 2 * u_c,
        "k": 2,
        "components_mm": {
            "scale": u_scale,
            "plane": u_plane,
            "edge": u_edge,
            "threshold": u_thresh,
        },
    }


def verdict(value_mm, expanded_uncertainty_mm, minimum_mm):
    """Guard band. The reason a marginal measurement never becomes an accusation.

    Mirrors verdictFor() in lib/types.ts — if you change one, change both.
    """
    if value_mm - expanded_uncertainty_mm > minimum_mm:
        return "COMPLIANT"
    if value_mm + expanded_uncertainty_mm < minimum_mm:
        return "VIOLATION"
    return "INDETERMINATE"


def measure_image_bytes(image_bytes, numeral_poly, field="mrp"):
    """Run the complete image -> calibration -> glyph measurement boundary."""
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image could not be decoded")
    calibrated = rectify(image)
    calibration = {
        "mode": "aruco_card",
        "marker_mm": MARKER_MM,
        "mm_per_px": calibrated["mm_per_px"],
        "uncertainty_mm_per_px": calibrated["mm_per_px"] * SCALE_RELATIVE_U,
        "squareness_residual": calibrated["squareness"],
    }
    if calibrated["squareness"] > MAX_SQUARENESS_RESIDUAL:
        return {"calibration": calibration, "measurements": [], "measurement_valid": False,
                "error": "calibration geometry is unreliable"}
    u_mm_per_px = calibrated["mm_per_px"] * SCALE_RELATIVE_U
    measured = measure_numeral(calibrated["image"], numeral_poly, calibrated["mm_per_px"], u_mm_per_px, calibrated["squareness"])
    measurements = [{"field": field, "metric": "numeral_height_mm", "value": measured["height_mm"], "expanded_uncertainty_mm": measured["expanded_uncertainty_mm"], "k": 2}]
    if measured["width_mm"] is not None:
        measurements.append({"field": field, "metric": "numeral_width_mm", "value": measured["width_mm"], "expanded_uncertainty_mm": measured["expanded_uncertainty_mm"], "k": 2})
    return {"calibration": calibration, "measurements": measurements, "measurement_valid": True}


def _multipart_fields(body, content_type):
    header = (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode() + body
    message = BytesParser(policy=default).parsebytes(header)
    fields = {}
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        fields[name] = part.get_payload(decode=True) if "filename" in disposition else part.get_content()
    return fields


class handler(BaseHTTPRequestHandler):
    """Vercel Python entrypoint for POST /api/measure."""

    def do_POST(self):  # noqa: N802 - required by BaseHTTPRequestHandler
        try:
            length = int(self.headers.get("Content-Length", "0"))
            fields = _multipart_fields(self.rfile.read(length), self.headers.get("Content-Type", ""))
            image = fields.get("image")
            numeral = fields.get("numeral_poly")
            if not isinstance(image, bytes) or numeral is None:
                raise ValueError("image and numeral_poly are required")
            payload = measure_image_bytes(image, json.loads(numeral), str(fields.get("field", "mrp")))
            status = 200 if payload.get("measurement_valid", True) else 422
        except (ValueError, json.JSONDecodeError, NoMarker) as error:
            payload, status = {"error": str(error)}, 422
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
