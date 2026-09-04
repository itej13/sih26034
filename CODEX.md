# SIH26034 — CODEX.md

## 0. Mission

You are the primary implementation agent for SIH26034, a Department of Consumer Affairs Legal Metrology compliance system.

Build the complete working web application described in this document.

The system takes a photograph of a packaged commodity label containing an ArUco calibration card, extracts legal declarations, physically measures printed numerals in millimetres using computer vision and calibration, evaluates those measurements against versioned Legal Metrology rules, stores the scan/evidence, and presents the result in an enforcement-oriented dashboard and printable report.

This is a hackathon system. Reliability of the live demo is more important than unnecessary architectural complexity.

Do not invent features outside this specification.

---

# 1. Core product argument

The central technical claim of the project is:

> The vision-language model reads the label. OpenCV performs the physical measurement. A versioned rule engine decides compliance.

Never violate this separation.

### VLM/LLM

Allowed to:

* identify declarations
* transcribe text
* identify MRP
* identify net quantity
* identify manufacturer
* identify dates
* identify consumer-care information
* return bounding polygons
* return confidence

Not allowed to:

* determine millimetre measurements
* estimate physical size
* decide compliance
* replace ArUco calibration
* replace OpenCV geometry

### OpenCV / measurement pipeline

Responsible for:

* ArUco detection
* calibration
* perspective correction
* pixel-to-mm conversion
* numeral/glyph geometry
* measured height
* uncertainty
* measurement validity
* squareness / geometry gating

### Rule engine

Responsible for:

* loading versioned rule packs
* applying legal thresholds
* producing COMPLIANT / VIOLATION / INDETERMINATE
* producing overall compliance
* attaching exact rule text
* never modifying measurements

### Frontend

Responsible for:

* capture/upload
* progress/loading
* result visualization
* annotated image
* measurement display
* uncertainty visualization
* verdict display
* history
* enforcement dashboard
* printable report

The frontend must never calculate legal compliance itself.

---

# 2. Product scope

Build a web application.

Do NOT build:

* Flutter application
* native Android application
* AR depth system
* trained-from-scratch detector
* self-hosted OCR system
* citizen reference-object mode
* full e-commerce crawler
* offline synchronization
* multi-state onboarding
* more than the specified legal checks

Phone browser camera capture is sufficient.

---

# 3. Architecture

Use:

* Next.js App Router
* TypeScript
* React
* Python/OpenCV for measurement
* Supabase for persistence/auth/storage
* hosted vision-language model for extraction
* Recharts for dashboard visualizations
* browser print-to-PDF for reports
* npm `docx` only if DOCX export is implemented
* Vercel for deployment

Prefer a simple monorepo/single Next.js application unless the existing repository already has a better established structure.

Do not replace working infrastructure unnecessarily.

---

# 4. Repository inspection

Before changing anything:

1. Inspect the complete repository.
2. Identify existing Next.js configuration.
3. Identify existing Python code.
4. Identify existing API routes.
5. Identify package manager.
6. Identify environment variables.
7. Identify existing components.
8. Identify existing tests.
9. Identify existing fixture data.
10. Identify existing Supabase configuration.
11. Identify existing deployment configuration.

Do not assume the repository is empty.

Preserve useful existing work.

If something already implements part of this specification correctly, extend it rather than rewriting it.

---

# 5. Frozen Label Object Model

Use this object model as the canonical contract.

```json
{
  "scan_id": "sc_0142",
  "captured_at": "2026-09-04T11:20:31Z",
  "calibration": {
    "mode": "aruco_card",
    "mm_per_px": 0.0412,
    "uncertainty_mm_per_px": 0.0006
  },
  "pdp": {
    "area_cm2": 214.0,
    "confidence": 0.88
  },
  "fields": [
    {
      "key": "mrp",
      "text": "MRP ₹ 45.00 (incl. of all taxes)",
      "value": 45.0,
      "poly": [
        [210,340],
        [398,340],
        [398,372],
        [210,372]
      ],
      "numeral_poly": [
        [268,342],
        [352,342],
        [352,370],
        [268,370]
      ],
      "confidence": 0.94
    },
    {
      "key": "net_qty",
      "text": "Net Qty. 100 g",
      "value": {
        "n": 100,
        "unit": "g"
      },
      "poly": [
        [210,392],
        [372,392],
        [372,420],
        [210,420]
      ],
      "confidence": 0.96
    },
    {
      "key": "mfg_date",
      "text": "MFD 03/2026",
      "value": "2026-03",
      "confidence": 0.91
    },
    {
      "key": "manufacturer",
      "text": "Acme Foods Pvt Ltd, Pune 411001",
      "confidence": 0.89
    },
    {
      "key": "consumer_care",
      "text": "care@acme.in | 1800-000-000",
      "confidence": 0.87
    }
  ],
  "measurements": [
    {
      "field": "mrp",
      "metric": "numeral_height_mm",
      "value": 0.82,
      "expanded_uncertainty_mm": 0.10,
      "k": 2
    }
  ],
  "findings": [
    {
      "rule": "7(3)",
      "verdict": "VIOLATION",
      "measured": "0.82 ± 0.10 mm",
      "required": "≥ 1.00 mm",
      "rule_pack": "lmpc@2026-07-01",
      "text": "Height of letters in the declaration shall not be less than 1 mm..."
    }
  ],
  "overall": "NON_COMPLIANT"
}
```

Create proper TypeScript types for this model.

Do not create competing versions of this schema.

---

# 6. API contracts

The following API boundaries are frozen.

## POST /api/extract

Input:

* image

Output:

```text
fields[]
pdp
```

Purpose:

Extract legal declarations from the image.

---

## POST /api/measure

Input:

* image
* numeral_poly

Output:

```text
calibration
measurements[]
```

Purpose:

Perform physical measurement.

The response must contain actual measurement provenance.

---

## POST /api/evaluate

Input:

* Label Object Model
* rule pack ID

Output:

```text
findings[]
overall
```

Purpose:

Apply legal rules.

The evaluator must not perform image analysis.

---

# 7. Measurement pipeline

Implement the real metrology pipeline.

Conceptually:

```text
INPUT IMAGE
     |
     v
Detect ArUco calibration card
     |
     v
Validate marker geometry
     |
     v
Recover pixel-to-mm scale
     |
     v
Perspective / homography correction
     |
     v
Locate requested numeral region
     |
     v
Segment glyphs
     |
     v
Measure physical glyph height
     |
     v
Propagate uncertainty
     |
     v
Geometry / squareness quality gate
     |
     v
Measurement + uncertainty
```

Important:

The measurement result must never originate from an LLM.

The LLM can provide the `numeral_poly`, but OpenCV must determine the actual physical size.

---

# 8. Calibration

Use the physical ArUco calibration card.

The system should recover:

```text
mm_per_px
uncertainty_mm_per_px
```

Do not use:

* assumed camera distance
* assumed phone resolution
* screen DPI
* EXIF focal length as physical scale
* arbitrary fixed conversion constants

The physical marker/card is the source of scale.

---

# 9. Geometry quality gate

A photograph should not automatically be accepted.

If the card/label geometry indicates excessive perspective or the relevant plane is unreliable:

```text
measurement_valid = false
```

and the UI should communicate that the result is unreliable/indeterminate rather than pretending to have a precise measurement.

The existing project requirement is that a card tilted out of the panel plane should increase the squareness residual and gate the pipeline.

Preserve this behavior.

---

# 10. Uncertainty

Represent measurements as:

```text
value ± expanded_uncertainty
```

where:

```text
k = 2
```

is used for expanded uncertainty.

For a legal threshold T:

```text
lower = measured - uncertainty
upper = measured + uncertainty
```

The result must distinguish:

### Clearly compliant

```text
lower >= threshold
```

### Clearly violating

```text
upper < threshold
```

### Indeterminate

```text
lower < threshold <= upper
```

Do not let the frontend independently derive the legal verdict.

The backend/rule engine must provide the verdict.

The frontend only visualizes it.

---

# 11. Rule engine

Rule packs are versioned data.

Example:

```text
lmpc@2026-07-01
```

The rule pack should contain:

* rule ID
* legal threshold
* applicability conditions
* quoted legal text
* effective/version date
* metadata/source

Do not hard-code legal rules inside React components.

Do not hard-code legal thresholds inside measurement code.

Do not silently use the latest rule pack.

Every finding must identify the rule pack used.

---

# 12. Required legal checks

Implement only the agreed set of eight rule checks.

If the repository already contains the exact eight checks/rule pack, use them.

If rule data is incomplete, create the engine interface and fixture implementation without inventing legal requirements.

Legal text must come from authoritative project-provided rule packs.

---

# 13. Frontend routes

Implement:

```text
/capture
/result
/history
/dashboard
/report
```

---

# 14. /capture

Requirements:

* phone camera capture
* desktop upload
* image preview
* clear capture/upload CTA
* processing state
* extraction state
* measurement state
* evaluation state
* error state
* retry
* transition to result

Use:

```html
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

where appropriate.

Do not require a native mobile application.

---

# 15. /result

This is the highest-priority screen.

It must work completely from:

```text
fixtures/scan.sample.json
```

with NO backend dependency.

The screen should immediately communicate:

1. What packet was inspected.
2. What declarations were extracted.
3. Which numeral was measured.
4. Its measured size in millimetres.
5. Its uncertainty.
6. The legal threshold.
7. The verdict.
8. The applicable rule.
9. The calibrated nature of the measurement.

Recommended hierarchy:

```text
------------------------------------------------
LEGAL METROLOGY INSPECTION
------------------------------------------------

OVERALL VERDICT
NON-COMPLIANT

Packet image
 ├── declaration polygon
 └── numeral polygon

MRP
₹45.00

Numeral height
0.82 ± 0.10 mm

Required
≥ 1.00 mm

UNCERTAINTY / THRESHOLD BAR

        0.72      0.82      0.92       1.00
         |---------|---------|------------|
                            measured     threshold

Finding

RULE 7(3)
VIOLATION

Measured: 0.82 ± 0.10 mm
Required: ≥ 1.00 mm

[quoted rule text]

Extracted declarations
...
------------------------------------------------
```

The exact visual design can differ, but the information hierarchy must remain.

---

# 16. Annotated image

Render:

```text
fields[].poly
```

as declaration boxes.

Render:

```text
fields[].numeral_poly
```

as the exact measured numeral region.

Do not calculate measurements in the browser.

The frontend only visualizes coordinates supplied by the pipeline.

Make the image responsive.

Ensure annotations remain correctly positioned when the image scales.

---

# 17. Measurement card

Create a reusable:

```text
MeasurementCard
```

showing:

* field
* metric
* measured value
* uncertainty
* unit
* threshold
* rule
* verdict

Do not bury the actual number.

The judge should see the number immediately.

---

# 18. UncertaintyBar

Create:

```text
UncertaintyBar.tsx
```

It should visualize:

```text
measurement ± uncertainty
```

against the legal threshold.

It must support:

* compliant
* violation
* indeterminate

The component should receive already-computed values/verdict from the data model.

It must not decide compliance itself.

---

# 19. Verdict states

Support:

```text
COMPLIANT
VIOLATION
INDETERMINATE
```

Overall:

```text
COMPLIANT
NON_COMPLIANT
INDETERMINATE
```

Never invent another verdict spelling.

---

# 20. Dashboard

Implement:

```text
/dashboard
```

Show:

* total scans
* compliant scans
* non-compliant scans
* indeterminate scans
* violations by rule
* top offending brands/manufacturers
* scan trend
* filterable scan table

Use Recharts where useful.

The dashboard should use actual stored scans once Supabase is connected.

During development, use fixture/mock data.

Do not hard-code chart values directly into JSX.

---

# 21. History

Implement:

```text
/history
```

Features:

* search
* date filtering
* verdict filtering
* rule filtering
* manufacturer filtering
* scan selection
* link to result
* useful empty state
* loading state
* error state

---

# 22. Report

Implement:

```text
/report
```

The report should look suitable for an inspection/compliance workflow.

Include:

* scan ID
* timestamp
* packet/field information
* image
* calibration information
* measurements
* uncertainty
* findings
* legal rule
* rule pack version
* overall verdict
* relevant evidence/provenance

Make the page print correctly.

Use print CSS.

The primary PDF mechanism is browser:

```text
Print → Save as PDF
```

Do not make a complicated PDF rendering service unless necessary.

---

# 23. Backend / database

Use Supabase where configured.

Suggested logical entities:

```text
scans
fields
measurements
findings
rule_packs
evidence
users
```

Preserve any existing schema instead of blindly recreating it.

Store enough information to reproduce a scan result.

A scan should retain:

* original image/storage reference
* timestamp
* extraction output
* calibration
* measurements
* uncertainty
* rule pack
* findings
* overall verdict
* evidence/hash metadata where available

---

# 24. Evidence

Where the existing project implements evidence bundles/hash chains/Section 63 certificate functionality, preserve and integrate it.

Do not fake cryptographic evidence.

If a hash is displayed, it must correspond to actual content.

Never display a made-up "verified hash".

---

# 25. Authentication

If Supabase Auth already exists:

* preserve it
* protect appropriate dashboard/history/report resources
* use RLS correctly

Do not create an elaborate auth system.

For the hackathon demo, minimize authentication friction where project requirements permit it.

---

# 26. Data flow

The intended production flow is:

```text
/capture
    |
    v
POST /api/extract
    |
    v
fields + polygons
    |
    v
POST /api/measure
    |
    v
calibration + measurements
    |
    v
POST /api/evaluate
    |
    v
findings + overall
    |
    v
save scan
    |
    v
/result
    |
    +------> /report
    |
    +------> /history
    |
    +------> /dashboard
```

Do not duplicate the business logic in multiple places.

---

# 27. Fixture/demo mode

Create:

```text
fixtures/scan.sample.json
```

and, if needed:

```text
fixtures/
    scan.sample.json
    scans/
```

The result screen must always be testable from the fixture.

A deterministic demo mode is acceptable.

However:

DO NOT fake production packet results.

Fixture/demo data is for:

* development
* testing
* rehearsal
* fallback demonstration

The actual live path must use the real APIs when available.

---

# 28. Error handling

Every major stage needs useful errors.

Examples:

```text
No calibration card detected
Calibration geometry invalid
Image too blurry
Label plane geometry unreliable
Numeral region unavailable
Measurement failed
Extraction failed
Rule evaluation failed
Database unavailable
```

Do not show raw stack traces to judges.

Give the user:

* what went wrong
* what they can do
* retry button

---

# 29. Loading UX

Show explicit stages:

```text
Uploading image
↓
Reading declarations
↓
Calibrating measurement
↓
Measuring numerals
↓
Applying legal rules
↓
Saving inspection
```

Do not leave users staring at a blank spinner.

---

# 30. Responsive design

The system must work on:

### Phone

Primary capture device.

### Laptop

Development and operator use.

### 1024 × 768

Presentation/projector requirement.

Do not design only for a large desktop monitor.

---

# 31. Accessibility / usability

At minimum:

* readable text
* visible focus states
* buttons with clear labels
* sufficient contrast
* meaningful error messages
* no critical information conveyed only by color

Verdict should always have textual labels.

---

# 32. Components

Prefer reusable components.

Suggested structure:

```text
app/
├── capture/
│   └── page.tsx
├── result/
│   └── page.tsx
├── history/
│   └── page.tsx
├── dashboard/
│   └── page.tsx
├── report/
│   └── page.tsx

components/
├── scan/
│   ├── AnnotatedImage.tsx
│   ├── MeasurementCard.tsx
│   ├── UncertaintyBar.tsx
│   ├── FindingCard.tsx
│   ├── VerdictBadge.tsx
│   └── FieldList.tsx
├── dashboard/
│   ├── SummaryCards.tsx
│   ├── ViolationsChart.tsx
│   ├── TrendChart.tsx
│   └── ScanTable.tsx
└── layout/
    ├── Header.tsx
    └── Navigation.tsx

lib/
├── api.ts
├── types.ts
├── demo.ts
└── ...

fixtures/
└── scan.sample.json
```

Adjust this structure if the existing repository has an established convention.

---

# 33. TypeScript requirements

Create canonical types for:

```text
Scan
Calibration
Pdp
LabelField
Measurement
Finding
OverallVerdict
RulePack
```

Use strict typing.

Avoid:

```text
any
```

unless genuinely unavoidable.

API responses should be typed.

---

# 34. Python requirements

Use:

```text
opencv-python-headless
```

and the existing Python environment/dependencies.

Do not introduce unnecessary ML dependencies.

Keep measurement code deterministic wherever possible.

The measurement module must be independently runnable for testing.

---

# 35. Testing

Implement tests for the important deterministic logic.

At minimum test:

### Calibration

* correct marker/card
* scale recovery
* invalid marker geometry

### Measurement

* known synthetic geometry
* conversion to millimetres
* uncertainty propagation

### Verdict logic

Test:

```text
0.95 ± 0.02 vs 1.00 → VIOLATION
1.02 ± 0.02 vs 1.00 → COMPLIANT
0.98 ± 0.05 vs 1.00 → INDETERMINATE
```

### Frontend

Verify:

* fixture loads
* result page renders
* annotations render
* measurement card renders
* uncertainty bar renders
* verdict renders
* report prints

---

# 36. Security

Do not:

* expose secret keys to the browser
* commit `.env`
* expose service-role Supabase credentials
* trust client-provided compliance verdicts
* allow arbitrary rule-pack execution
* execute arbitrary uploaded files

Validate API input.

Keep server-only credentials server-side.

---

# 37. Environment variables

Inspect existing environment variables first.

Never commit secrets.

If a required environment variable is missing, provide:

```text
.env.example
```

with placeholders.

---

# 38. Development priority

Implement in this order.

## Phase 1 — Foundation

* inspect repository
* establish types
* fixture
* routes
* layout
* result page

The result page MUST work without backend.

## Phase 2 — Real capture

* camera/upload
* preview
* loading
* errors

## Phase 3 — Measurement integration

* connect extraction
* connect measurement
* display real calibration
* display real measurements

## Phase 4 — Rule integration

* rule packs
* evaluator
* findings
* overall verdict

## Phase 5 — Persistence

* Supabase
* scans
* history
* dashboard

## Phase 6 — Report/evidence

* printable report
* evidence metadata
* hash/certificate integration where available

## Phase 7 — Deployment

* Vercel
* production environment
* phone testing
* 1024×768 testing

## Phase 8 — Polish

Only polish after functionality is stable.

---

# 39. Critical development rule

Never spend hours polishing a screen while the actual pipeline is broken.

The demo path is:

```text
PHOTO
 ↓
CALIBRATION
 ↓
MEASUREMENT
 ↓
VERDICT
 ↓
REPORT
```

This path is sacred.

---

# 40. Hackathon demo requirements

The final live demonstration must allow the team to show:

1. Photograph of packet + calibration card.
2. Extracted declaration.
3. Exact numeral region.
4. Physical measurement in mm.
5. Uncertainty.
6. Legal threshold.
7. Compliance/violation/indeterminate verdict.
8. Rule text.
9. Dashboard/history.
10. Printable report.

A judge should be able to understand the core technical argument without seeing source code.

---

# 41. Frontend presentation requirements

The result screen is the most important frontend screen.

At a glance the judge should understand:

```text
WHAT WAS MEASURED?
        ↓
HOW BIG WAS IT?
        ↓
WHAT IS THE UNCERTAINTY?
        ↓
WHAT DOES THE LAW REQUIRE?
        ↓
WHAT IS THE VERDICT?
```

Avoid excessive decorative UI.

Prioritize evidence.

---

# 42. Do not fake AI/measurement

Never write UI copy such as:

> AI estimated the font is 0.82 mm.

Instead communicate the actual provenance:

> Calibrated measurement: 0.82 ± 0.10 mm

The system's differentiation depends on this distinction.

---

# 43. Do not hard-code production verdicts

Bad:

```text
if packet === "Acme":
    return "NON_COMPLIANT"
```

Bad:

```text
const mrpHeight = 0.82;
```

Good:

```text
API → measurement → rule evaluator → finding → UI
```

Fixtures are allowed only in demo/test mode.

---

# 44. Git discipline

Before modifying code:

```text
git status
```

Work incrementally.

After meaningful milestones:

```text
git diff
```

Run:

```text
npm run lint
npm run typecheck
npm run build
```

or the equivalent commands discovered from the repository.

Run Python tests/checks as applicable.

Do not leave the repository in a broken build state.

Never delete unrelated teammate work.

---

# 45. Existing teammate boundaries

The project has six people.

### Tejas

Owns:

* field extraction
* ArUco calibration
* glyph measurement
* uncertainty
* evaluator
* dataset/integration

### Dhruv

Owns:

* Supabase
* auth
* storage
* scan repository
* reports/evidence
* hash chain
* certificate

### Shaurya

Owns:

* frontend
* capture
* result screen
* dashboard
* history
* report UI
* uncertainty visualization

### Advik

Owns:

* legal framework
* rule packs
* quoted legal text

### Advika

Owns:

* narrative
* rehearsal
* submission

### Ranveer

Owns:

* defence
* feasibility
* fact checking

Do not unnecessarily modify another person's subsystem.

Integrate through the frozen contracts.

---

# 46. If another subsystem is unavailable

Do not block frontend development.

Use:

```text
fixtures/scan.sample.json
```

and clearly separated adapters.

For example:

```text
lib/api.ts
lib/demo.ts
```

Production:

```text
api.ts
```

Demo:

```text
demo.ts
```

Do not scatter fixture values throughout components.

---

# 47. Definition of done

The system is done only when:

### Capture

A phone can capture/upload an image.

### Extraction

Declarations can be extracted.

### Calibration

The physical card provides scale.

### Measurement

Numeral height is reported in millimetres.

### Uncertainty

Measurement includes uncertainty.

### Quality gate

Invalid geometry can produce an indeterminate/unreliable result.

### Evaluation

The versioned rule pack produces the verdict.

### Result

The complete result is clearly visualized.

### Dashboard

Real scans can be summarized.

### History

Previous scans can be searched.

### Report

An inspection report can be printed.

### Persistence

Scans survive page reload.

### Deployment

The production URL works.

### Presentation

The complete demo can be performed without debugging on stage.

---

# 48. First task

Do NOT immediately rewrite the entire repository.

First:

1. Inspect the repository.
2. Report the current architecture.
3. Identify which pieces already exist.
4. Identify missing pieces against this specification.
5. Identify conflicts with this specification.
6. Create a concise implementation plan.
7. Then implement Phase 1.

Phase 1 must produce:

```text
/capture
/result
/history
/dashboard
/report
```

with:

```text
fixtures/scan.sample.json
```

and a completely functional `/result` page with:

* annotated image
* extracted fields
* measurement card
* uncertainty bar
* finding
* rule
* overall verdict

It must work without any backend.

After implementation:

```text
run lint
run typecheck
run build
run relevant tests
```

Fix errors before stopping.

Do not ask for permission for routine implementation decisions.

Only stop and ask if a decision genuinely conflicts with an existing project requirement or requires credentials/secrets that are unavailable.

---

# 49. Final operating principle

Build the smallest reliable system that proves:

> A photograph can be converted into a traceable, calibrated physical measurement and then evaluated against versioned legal requirements.

Everything else is secondary.
