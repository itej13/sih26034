<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# How to work in this repo

SIH 2026, problem statement **SIH26034** (Dept. of Consumer Affairs). Checks packaged-commodity
labels against the Legal Metrology (Packaged Commodities) Rules, 2011. The *why* — decisions,
history, the pitch — lives in the Projects wiki at
`/Users/tejasdas/Developer/DO NOT TOUCH/Projects/projects/sih26034/`. This file is only *how*.

## The two rules that matter more than any style guide

**1. A model may read. A model may never measure, and never decide the law.**
Every millimetre in this system comes from OpenCV arithmetic on a rectified image. Every verdict
comes from a JSON rule pack a human wrote. If you find yourself asking a language model for a
dimension, a threshold, or a compliance decision, stop — that is the failure this project exists
to prevent. The model still *classifies* (which string is the MRP, whether a name is a brand or a
generic), and those classifications select which rule fires, so treat enum-shaped fields as
judgement in disguise: low confidence falls to the option that raises **no** violation.

**2. The contract is frozen.**
`fixtures/scan.sample.json` is the Label Object Model — the shape every stage produces or
consumes. `lib/types.ts` mirrors it. Changing a field name breaks all three development lanes at
once, so it happens only with all three developers in the same conversation, and
`npm run check:contract` must pass afterwards.

## Commands

```
npm run dev             # Next.js, port 3000
npm run check           # contract + lint. Run before every push.
npm run check:contract  # fixtures and rule packs against the frozen shape
npm run check:measure   # the metrology core, against synthetic markers
npm run build
```

`check:measure` needs OpenCV: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.

## Layout

```
app/                    Next.js App Router — Shaurya
  api/scan/route.ts     Day 0 stub returning the fixture; becomes the real pipeline on Day 2
api/measure.py          Vercel Python function — the metrology core, Tejas
packs/                  rule packs, the legal framework as data — Advik
fixtures/               the frozen contract, and what every screen reads until Day 3
lib/types.ts            the Label Object Model in TypeScript
scripts/                the two runnable checks
```

`api/*.py` is a Vercel Python function and is deliberately outside `app/`. It does not run under
`next dev`; hit the deployed preview URL, or run the module directly.

## Conventions

- Polygons are always `[[x, y], ...]` clockwise from top-left, in **rectified** image pixels.
  Raw camera pixels never leave stage 2.
- A measurement is never a bare number. It travels with `expanded_uncertainty_mm` and `k: 2`,
  and verdicts compare the *interval* to the limit — see `verdictFor()` in `lib/types.ts`.
- `rule_text` is quoted verbatim from the Gazette. Never paraphrase it; it is printed on
  reports and read by the panel.
- One verdict vocabulary everywhere: `COMPLIANT | VIOLATION | INDETERMINATE`. The scan-level
  `overall` is a worst-wins rollup of its findings.
- Never hard-code a result for a specific packet. A judge will hand us an unfamiliar one.
- No secrets in the repo. `.env.example` carries key names only.

## Landmine

The homography is valid only for points on the calibration card's plane. A card lying on the
table beside a standing pack gives a wrong scale with no error and a confident number on screen.
`squareness_residual()` in `api/measure.py` is the gate; anything failing it must return
`INDETERMINATE`, never a value.
