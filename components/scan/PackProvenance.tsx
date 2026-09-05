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

  if (state.status === "loading") return <section className="no-print panel p-5 text-sm text-slate-600" role="status">Loading the rule-pack comparison…</section>;
  if (state.status === "error") return <section className="no-print panel p-5 text-sm text-red-800" role="alert">The rule-pack comparison is unavailable: {state.message}</section>;

  const { packs } = state;
  const { agree, disagreements } = agreementOf(packs);

  return <section className="no-print space-y-5"><div className="grid grid-cols-1 gap-5 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">{packs.map((pack) => <article key={pack.rule_pack} className="panel p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{pack.rule_pack}</p><p className="mt-1 text-sm text-slate-600">Effective from {pack.rule_pack_effective_from}</p></div><VerdictBadge verdict={pack.overall} /></div><div className="mt-4 space-y-3">{byRuleRef(pack.findings).map((finding, index) => <div key={`${finding.rule_ref}-${index}`} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0"><div><p className="text-sm font-semibold text-slate-900">Rule {finding.rule_ref}</p><p className="text-xs font-medium text-slate-500">Stamped {finding.rule_pack}</p></div><VerdictBadge verdict={finding.verdict} /></div>)}</div>{pack.not_assessed.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reported to the officer, not judged</p><ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">{pack.not_assessed.map((entry) => <li key={entry.rule_id}><span className="font-semibold text-slate-800">{entry.rule_ref}</span> — {entry.reason}</li>)}</ul></div>}</article>)}</div><div className="panel p-5 text-sm text-slate-700">{agree ? <p>Both packs reach the same verdict on this packet. The difference is not the outcome — it is the record: every finding above is stamped with the law that produced it, so a notice can always state which rules were in force when it was issued.</p> : <div><p className="font-semibold text-slate-900">The packs disagree:</p><ul className="mt-2 space-y-1">{disagreements.map((disagreement) => <li key={disagreement.rule_ref}>Rule {disagreement.rule_ref} — {disagreement.by_pack.map((entry) => `${entry.rule_pack}: ${entry.verdict}`).join(", ")}</li>)}</ul></div>}</div></section>;
}
