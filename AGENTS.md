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

## The project in short

An inspection tool for Legal Metrology officers. Photograph a packaged product with a printed
ArUco calibration card lying on the panel; the system recovers real-world scale from the card,
reads the label's mandatory declarations, measures the MRP and net-quantity numerals in
**millimetres**, evaluates versioned rule packs over the result, and produces a compliance report
plus a hashed evidence record.

The differentiator is the millimetre. The LMPC Rules are written in millimetres and a photograph
carries no scale, so a competing entry compares pixels to a constant and cannot answer "how do you
know it is 1 mm?". Every measurement here travels with an uncertainty band and returns
`INDETERMINATE` rather than a verdict when that band straddles the legal threshold.

Six people, four build lanes. **Tejas** — calibration, measurement, the rule evaluator, the three
API routes, the photographed test set. **Dhruv** — schema, auth, storage, evidence chain, reports.
**Shaurya** — capture, result screen, dashboard. **Advik** — the rule packs, which are a code
dependency of the evaluator despite sitting on a presentation lane.

| Date | Stage |
|---|---|
| 2026-09-02 | Measurement spike |
| 2026-09-03 | Extraction; the spike becomes an endpoint |
| 2026-09-04 | Rule engine; the verdict appears |
| 2026-09-05 | Reports, evidence, dashboard |
| 2026-09-06 | Integration, seeding. **Feature freeze 21:00** |
| 2026-09-07 | Bugs, backup video, rehearsal |
| 2026-09-08 | **Submission, midday** |
| 2026-09-11 | Presentation |

Gate 1 (2026-09-03): measurement agrees with a caliper to ±0.15 mm on ten packets. Gate 2
(2026-09-04): field extraction reliable on eight of ten. A missed gate triggers the pre-decided
fallback recorded in the wiki, never an extension of the day.

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

## Before starting any stage: the PR gate

**Never begin a day's stage on top of unreviewed work.** Before writing a line of extraction, the
rule engine, reports or integration, clear the pull-request queue first. A misunderstanding that
merges on Day 3 is an afternoon on Day 6, and there is no Day 6 to spare.

```bash
gh pr list --repo itej13/sih26034 --state open
gh pr view <N> && gh pr diff <N> && gh pr checks <N>
```

Every open PR gets exactly one of three verdicts:

| Verdict | Means | Action |
|---|---|---|
| **Aligned** | Does what its description claims, stays in its lane, holds both invariants | Merge |
| **Anomaly** | Right intent, wrong execution — broken invariant, contract drift, hard-coded result, a number without an uncertainty | Fix on the contributor's branch, then merge |
| **Misaligned** | Solves a problem this project does not have, or belongs to another lane or a later day | Do not merge. Comment why, leave it open |

Judged in this order — stop at the first failure:

1. **The two invariants above.** A PR that lets a model emit a number, or renames a contract field
   without the standup, fails here however good the code is.
2. **The lane's deliverable** in `CONTRIBUTING.md` §4. Code outside the author's lane is a flag,
   not a bonus: it usually means two people are about to edit the same file.
3. **Description matches diff.** "Evidence rows chain to the previous hash" plus a quiet edit to
   `lib/types.ts` is an anomaly even when both halves are individually correct.
4. **Both checks green.** A red `metrology core` never merges on the promise of a follow-up.
5. **No hard-coded packet results. No measurement without `expanded_uncertainty_mm` and `k`.**

**Resolving an anomaly:** push commits to the contributor's branch. Never open a replacement PR,
never copy their code into your own branch — they keep authorship, the PR keeps its history, and
one comment saying what changed teaches instead of merely landing. If the fix is larger than the
original PR, that is a misalignment wearing an anomaly's clothes: close the loop in conversation.

An empty queue is a valid result. Say so and start the stage.

## Delegating: Sonnet reads, Opus decides

Reading diffs is mechanical and mechanical work does not need the expensive model. Spend the
reasoning model on the verdict, the anomaly fix and the merge order; hand the reading to Sonnet
subagents, one per PR, in parallel.

A subagent prompt for this must:

- **Carry the invariants inline.** It has not read this file and will not infer them.
- **Ask for observations, not verdicts.** "List every place a number is produced and say where it
  came from" beats "is this correct?" — the second invites a confident guess.
- **Fix the output shape.** `FILE:LINE — what — why it matters`. Free prose from five subagents is
  five formats to reconcile.
- **Forbid fixing.** Read-only. The subagent reports; the judgement stays here.
- **Cap it.** "Under 200 words." An unbounded scan returns an essay about naming.

Never delegate: the merge decision, anything touching `lib/types.ts` or `fixtures/*`, the
uncertainty budget, or a conflict resolution. Those are where a plausible wrong answer costs a day.

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
