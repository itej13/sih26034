import Link from "next/link";
import { listScans, repositoryMode } from "@/lib/repository";
import { VerdictBadge } from "@/components/scan/VerdictBadge";

const workflow = [
  "Photograph package with the calibration card",
  "Extract declarations and supplied polygons",
  "Measure numerals with calibrated geometry",
  "Apply the versioned rule pack",
  "Review and print evidence",
];

export default async function DashboardPage() {
  // Reads through the repository rather than the fixture module directly, so the day a
  // Supabase project exists this screen is already looking at filed rows. Until then the
  // repository answers from the same fixtures — and says so, below.
  const allScans = await listScans();
  const mode = repositoryMode();
  const sourceLabel = mode === "fixture" ? "Fixture development data" : "Filed inspections";
  const totals = [
    { label: "Total inspections", value: allScans.length, note: sourceLabel, accent: "border-t-brand" },
    { label: "Compliant", value: allScans.filter((scan) => scan.overall === "COMPLIANT").length, note: "No adverse finding", accent: "border-t-verdict-compliant-border" },
    { label: "Violations", value: allScans.filter((scan) => scan.overall === "VIOLATION").length, note: "Action required", accent: "border-t-verdict-violation-border" },
    { label: "Indeterminate", value: allScans.filter((scan) => scan.overall === "INDETERMINATE").length, note: "Needs re-inspection", accent: "border-t-verdict-indeterminate-border" },
  ];
  const rules = Array.from(new Set(allScans.flatMap((scan) => scan.findings.filter((finding) => finding.verdict === "VIOLATION").map((finding) => finding.rule_ref))));

  return (
    <main className="page-shell">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Operational overview</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Enforcement dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">A concise view of inspection outcomes and the legal rules driving them.</p>
        </div>
        <Link href="/capture" className="button-primary no-print">New inspection</Link>
      </header>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((metric) => (
          <article key={metric.label} className={`panel border-t-4 p-5 ${metric.accent}`}>
            <p className="text-sm font-medium text-ink-muted">{metric.label}</p>
            <p className="numeral mt-3 text-4xl font-semibold text-ink">{metric.value}</p>
            <p className="mt-2 text-xs text-ink-faint">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <article className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Rule distribution</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">Violations by rule</h2>
            </div>
            <span className="rounded-full bg-sunken px-3 py-1 text-xs font-semibold text-ink-muted">{mode === "fixture" ? "Current fixture set" : "Filed inspections"}</span>
          </div>
          <div className="mt-6 space-y-5">
            {rules.map((rule) => {
              const count = allScans.flatMap((scan) => scan.findings).filter((finding) => finding.rule_ref === rule && finding.verdict === "VIOLATION").length;
              const width = Math.max(10, (count / allScans.length) * 100);
              return (
                <div key={rule}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">Rule {rule}</span>
                    <span className="numeral text-ink-muted">{count} finding{count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-verdict-violation-border" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {rules.length === 0 && <p className="text-sm text-ink-muted">No violations have been recorded yet.</p>}
          </div>
        </article>

        <aside className="inset-panel">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-inset-ink">Inspection workflow</p>
          <h2 className="mt-2 text-2xl font-semibold">Evidence before outcome.</h2>
          <ol className="mt-6 space-y-4 text-sm text-inset-ink">
            {workflow.map((step, index) => (
              <li className="flex gap-3" key={step}>
                <span className="numeral grid h-6 w-6 shrink-0 place-items-center rounded-full border border-inset-line text-xs font-bold">{index + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="panel mt-7 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div>
            <p className="eyebrow">Inspection register</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Recent inspections</h2>
          </div>
          <Link href="/history" className="flex min-h-11 items-center text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">View all history</Link>
        </div>
        <div className="divide-y divide-line">
          {allScans.map((scan) => (
            <Link key={scan.scan_id} href={`/result/${scan.scan_id}`} className="flex min-h-11 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
              <div>
                <p className="numeral font-semibold text-ink">{scan.scan_id}</p>
                <p className="numeral mt-0.5 text-xs text-ink-muted">{new Date(scan.captured_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
              </div>
              <VerdictBadge verdict={scan.overall} />
            </Link>
          ))}
          {allScans.length === 0 && (
            <div className="p-10 text-center">
              <p className="font-semibold text-ink">No inspections have been filed yet.</p>
              <p className="mt-1 text-sm text-ink-muted">The first completed inspection appears here with its evidence trail.</p>
              <Link href="/capture" className="button-primary mt-5">Start an inspection</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
