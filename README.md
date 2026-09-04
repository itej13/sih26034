# sih26034

Smart India Hackathon 2026 · **SIH26034** · Department of Consumer Affairs

Scans a packaged commodity's label and checks it against the Legal Metrology (Packaged
Commodities) Rules, 2011.

The rules are written in **millimetres** — minimum letter height under Rule 7(3), the height
tables under 7(2), the clear space required around the net quantity under 8(1). A photograph
carries no scale, so a pipeline that compares pixel height to a constant has not checked font
size; it has checked how close the phone was held. This one recovers real-world scale from a
printed ArUco card in the frame, reports every measurement with an uncertainty band, and returns
**indeterminate** rather than a verdict when that band straddles the legal threshold.

> Interim repo name. The project name is undecided — nothing is branded yet, so renaming later
> costs nothing.

## Run it

```bash
npm install
npm run dev
```

Then `/capture` to upload, `/result/sc_0142` for a failing scan, `/result/sc_0143` for a clean
one, `/dashboard` and `/history` for the lists.

For the metrology core:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/check_measure.py
```

## Day 0 is done when

- [x] Repo exists, deploys, everyone can push
- [x] `fixtures/scan.sample.json` — the Label Object Model, frozen
- [x] `lib/types.ts` — the same shape in TypeScript
- [x] `packs/lmpc-2026-07-01.json` — five real rules as a template
- [x] `api/measure.py` — OpenCV deploys, and the homography is proven against synthetic markers
- [x] Two runnable checks, both green
- [ ] Twelve packets photographed with the card in frame, caliper ground truth recorded

## Day 1 is done when

- [x] `measure_numeral()` — crop, deskew, polarity, ink profile, sub-pixel edges, millimetres
- [x] The uncertainty budget: scale, plane, edge and threshold terms, expanded at k=2
- [x] Guard-banded verdicts, matching `verdictFor()` on the TypeScript side
- [x] `scripts/spike.py` — a photograph in, millimetres out, from the command line
- [x] Proven end to end on synthetic packs: 0.004–0.028 mm error at 1, 2 and 4 mm, with and
      without perspective, and no false violation at any size
- [ ] **Agrees with the caliper on three real packets** — the half no synthetic test can stand in for

### Running the spike

```bash
.venv/bin/python scripts/spike.py photo.jpg                      # rectify, see the scale
.venv/bin/python scripts/spike.py photo.jpg --box 268,342,84,28  # measure that box
```

The box is in **rectified** pixels, read off the `.rectified.png` the first command writes.
At the default grid one pixel is 0.1 mm. `--debug` also writes the crop and the ink mask,
which is what to look at first when a number seems wrong.

Known resolution ceiling: `PX_PER_MARKER` fixes the rectified grid at 0.1 mm per pixel, so a
0.5 mm numeral is five pixels tall however good the camera was. It still measures, but the
uncertainty roughly triples and the answer becomes `INDETERMINATE` — correct behaviour, not a
bug. Raise `PX_PER_MARKER` only if the source photographs carry the detail to justify it.

## Day 3 is done when

- [x] `lib/evaluate.ts` — the rule engine: a pack of predicates over the Label Object Model
- [x] All nine predicates in the frozen vocabulary dispatch, and the two that the model cannot
      yet answer (`contrast_min`, `consistent_with`) return `INDETERMINATE` with a reason
      rather than a guess
- [x] `POST /api/evaluate` — Label Object Model + pack id → findings and a worst-wins verdict
- [x] `npm run check:evaluate` — agrees with both fixtures, and holds the guard bands
- [ ] A second pack, so the live 2026 → 2021 swap has something to swap to (Advik)

```bash
curl -X POST localhost:3000/api/evaluate \
  -H 'content-type: application/json' \
  -d "{\"scan\": $(cat fixtures/scan.sample.json), \"pack_id\": \"lmpc@2026-07-01\"}"
```

Omit `pack_id` and the newest pack is used. The route is deterministic and offline — no model,
no network, no database — which is what makes a finding defensible when the notice it produced
gets challenged.

> **Known divergence.** The engine returns `COMPLIANT` for Rule 8(1) on
> `fixtures/scan.sample.json` where the fixture records `VIOLATION`. The fixture's own geometry
> does not support a violation: the "20% EXTRA" flash sits diagonally away from the
> net-quantity numeral, clear of the required rectangle on both axes. The fixture's finding was
> written by hand rather than computed. Fixtures are the frozen contract, so this is raised
> for the three of us rather than edited — but it needs deciding before the demo, because the
> seeded scan and the live scan will disagree on screen.

## Contract-first

Three developers, seven days, one product. The way that fails is everyone waiting on the hard
part and integrating at 2 a.m. on the last night. So two shapes are frozen on Day 0 and everyone
builds against a **file** instead of against a person:

- **`fixtures/scan.sample.json`** — the Label Object Model. What stages 2–5 produce and what
  stages 1 and 6 consume.
- **`packs/*.json`** — the rule pack. What Advik produces and what stage 5 consumes.

Shaurya's result screen must render completely from the fixture before a line of OpenCV exists.
`npm run check:contract` fails if either shape drifts.

## The pipeline

| Stage | Does | Owner |
|---|---|---|
| 1 · Capture | Browser camera, calibration card in frame | Shaurya |
| 2 · Calibrate | ArUco → homography → millimetres per pixel | Tejas |
| 3 · Read | Vision model → typed fields. **Semantics only** | Tejas |
| 4 · Measure | Glyph ink profile → mm, with an uncertainty budget | Tejas |
| 5 · Judge | Rule-pack predicates, guard-banded verdicts | Tejas · rules by Advik |
| 6 · Record | Hash, chain, search, PDF and DOCX | Dhruv |

A model reads. OpenCV measures. A JSON file written by a human decides. See `AGENTS.md` for the
working rules and `/Users/tejasdas/Developer/DO NOT TOUCH/Projects/projects/sih26034/` for why
any of it is the way it is.

## Checks

```bash
npm run check           # contract + lint, before every push
npm run check:measure   # the metrology core against synthetic markers
```

`check_measure.py` asserts that scale is recovered exactly, that it does **not** move with camera
distance, that a tilted card raises the squareness residual, and that a frame with no marker
raises rather than defaulting. If it fails, nothing downstream can be trusted.
