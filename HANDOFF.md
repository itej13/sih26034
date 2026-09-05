# HANDOFF — SIH26034, catch-up run of 2026-09-05

Written for an agent that has never seen this project. Everything below was done **locally**;
nothing was pushed, no pull request was opened, no deployment happened.

Baseline `968eba2` → head `1f779bc`. Thirteen commits. All four gates green at both ends.

---

## 0. Read these first

- `AGENTS.md` and `CONTRIBUTING.md` in this repo — authoritative on *how* to work here.
- The Projects wiki at `/Users/tejasdas/Developer/DO NOT TOUCH/Projects/projects/sih26034/` —
  authoritative on *why*. `team-and-plan.md` §`State on 2026-09-05` is the canonical
  remaining-work list. Do not rebuild that list from the code.

## 1. The five invariants — copied in full

1. **A model may read. A model may never measure, and never decide the law.** Every millimetre
   comes from OpenCV arithmetic on a rectified image. Every verdict comes from a JSON rule pack a
   human wrote. If you find yourself asking a language model for a dimension, a threshold, or a
   compliance decision, stop — that is the failure this project exists to prevent.
2. **A measurement is never a bare number.** It travels with `expanded_uncertainty_mm` and `k: 2`,
   and verdicts compare the *interval* to the limit, never the point value.
3. **One verdict vocabulary: `COMPLIANT | VIOLATION | INDETERMINATE`.** Absence of evidence is
   never a violation. Anything unmeasured, unparsed or low-confidence resolves to the option that
   raises **no** violation.
4. **`rule_text` is quoted verbatim from the Gazette.** Never paraphrase it, never invent it. It is
   printed on reports and read by the panel.
5. **Never hard-code a result for a specific packet.** A judge will hand the team an unfamiliar one.

## 2. The gates, and the OpenCV trap

```bash
npm run check          # contract · extraction · evaluate · packs · repository · evidence · lint
npx tsc --noEmit
npm run build
npm run check:measure  # == .venv/bin/python scripts/check_measure.py
```

**The trap:** the host Python has OpenCV **5.0.0**; `requirements.txt` pins
`opencv-contrib-python-headless==4.14.0.94`. Running `python3 scripts/check_measure.py` against the
host fails for an *environment* reason that reads exactly like a real metrology bug, and has cost
time before. Build the venv first:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

`npm run check:measure` was repointed at `.venv/bin/python` this run (`ae27550`) so the trap cannot
be stepped in through npm. CI is unaffected: `.github/workflows/check.yml` installs
`requirements.txt` into the runner and calls `python scripts/check_measure.py` directly.

## 3. What changed, per task, with its commit

| Commit | What | Wiki item |
|---|---|---|
| `45222ef` | `scripts/serve_measure.py` + development-only rewrite in `next.config.ts` so `/api/measure` answers over HTTP locally | 1 |
| `0a617ff` | Hydration mismatch on `/result/[id]` — root cause was SVG `<title>` with array children | 7 |
| `ba3eb81` | `/login` restyled into the design system; auth logic untouched | 19 |
| `a2587b1` | `middleware.ts` → `proxy.ts` for Next 16 | 20 |
| `aa585e1` | `packs/lmpc-2021-01-01.json` + `scripts/check-packs.mts` | 6 |
| `a7ab3f5` | DOCX export route and the Section 63 certificate draft | 11, 12 |
| `ae27550` | `check:measure` repointed at the venv; new scripts registered | — |
| `e8517db` | Contrast measurement in `api/measure.py`; 9(1)(b) verdict deliberately **not** wired | 15 (partial) |
| `359bda3` | VLM extraction provider behind `VISION_MODEL_API_KEY` | 2 |
| `50aa952` | `lib/repository.ts` + `/api/scan` persistence with a labelled fixture fallback | 3 |
| `25c207d` | `lib/evidence.ts` — evidence rows, chain left to Postgres | 5 |
| `82d33d8` | Repository and evidence self-checks wired into `npm run check` | — |
| `1f779bc` | Dashboard and register read through the repository | 9, 10 |

## 4. What is verified, and how

Re-run by the orchestrator after each wave, not taken from subagent reports.

- **All four gates**, on the fully integrated tree. `npm run check` ends with eight `ok` lines and
  `0 errors, 1 warning` (the warning is pre-existing: unused `_image` in `lib/extraction.ts`).
  `npx tsc --noEmit` → `TypeScript: No errors found`. `npm run build` compiles and lists
  `/report/[id]/docx` and `/report/[id]/certificate`, with **no** middleware deprecation warning.
  `npm run check:measure` → `ok — 0.1 mm/px; flat residual 0.00000, tilted 0.17886; …`.
- **`/api/measure` over HTTP.** `POST` through `next dev` returned **200** with
  `expanded_uncertainty_mm` and `k: 2`. Verified with a polygon *different* from the one the
  subagent used, and the value moved with it (2.35 mm vs 4.23 mm) — proof it measures the input
  rather than replaying a stored answer.
- **The full demo path, walked end to end.** `/capture` → `/api/extract` → per-field `/api/measure`
  → `/api/evaluate` → `sessionStorage` → `/result/live`, with a real ArUco image. Produced
  `live_1788619486662`, overall `VIOLATION`, measurements
  `numeral_height_mm, numeral_width_mm, contrast_ratio` for `mrp` and `numeral_height_mm,
  contrast_ratio` for the second field. **No fallback to the stub fired.**
- **Hydration.** `/result/sc_0142` reloaded with **zero** console errors.
- **Certificate honesty.** Rendered from `fixtures/scan.sample.json`: contains `Section 63`,
  `determination`, `uncertainty`, `k = 2`; contains none of *is guilty*, *has committed*,
  *offence under*, *shall be punished*. The scan-level `INDETERMINATE` branch — which **no fixture
  reaches**, since `scan.compliant.json` is COMPLIANT and `scan.sample.json` rolls up to VIOLATION
  — was exercised directly by driving `buildCertificateDocument` with a doctored scan; it renders
  *"This is not a finding of violation."*
- **Screens with no Supabase configured.** `/dashboard`, `/history`, `/result/sc_0142`, `/capture`,
  `/report/sc_0142`, `/report/sc_0142/docx`, `/report/sc_0142/certificate` all **200**.
  `GET /api/scan` returns `x-scan-repository: fixture` and no `stub` key; the register shows
  *"2 inspections found"* labelled *"Fixture development data"*.

## 5. Built but NOT verified, and why

- **The VLM extraction provider (`359bda3`).** No API key exists. Only the *mapping* is proven,
  against a recorded Anthropic-shaped response. `VlmExtractionProvider.extract()` has never made a
  live call. With no key set, behaviour is byte-identical to before.
- **Every Supabase path (`50aa952`, `25c207d`).** No database. The repository and evidence modules
  are exercised against an in-memory double only. No migration has ever run.
- **`appendEvidence` against the real trigger.** The chain's `row_hash`/`prev_hash` are computed by
  a `before insert` trigger that has never fired.
- **Contrast on a real photograph.** `check_measure.py` proves it on synthetic labels. On a
  synthetic pure-black-on-white image the ratio comes back `1.000 ± 0.000` — a zero uncertainty,
  which cannot happen on a real photo but means the guard band degenerates to a point there.

## 6. Blocked on a human — do not fake these

| Task | What is needed | Wiki item |
|---|---|---|
| Deploy to Vercel; production URL; offline fallback | Vercel auth Tejas holds | 21 |
| Apply `supabase/migrations/20260905120000_*.sql` | Supabase project credentials | 4 |
| A real `.env` on the demo machine | Secrets — never handled by an agent | 13 |
| Expand the dataset to thirty packets with caliper ground truth | A caliper and thirty packets | 18 |
| Fold the caliper sheet into `U_EDGE_PX_PER_CROSSING` / `MARKER_MM_REL_U` | That sheet existing | 17 |
| Cross-device check at 1024×768 and two phones | Physical devices | 22 |
| Tag the commit and freeze the deployment | Tejas's call, 2026-09-08 | 23 |

**Not attempted, and not blocked on a human** — simply outside this run's brief, so the list above
is not the whole remainder: **8** (image upload to storage), **14** (one-command reset and demo
seed), **16** (Rule 6(3) stickers — still in `UNASSESSABLE`).

## 7. Landmines found this run

- **`scripts/serve_measure.py` does not hot-reload.** It imports `api/measure.py` once at startup.
  Editing `measure.py` and re-testing without restarting the runner shows the *old* behaviour. This
  cost real confusion this run: a live scan was missing `contrast_ratio` purely because the runner
  predated the edit. Restart it after every `measure.py` change.
- **Next 16 locks `next dev` to one instance per project directory, regardless of port.**
  `-p 3111` does not give you a second server. Parallel agents in this repo must share one.
- **`contrast_ratio` is dimensionless but travels in `expanded_uncertainty_mm`**, because the frozen
  contract has exactly one uncertainty field. `MeasurementCard` now derives the unit from the metric
  name; anything else that renders a measurement must do the same or it will print millimetres on a
  ratio. Today `/result/[id]` renders only `mrp`+`numeral_height_mm` and `/result/live` renders only
  `measurements[0]`, so this is **latent, not visible** — it bites the moment either renders the
  full list.
- **`pdp.area_cm2` is hard-set to `0` by the VLM mapping** (extraction has no calibration, so a
  model-supplied area would breach invariant 1). Nothing reads it today. When Table I thresholds are
  ever selected by PDP area, `0` will read as "tiny package" and pick the most lenient band. That is
  invariant-3-consistent, but it should become a deliberate choice rather than a leftover.

## 8. The 2021 rule pack does not change a verdict

The stage script's live 2026 → 2021 swap expects the verdict to change on screen. **It will not.**

`packs/README.md` and `CONTRIBUTING.md` both say the 2021 pack drops unit sale price, which became
mandatory on 2022-10-01 — but **no rule in `lmpc-2026-07-01.json` implements a unit-sale-price
declaration**. The nine rules present cover letter height, width ratio, Table I heights, clear
space, consumer care, net-quantity SI units, MRP wording, sticker alteration and contrast, and none
of them is sourceable as a post-2021 addition from text already in this repo. Inventing one would
break invariant 4, so the 2021 pack carries the same nine rules and the two packs differ **only by
`rule_pack` attribution**.

`scripts/check-packs.mts` now asserts that verdicts are *identical* across packs, so a green line
cannot be misread as "the demo beat works". When someone sources a genuine divergence, that
assertion fails on purpose and forces this note to be updated.

**This needs a human:** either Advik adds the unit-sale-price rule to the 2026 pack with verbatim
Gazette text, or the stage beat is rewritten to show *provenance* (same packet, two packs, every
finding stamped with the law it was judged under) rather than a changing verdict. The second is
honest and needs no new law.

## 9. Rule 9(1)(b): measured, deliberately not judged

`api/measure.py` now returns a Michelson `contrast_ratio` with its own k=2 uncertainty, proven on
synthetic low- and high-contrast labels (`0.091 ± 0.037` vs `0.541 ± 0.038`). The **verdict is not
wired**, and `contrast_min` stays in `UNASSESSABLE`. Three things must land together:

1. A `threshold` in **both** packs — `check-contract.mjs` requires it on every pack's
   `contrast_min` rule the moment the predicate leaves `UNASSESSABLE`. `0.15` is validated in
   `scripts/check_measure.py` as a conservative engineering proxy. **It is not a legal figure** —
   the Gazette says "conspicuously" and names none.
2. A `contrast_ratio` measurement in the **frozen fixtures**. Without it the rule returns
   INDETERMINATE and worst-wins flips `fixtures/scan.compliant.json` from COMPLIANT to
   INDETERMINATE — the clean-pass fixture stops passing.
3. `check-evaluate.mts` updated: it currently asserts `not_assessed.length === 1` for `9(1)(b)`.

Step 2 touches the frozen contract, which `AGENTS.md` reserves for all three developers in the same
conversation. That is why this was left as a cut rather than finished by an agent.

## 10. The next three things, in order

1. **Decide the 2021 pack question (§8).** It is the only item here that changes what a judge sees,
   it needs a human with the Gazette, and every hour closer to the freeze makes rewriting the stage
   beat harder than adding the rule. Rewriting the beat to show provenance is the cheaper path and
   costs no new law.
2. **Apply the migrations and put a real `.env` on the demo machine** (items 4 and 13). Every
   Supabase path built this run — repository, evidence chain, persistence — is unexercised against a
   real database, and it is the largest block of unverified code in the repo. One caveat found by
   the repository agent: `POST /api/scan` persists under `sampleScan`'s own id, so a **second** POST
   against a real database hits a duplicate-key error on `scans.scan_id`. Fix that before seeding,
   or the demo seed fails on its second run.
3. **Settle Rule 9(1)(b) (§9) with all three developers present**, since it needs the frozen
   fixtures touched. The measurement is done; only the ratification is missing. Do it before the
   freeze or leave it `UNASSESSABLE` permanently — a half-wired predicate is worse than either.
