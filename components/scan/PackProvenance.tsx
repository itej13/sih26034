"use client";

import { useEffect, useState } from "react";
import type { Finding, Scan, Verdict } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";

/**
 * The demo beat this panel replaces swapped rule packs live expecting the verdict to change.
 * It cannot: both shipped packs carry the same nine rules, so they always agree. The point
 * being demonstrated instead is provenance — the same photograph, judged under two laws, with
 * every finding permanently stamped with which pack produced it. Agreement is the evidence
 * trail working, not a failure of the demo, so this file must never manufacture a difference.
 */

interface NotAssessedEntry { rule_ref: string; rule_id: string; reason: string }
interface EvaluateResponse { findings: Finding[]; overall: Verdict; not_assessed: NotAssessedEntry[]; rule_pack: string; rule_pack_effective_from: string }
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; packs: EvaluateResponse[] };

/** Row order shared by every column. Stable so ties (see keyed() below) keep their authoring order. */
function byRuleRef(findings: Finding[]) { return [...findings].sort((a, b) => a.rule_ref.localeCompare(b.rule_ref)); }

/**
 * Two rules can cite the same Gazette rule_ref — 7(3)'s letter-height and width-ratio provisos
 * both stamp "7(3)". rule_ref alone is therefore not a unique cross-pack key; the nth occurrence
 * within a rule_ref (after the same stable sort in every pack) disambiguates them so the
 * agreement check below compares the height rule to the height rule, not to the width rule.
 */
function keyed(findings: Finding[]) {
  const seen = new Map<string, number>();
  const map = new Map<string, Finding>();
  for (const finding of byRuleRef(findings)) { const n = seen.get(finding.rule_ref) ?? 0; seen.set(finding.rule_ref, n + 1); map.set(`${finding.rule_ref}#${n}`, finding); }
  return map;
}

interface Disagreement { rule_ref: string; by_pack: { rule_pack: string; verdict: Verdict | "not present" }[] }

/** Computed fresh from the fetched packs on every render, never hard-coded — a future pack that
 *  genuinely diverges flips this without a code change. */
function agreementOf(packs: EvaluateResponse[]): { agree: boolean; disagreements: Disagreement[] } {
  const overallAgree = packs.every((pack) => pack.overall === packs[0].overall);
  const keyedPerPack = packs.map((pack) => keyed(pack.findings));
  const keys = new Set<string>();
  keyedPerPack.forEach((map) => map.forEach((_finding, key) => keys.add(key)));
  const disagreements: Disagreement[] = [];
  for (const key of keys) {
    const byPack = packs.map((pack, index) => ({ rule_pack: pack.rule_pack, verdict: keyedPerPack[index].get(key)?.verdict ?? ("not present" as const) }));
    if (!byPack.every((entry) => entry.verdict === byPack[0].verdict)) disagreements.push({ rule_ref: key.split("#")[0], by_pack: byPack });
  }
  disagreements.sort((a, b) => a.rule_ref.localeCompare(b.rule_ref));
  return { agree: overallAgree && disagreements.length === 0, disagreements };
}

/** Every rule any pack judged, in the same order for every column. Uses keyed()'s
 *  rule_ref#occurrence so the two 7(3) provisos stay on separate rows. */
function comparisonRows(packs: EvaluateResponse[]) {
  const keyedPerPack = packs.map((pack) => keyed(pack.findings));
  const keys = new Set<string>();
  keyedPerPack.forEach((map) => map.forEach((_finding, key) => keys.add(key)));
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, rule_ref: key.split("#")[0], cells: keyedPerPack.map((map) => map.get(key)) }));
}

function NotAssessed({ entries }: { entries: NotAssessedEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Reported to the officer, not judged</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-muted">
        {entries.map((entry) => <li key={entry.rule_id}><span className="font-semibold text-ink">{entry.rule_ref}</span> — {entry.reason}</li>)}
      </ul>
    </div>
  );
}

/**
 * Below md the two pack cards used to stack, and the argument of this panel — the same
 * photograph judged under two laws, side by side — disappeared with them. The comparison is
 * kept by turning the axis instead of dropping it: one row per rule, one column per pack, so
 * both laws still answer on the same line at 320px. Verdicts stay whole words.
 */
function ComparisonTable({ packs }: { packs: EvaluateResponse[] }) {
  // Each row's verdict sits under its pack's column heading, so the heading is the stamp and
  // repeating it per row only wrapped the cell. The desktop card still stamps every line.
  // ponytail: two columns is the registered pack count. A third pack wraps here rather than
  // shrinking — give it its own column set (or a scroller) if one is ever registered.
  return (
    <div className="panel p-4 md:hidden">
      <div className="grid grid-cols-2 gap-2 border-b border-line pb-2">
        {packs.map((pack) => (
          <div key={pack.rule_pack}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand">{pack.rule_pack}</p>
            <p className="text-[10px] text-ink-faint">from {pack.rule_pack_effective_from}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-line bg-sunken/70 px-1 py-2">
        {packs.map((pack) => (
          <div key={pack.rule_pack}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Overall</p>
            <div className="mt-1"><VerdictBadge verdict={pack.overall} /></div>
          </div>
        ))}
      </div>

      <ul>
        {comparisonRows(packs).map((row) => (
          <li key={row.key} className="border-b border-line py-3 last:border-b-0">
            <p className="text-sm font-semibold text-ink">Rule {row.rule_ref}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {row.cells.map((finding, index) => (
                <div key={packs[index].rule_pack}>
                  {finding
                    ? <VerdictBadge verdict={finding.verdict} />
                    : <span className="text-xs italic text-ink-faint">not present in this pack</span>}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {packs.map((pack) => (
        <div key={pack.rule_pack}>
          {pack.not_assessed.length > 0 && <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-brand">{pack.rule_pack}</p>}
          <NotAssessed entries={pack.not_assessed} />
        </div>
      ))}
    </div>
  );
}

function PackCard({ pack }: { pack: EvaluateResponse }) {
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{pack.rule_pack}</p>
          <p className="mt-1 text-sm text-ink-muted">Effective from {pack.rule_pack_effective_from}</p>
        </div>
        <VerdictBadge verdict={pack.overall} />
      </div>
      <div className="mt-4 space-y-3">
        {byRuleRef(pack.findings).map((finding, index) => (
          <div key={`${finding.rule_ref}-${index}`} className="flex items-center justify-between gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div>
              <p className="text-sm font-semibold text-ink">Rule {finding.rule_ref}</p>
              <p className="text-xs font-medium text-ink-faint">Stamped {finding.rule_pack}</p>
            </div>
            <VerdictBadge verdict={finding.verdict} />
          </div>
        ))}
      </div>
      <NotAssessed entries={pack.not_assessed} />
    </article>
  );
}

export function PackProvenance({ scan }: { scan: Scan }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listResponse = await fetch("/api/evaluate");
        if (!listResponse.ok) throw new Error(`Rule pack list request failed (${listResponse.status}).`);
        const { packs: packIds } = (await listResponse.json()) as { packs: string[] };
        if (packIds.length === 0) throw new Error("No rule packs are registered.");
        // Every pack is queried, never just the first — a comparison of one pack rendered
        // twice would be indistinguishable on screen from a real second pack, and invariant
        // 5 forbids exactly that kind of confident-looking fake.
        const packs = await Promise.all(packIds.map(async (pack_id) => {
          const response = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan, pack_id }) });
          if (!response.ok) throw new Error(`Evaluating against ${pack_id} failed (${response.status}).`);
          return (await response.json()) as EvaluateResponse;
        }));
        if (!cancelled) setState({ status: "ready", packs });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "The pack comparison could not be loaded." });
      }
    })();
    return () => { cancelled = true; };
  }, [scan]);

  if (state.status === "loading") return (
    <section className="no-print grid gap-5 md:grid-cols-2" role="status" aria-label="Loading the rule-pack comparison">
      {[0, 1].map((column) => (
        <div key={column} className="panel animate-pulse p-5">
          <div className="h-3 w-32 rounded bg-sunken" />
          <div className="mt-3 h-3 w-40 rounded bg-sunken" />
          <div className="mt-6 space-y-4">{[0, 1, 2, 3].map((row) => <div key={row} className="h-4 rounded bg-sunken" />)}</div>
        </div>
      ))}
      <span className="sr-only">Loading the rule-pack comparison…</span>
    </section>
  );

  if (state.status === "error") return <section className="no-print panel border-l-4 border-l-verdict-violation-border p-5 text-sm text-verdict-violation" role="alert">The rule-pack comparison is unavailable: {state.message}</section>;

  const { packs } = state;
  const { agree, disagreements } = agreementOf(packs);

  return (
    <section className="no-print space-y-5">
      <ComparisonTable packs={packs} />
      <div className="hidden gap-5 md:grid md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {packs.map((pack) => <PackCard key={pack.rule_pack} pack={pack} />)}
      </div>
      <div className="panel p-5 text-sm leading-6 text-ink-muted">
        {agree
          ? <p>Both packs reach the same verdict on this packet. The difference is not the outcome — it is the record: every finding above is stamped with the law that produced it, so a notice can always state which rules were in force when it was issued.</p>
          : <div>
              <p className="font-semibold text-ink">The packs disagree:</p>
              <ul className="mt-2 space-y-1">{disagreements.map((disagreement) => <li key={disagreement.rule_ref}>Rule {disagreement.rule_ref} — {disagreement.by_pack.map((entry) => `${entry.rule_pack}: ${entry.verdict}`).join(", ")}</li>)}</ul>
            </div>}
      </div>
    </section>
  );
}
