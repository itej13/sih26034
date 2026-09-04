import pack2026 from "@/packs/lmpc-2026-07-01.json";
import type { Finding, Scan, Verdict } from "@/lib/types";

type PackRule = {
  id: string; rule_ref: string; rule_text: string; applies_to: string; predicate: string;
  metric?: string; threshold?: number; threshold_embossed?: number; numerator?: string; denominator?: string;
  lookup_on?: string; table?: { up_to: number | null; mm: number; embossed_mm: number }[];
  vertical_multiple?: number; horizontal_multiple?: number; message: string;
};
type Pack = { pack: string; effective_from: string; rules: PackRule[] };

const packs: Record<string, Pack> = { "lmpc@2026-07-01": pack2026 as Pack };
const measured = (scan: Scan, field: string, metric: string) => scan.measurements.find((item) => item.field === field && item.metric === metric);

export function verdictForInterval(value: number, uncertainty: number, threshold: number): Verdict {
  if (value - uncertainty >= threshold) return "COMPLIANT";
  if (value + uncertainty < threshold) return "VIOLATION";
  return "INDETERMINATE";
}

function finding(rule: PackRule, pack: Pack, verdict: Verdict, measuredText: string, required: string): Finding {
  return { rule_ref: rule.rule_ref, verdict, measured: measuredText, required, rule_pack: pack.pack, rule_text: rule.rule_text, message: verdict === "COMPLIANT" ? null : rule.message };
}

function box(poly: [number, number][]) { return { left: Math.min(...poly.map((point) => point[0])), right: Math.max(...poly.map((point) => point[0])), top: Math.min(...poly.map((point) => point[1])), bottom: Math.max(...poly.map((point) => point[1])) }; }

function evaluateRule(scan: Scan, rule: PackRule, pack: Pack): Finding {
  const field = scan.fields.find((item) => item.key === rule.applies_to);
  if (rule.predicate === "present") return finding(rule, pack, field?.text.trim() ? "COMPLIANT" : "VIOLATION", field?.text.trim() ? "field present" : "field missing", "present");
  if (rule.predicate === "min_mm" && rule.metric && rule.threshold !== undefined) {
    const item = measured(scan, rule.applies_to, rule.metric);
    if (!item) return finding(rule, pack, "INDETERMINATE", "measurement unavailable", `≥ ${rule.threshold.toFixed(2)} mm`);
    return finding(rule, pack, verdictForInterval(item.value, item.expanded_uncertainty_mm, rule.threshold), `${item.value.toFixed(2)} ± ${item.expanded_uncertainty_mm.toFixed(2)} mm`, `≥ ${rule.threshold.toFixed(2)} mm`);
  }
  if (rule.predicate === "min_mm_lookup" && rule.metric && rule.table) {
    const item = measured(scan, rule.applies_to, rule.metric); const value = field?.value;
    const quantity = value && typeof value === "object" && "n" in value ? value.n : null;
    const row = quantity === null ? undefined : rule.table.find((entry) => entry.up_to === null || quantity <= entry.up_to);
    if (!item || !row) return finding(rule, pack, "INDETERMINATE", "measurement or pack-size lookup unavailable", "table threshold unavailable");
    return finding(rule, pack, verdictForInterval(item.value, item.expanded_uncertainty_mm, row.mm), `${item.value.toFixed(2)} ± ${item.expanded_uncertainty_mm.toFixed(2)} mm`, `≥ ${row.mm.toFixed(2)} mm (Table I)`);
  }
  if (rule.predicate === "min_ratio" && rule.numerator && rule.denominator && rule.threshold !== undefined) {
    const numerator = scan.measurements.find((item) => item.metric === rule.numerator); const denominator = scan.measurements.find((item) => item.metric === rule.denominator);
    if (!numerator || !denominator || denominator.value <= denominator.expanded_uncertainty_mm) return finding(rule, pack, "INDETERMINATE", "ratio measurement unavailable", `≥ ${rule.threshold.toFixed(4)}`);
    const low = (numerator.value - numerator.expanded_uncertainty_mm) / (denominator.value + denominator.expanded_uncertainty_mm); const high = (numerator.value + numerator.expanded_uncertainty_mm) / (denominator.value - denominator.expanded_uncertainty_mm); const verdict: Verdict = low >= rule.threshold ? "COMPLIANT" : high < rule.threshold ? "VIOLATION" : "INDETERMINATE";
    return finding(rule, pack, verdict, `${(numerator.value / denominator.value).toFixed(3)} ratio`, `≥ ${rule.threshold.toFixed(4)}`);
  }
  if (rule.predicate === "clear_space" && field?.poly && rule.horizontal_multiple !== undefined && rule.vertical_multiple !== undefined) {
    const measurement = measured(scan, rule.applies_to, "numeral_height_mm");
    if (!measurement) return finding(rule, pack, "INDETERMINATE", "numeral height unavailable", "required clear space unavailable");
    const target = box(field.poly); const scale = scan.calibration.mm_per_px; const horizontal = rule.horizontal_multiple * measurement.value / scale; const vertical = rule.vertical_multiple * measurement.value / scale; const intrusions = scan.other_print.map((item) => box(item.poly)).some((other) => !(other.left > target.right + horizontal || other.right < target.left - horizontal || other.top > target.bottom + vertical || other.bottom < target.top - vertical));
    return finding(rule, pack, intrusions ? "VIOLATION" : "COMPLIANT", intrusions ? "printed matter inside required clear space" : "no printed matter inside required clear space", `≥ ${rule.horizontal_multiple} × numeral height left/right`);
  }
  return finding(rule, pack, "INDETERMINATE", "predicate not available for this rule", "not determinable");
}

export function evaluateScan(scan: Scan, packId: string) {
  const pack = packs[packId];
  if (!pack) throw new Error(`Rule pack ${packId} is not available.`);
  const findings = pack.rules.map((rule) => evaluateRule(scan, rule, pack));
  const overall: Verdict = findings.some((item) => item.verdict === "VIOLATION") ? "VIOLATION" : findings.some((item) => item.verdict === "INDETERMINATE") ? "INDETERMINATE" : "COMPLIANT";
  return { findings, overall };
}
