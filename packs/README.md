# Rule packs — Advik

A rule pack is the legal framework as data. The evaluator contains no rules; it contains a
fixed set of predicates and loads these files. That is why a rules change is an edit here
rather than an app release, and it is why this folder is on the code critical path: the
evaluator cannot be tested until it has rules to run.

## Adding a rule

Copy an existing entry and fill in the fields. Nothing else in the repo needs to change.

| Field | What it is |
|---|---|
| `id` | kebab-case, unique inside the pack |
| `rule_ref` | The rule number as an officer would cite it — `7(3)`, `6(1)(c)` |
| `rule_text` | **Quoted verbatim from the Gazette. Never paraphrased.** This string is printed on the report and read by the panel. |
| `applies_to` | A field key: `mrp`, `net_qty`, `mfg_date`, `manufacturer`, `consumer_care`, `generic_name` |
| `predicate` | One of the eight below. Nothing else is valid. |
| `message` | Plain English, what an officer would write on a notice |

## The predicate vocabulary

Closed on purpose — a rule pack is data, and data cannot execute.

| Predicate | Checks | Extra fields |
|---|---|---|
| `present` | the field exists and is non-empty | — |
| `matches` | text matches a required pattern or phrase set | `pattern` or `any_of` |
| `in_set` | a parsed unit is in the legal SI set | `allowed` |
| `min_mm` | a measurement clears a fixed threshold | `metric`, `threshold`, `threshold_embossed` |
| `min_mm_lookup` | a measurement clears a table-derived threshold | `metric`, `lookup_on`, `table` |
| `min_ratio` | one measurement over another clears a ratio | `numerator`, `denominator`, `threshold` |
| `clear_space` | no other print inside an expanded region | `vertical_multiple`, `horizontal_multiple` |
| `contrast_min` | glyph-vs-background contrast clears a threshold | `threshold` |
| `consistent_with` | cross-field arithmetic agrees | `expression` |

Need something none of these express? Say so at standup — a new predicate is a change to
the evaluator, which is Tejas's file, not a change you can make here alone.

## Two packs, not one

`lmpc-2026-07-01.json` is the current law. A second pack dated `2021-01-01` — same rules
minus unit sale price, which only became mandatory on 2022-10-01 — gives the live
version-swap on stage something to swap to, and proves the engine judges a pack by the law
in force on its date of packing rather than today's.

Filenames use `-` instead of `@`; the `pack` field inside carries the canonical `lmpc@date`
identifier that findings quote.

## Source

Read the Gazette text of the principal Rules, not a summary blog. Tables I and II under
Rule 7(2), the clear-space proviso under Rule 8(1), and the legibility requirements under
Rule 9 are the ones that carry this project.
