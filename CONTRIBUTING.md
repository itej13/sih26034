# Contributing

SIH 2026 · **SIH26034** · Department of Consumer Affairs. Seven build days, three developers,
one hard feature freeze on **6 September, 21:00**. This file is the working agreement.

---

## 1. First twenty minutes

```bash
git clone https://github.com/itej13/sih26034.git
cd sih26034
npm install
npm run check          # contract + lint. Must be green before you write anything.
npm run dev            # http://localhost:3000
```

Open these four and click around, so you know what already exists:

| URL | What it is |
|---|---|
| `/capture` | The upload form. One HTML input — there is no mobile app. |
| `/result/sc_0142` | A failing scan. One finding of each verdict state. |
| `/result/sc_0143` | A clean scan. |
| `/history`, `/dashboard` | Stubs reading from the same two fixtures. |

Then read **`fixtures/scan.sample.json`**. That file is the whole project in one object, and
almost everything you build reads or writes it.

Optional, only if you want to see the measurement work:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/check_measure.py
```

---

## 2. What the project is, in one paragraph

The Legal Metrology (Packaged Commodities) Rules, 2011 do not only ask whether a declaration
*exists* on a package. They ask whether it is at least **1 mm tall**, printed in a contrasting
colour, on the principal display panel, with clear space around it. Those are physical
measurements, and a photograph has no scale — so we put a printed calibration card in the frame,
recover millimetres per pixel from it, and report every measurement with an uncertainty band. If
that band straddles the legal limit we return **INDETERMINATE** instead of guessing.

**Two rules that outrank any style guide.**

1. **A model may read. A model may never measure, and never decide the law.** Every millimetre
   comes from OpenCV. Every verdict comes from a JSON rule pack a human wrote.
2. **The contract is frozen.** `fixtures/scan.sample.json` and `lib/types.ts` are the same shape.
   Changing a field name breaks all three lanes at once.

---

## 3. Find your lane

Three developers, three lanes, joined by one JSON file. After Day 0 nobody waits on anybody —
and if you are ever blocked waiting on a teammate, you are working on the wrong thing.

| | Owns | Does not touch |
|---|---|---|
| **Tejas** | Stages 2–5: calibration, the model call, glyph measurement, the rule engine | — |
| **Dhruv** | Stage 6: schema, auth, storage, evidence chain, search, reports | the vision pipeline, the rule engine, any UI |
| **Shaurya** | Stage 1 and everything the judges look at: capture, result screen, dashboard | the vision pipeline, the schema, the rule engine |

### The thing that unblocks both of you today

**Neither of you is waiting on the vision pipeline.** It does not exist yet and it does not need
to. `fixtures/scan.sample.json` is exactly what will arrive at your doorstep on Day 3, field for
field.

```ts
import { sampleScan, compliantScan, allScans, getScan } from "@/lib/fixtures";
```

Build your entire lane against that file. On Day 3 the import is swapped for a fetch and nothing
else about your code changes. That is the whole reason the shape was frozen before anyone wrote a
line of it.

---

### Dhruv — backend, data and evidence

Everything after a verdict exists.

- The database schema and migrations
- Authentication, with `officer` and `admin` roles enforced by **row-level policies, not route
  handlers**
- Image storage, and the SHA-256 hash taken on write
- The append-only evidence chain
- The scan repository: list, filter, search
- Report generation — PDF and DOCX — and the Section 63 certificate draft
- The one-command demo reset

If you find yourself editing `api/measure.py` or anything under `app/capture`, stop and say so at
standup.

---

### Shaurya — frontend and dashboard

Everything the panel actually looks at. The measurement is the idea; your screens are how anyone
sees that the idea works.

- The capture flow — one HTML file input, no camera library, no mobile app
- The result screen: extracted fields, findings, verdict states, and the annotated overlay drawn
  from the polygons
- **The uncertainty-bar component** — each measurement drawn against its legal threshold. This one
  component is the visual signature of the whole project. Spend your time here, not on navigation.
- Search and history pages
- The enforcement dashboard
- Print styles for `/report/[id]` (the route is Dhruv's, the CSS is yours)

If you find yourself editing the schema or `api/measure.py`, stop and say so at standup.

**Design for three verdict states, not two.** `COMPLIANT`, `VIOLATION`, and `INDETERMINATE`.
Everyone forgets the third one, and it is the one that makes this project different from every
other entry — it is the system refusing to accuse someone on a marginal measurement. It needs to
read as *deliberate*, not as an error state.

---

## 4. Your tasks, in order

Each is done when its **check** passes — not when the code is written.

### Dhruv

**Day 1 · schema, storage, auth.** Supabase project, migrations applied. Tables: `users`, `scans`,
`fields`, `measurements`, `findings`, `evidence`, `rule_packs` — mirroring the fixture, so a `Scan`
object round-trips without reshaping. Image upload to Supabase Storage. Two seeded accounts.
> **Done when** an uploaded photo has a row and a URL, and an officer account cannot open the admin
> page. Test that by logging in as one, not by reading the policy.

**Day 2 · persist a scan end to end.** Upload → scan row → field, measurement and finding rows →
fetch by id and get back something satisfying the `Scan` type. `image_sha256` from the **original
bytes**. Each `evidence` row carries the previous row's hash.
> **Done when** editing a stored row by hand breaks the chain check.

**Day 3 · search and the repository.** Filter by date, verdict, brand and rule. Full-text over the
extracted manufacturer and product name.
> **Done when** you can find a three-day-old scan in two clicks.

**Day 4 · reports and the evidence bundle.** `/report/[id]` styled for print — **no PDF library**.
DOCX from the same data through the `docx` package. A bundle view showing image hash, chain
position, capture context, rule-pack version, and a drafted certificate under Section 63 of the
Bharatiya Sakshya Adhiniyam, 2023.
> **Done when** print-to-PDF produces something you would hand an enforcement officer.

**Day 5 · demo safety.** One-command reset to a known good state; a demo login that always works.
> **Done when** the reset takes under ten seconds.

**Day 6 · deploy, then stop.** Production URL, plus a local fallback that runs with **no internet
at all**. Assume the venue Wi-Fi fails, because it will.
> **Done when** the whole demo runs with the router unplugged.

### Shaurya

**Day 1 · the result screen, from the fixture.** Render all of it — fields, measurements, findings,
verdict states, and the annotated overlay drawn from the polygons — using the static JSON. This is
the screen judges look at longest, so it gets the most days.
> **Done when** it looks finished with zero backend running.

**Day 2 · capture wired to real data.** Photo → upload → result screen with whatever the backend
has. Write the loading and error states properly: no marker in frame, blurry photo, upload failed
mid-way. A demo dies on an unhandled spinner.
> **Done when** one real packet goes photo-to-screen.

**Day 3 · the uncertainty bar.** Per finding, draw the measured interval against the legal
threshold — the value, the ± band, and the limit line. Compliant sits clear above, violation clear
below, indeterminate straddles it.
> **Done when** a stranger can tell the three states apart at a glance, without reading a word.

**Day 4 · the enforcement dashboard.** Counts by verdict, violations by rule, top offending brands,
a trend line, and a filterable table linking into individual scans.
> **Done when** it is populated by real scans rather than fixtures.

**Day 5 · polish only.** Empty states, mobile layout, loading skeletons, keyboard focus, and the
one animation you are allowed. Nothing new.
> **Done when** it looks deliberate on a phone and on a projector.

**Day 6 · cross-device.** Two phones, one laptop, one projector resolution. Fix only what is
broken.
> **Done when** it renders correctly at 1024×768.

You are also on the keyboard during the presentation for everyone else's slides, and you cut to
the backup video within five seconds if the live demo fails. Practise that once during rehearsal.

## 5. Workflow

**Branch per task**, prefixed with your name: `dhruv/evidence-chain`, `shaurya/uncertainty-bar`.
Never commit to `main` directly.

```bash
git checkout main && git pull
git checkout -b dhruv/evidence-chain      # or shaurya/uncertainty-bar
# ... work ...
npm run check                     # must be green
git commit -am "Evidence rows chain to the previous hash"
git push -u origin dhruv/evidence-chain
gh pr create --fill               # or open it in the browser
```

**Merging.**

- Inside your own lane, checks green → **merge it yourself**. Do not wait for a review; seven
  days is too short for review ceremony.
- Touching `lib/types.ts`, `fixtures/*`, or `packs/*` → **tag Tejas and wait.** Those are the
  shared contract and a silent change there breaks two other people.

**Push every day**, even unfinished. Work on one laptop does not exist, and laptops die on the 7th.

**Standup 21:00, fifteen minutes.** What landed, what is blocked, what changes tomorrow.

**Commit messages:** say what changed and why, not what file you touched. `"Evidence rows chain
to the previous hash so a back-dated record breaks verification"` beats `"update schema"`.

---

## 6. Secrets

Never commit a value. `.env.example` carries key **names** only; your real values go in
`.env.local`, which is gitignored.

The Supabase **service role key bypasses row-level security**. It must never appear in a client
component, a `NEXT_PUBLIC_*` variable, or anything that ships to the browser. If you think you
need it on the client, you need a server route instead.

---

## 7. Things that will bite you

- **Polygons are in rectified image pixels — not original photo pixels, and not CSS pixels.**
  This is the one that will cost Shaurya an afternoon. Every `poly` and `numeral_poly` is in the
  coordinate space of the *rectified* image, the one the calibration step produced. To draw an
  overlay on a `<img>` that the browser has scaled, multiply by
  `renderedWidth / rectifiedImage.naturalWidth`. Drawing them raw puts every box in the wrong
  place, and it will look almost right, which is worse than looking wrong.
- **`api/*.py` does not run under `next dev`.** It is a Vercel Python function, deliberately
  outside `app/`. Test it on a deployed preview or by running the module directly. If `/api/measure`
  404s locally, that is expected, not a bug.
- **One verdict vocabulary:** `COMPLIANT | VIOLATION | INDETERMINATE`, at both finding and scan
  level. The scan-level `overall` is a worst-wins rollup. An earlier draft had two vocabularies and
  the contract check caught it — do not reintroduce a third.
- **A measurement is never a bare number.** It travels with `expanded_uncertainty_mm` and `k: 2`.
  `npm run check:contract` fails if any measurement lacks one, on purpose.
- **The original image is the record.** Hash the bytes on upload. The annotated overlay is a
  derived artefact and is never what gets filed.
- **`rule_text` is quoted verbatim from the Gazette.** Never paraphrase it, never truncate it in
  the database. It is printed on reports and read by the panel.

---

## 8. Do not

- Hard-code a result for a specific packet. A judge will hand us an unfamiliar one, and that is
  the moment we lose.
- Add a PDF generation library. Print CSS already works.
- Add a camera or webcam library. `<input type="file" capture="environment">` is the capture layer,
  it is one line, and it works on every phone in the room.
- Rename anything in the frozen contract without all three of us in the same conversation.
- Add a feature after **6 September, 21:00**. The team that ships something new on the last night
  is the team whose demo crashes.

---

## 9. Where the rest of it is

- `AGENTS.md` — how to work in this codebase, commands, conventions, landmines
- `README.md` — what the thing is and how to run it
- `packs/README.md` — the rule packs, Advik's lane
- The *why* — decisions, the pitch, the legal research — lives in Tejas's project wiki, not here
