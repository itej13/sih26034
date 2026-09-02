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

## 3. Dhruv — your lane

**Stage 6: backend, data and evidence.** Everything after a verdict exists.

You own:

- The database schema and migrations
- Authentication, with `officer` and `admin` roles enforced by **row-level policies, not route
  handlers**
- Image storage, and the SHA-256 hash taken on write
- The append-only evidence chain
- The scan repository: list, filter, search
- Report generation — PDF and DOCX — and the Section 63 certificate draft
- The one-command demo reset

You do **not** own: the vision pipeline, the rule engine, or any UI. If you find yourself
editing `api/measure.py` or anything under `app/capture`, stop and say so at standup.

### The thing that unblocks you today

**You are not waiting on the vision pipeline.** It does not exist yet and it does not need to.
`fixtures/scan.sample.json` is exactly what will arrive at your doorstep on Day 3, field for
field. Build the whole persistence layer against that file today.

```ts
import { sampleScan, allScans } from "@/lib/fixtures";
```

If you are ever blocked waiting for Tejas, you are working on the wrong thing.

---

## 4. Your tasks, in order

Each one is done when its check passes — not when the code is written.

### Day 1 · schema, storage, auth
Supabase project, migrations applied. Tables: `users`, `scans`, `fields`, `measurements`,
`findings`, `evidence`, `rule_packs` — mirroring the fixture, so a `Scan` object round-trips
without reshaping. Image upload to Supabase Storage from the app. Two seeded accounts.

> **Done when** an uploaded photo has a row and a URL, and an officer account cannot open the
> admin page. Test that by logging in as one, not by reading the policy.

### Day 2 · persist a scan end to end
Upload → scan row → field, measurement and finding rows → fetch by id and get back something
that satisfies the `Scan` type. Compute `image_sha256` from the **original bytes** on write.
Each `evidence` row carries the previous row's hash.

> **Done when** editing a stored row by hand breaks the chain check.

### Day 3 · search and the repository
List and filter scans by date, verdict, brand and rule. Full-text over the extracted
manufacturer and product name.

> **Done when** you can find a three-day-old scan in two clicks.

### Day 4 · reports and the evidence bundle
`/report/[id]` styled for print — **no PDF library**, the browser's own print-to-PDF makes the
file. DOCX from the same data through the `docx` package, one template. A bundle view showing
the image hash, chain position, capture context, rule-pack version, and a drafted certificate
under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023.

> **Done when** print-to-PDF produces something you would hand an enforcement officer.

### Day 5 · demo safety
A one-command reset to a known good state, and a demo login that always works.

> **Done when** the reset takes under ten seconds.

### Day 6 · deploy, then stop
Production URL, plus a local fallback that runs with **no internet at all**. Assume the venue
Wi-Fi fails, because it will.

> **Done when** the whole demo runs with the router unplugged.

---

## 5. Workflow

**Branch per task.** `dhruv/schema`, `dhruv/evidence-chain`. Never commit to `main` directly.

```bash
git checkout main && git pull
git checkout -b dhruv/evidence-chain
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
- Rename anything in the frozen contract without all three of us in the same conversation.
- Add a feature after **6 September, 21:00**. The team that ships something new on the last night
  is the team whose demo crashes.

---

## 9. Where the rest of it is

- `AGENTS.md` — how to work in this codebase, commands, conventions, landmines
- `README.md` — what the thing is and how to run it
- `packs/README.md` — the rule packs, Advik's lane
- The *why* — decisions, the pitch, the legal research — lives in Tejas's project wiki, not here
