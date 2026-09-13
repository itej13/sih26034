"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FieldList } from "@/components/scan/FieldList";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { VerdictBadge } from "@/components/scan/VerdictBadge";
import type { Scan } from "@/lib/types";

/**
 * sessionStorage is a client-only store, so reading it during render makes the server and the
 * client's first render disagree and hydration fails on any reload of this page. useSyncExternalStore
 * is the primitive for exactly this: it renders the SERVER snapshot during hydration and swaps to the
 * client one afterwards, with no mismatch. The server snapshot is `undefined` meaning "not read yet"
 * and the client returns `null` for "read, and there is nothing" — collapsing those two would flash
 * "no live result" on every refresh of a page that does have one.
 */
const NOTHING_YET = undefined;

/** sessionStorage cannot change under this page, so there is nothing to subscribe to. */
function subscribe() {
  return () => {};
}

function readLatestRaw(): string | null {
  try {
    // Keys are "scan:live_<capturedAtMs>" (see runPipeline's scan_id), so the timestamp that
    // makes one scan "newest" is already in the key — sort on it explicitly rather than
    // trusting Object.keys() insertion order.
    const prefix = "scan:live_";
    const latest = Object.keys(sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)))[0];
    return latest ? sessionStorage.getItem(latest) : null;
  } catch {
    // A blocked or unavailable sessionStorage is the empty case, not a crash.
    return null;
  }
}

export default function LiveResultPage() {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readLatestRaw, () => NOTHING_YET);
  const scan = useMemo(() => {
    if (!raw) return undefined;
    try { return JSON.parse(raw) as Scan; } catch { return undefined; }
  }, [raw]);

  if (raw === NOTHING_YET) return (
    <main className="page-shell">
      <section className="panel p-8" role="status">
        <p className="eyebrow">Live result</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Restoring the last inspection…</h1>
        <p className="mt-2 text-sm text-ink-muted">Reading the result this browser captured.</p>
      </section>
    </main>
  );

  if (!scan) return (
    <main className="page-shell">
      <section className="panel p-8">
        <p className="eyebrow">Live result</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">No live result is available</h1>
        <p className="mt-2 text-sm text-ink-muted">Start a new inspection to view backend output here.</p>
        <Link href="/capture" className="button-primary mt-5">Start inspection</Link>
      </section>
    </main>
  );

  const measurement = scan.measurements[0];
  const finding = measurement ? scan.findings.find((item) => item.rule_ref === "7(3)") : undefined;

  return (
    <main className="page-shell">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="order-2 sm:order-1">
          <p className="eyebrow">Live pipeline result · <span className="numeral">{scan.scan_id}</span></p>
          <h1 className="mt-1.5 text-3xl font-semibold text-ink sm:text-4xl">Inspection result</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Returned by extraction, OpenCV measurement, and rule evaluation APIs.</p>
        </div>
        <div className="order-1 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:order-2">
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.16em] text-ink-faint">Overall<br className="hidden sm:block" /> verdict</p>
          <VerdictBadge verdict={scan.overall} className="text-sm" />
        </div>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]">
        <AnnotatedImage imageUrl={scan.image_url || "/fixtures/sample-pack.svg"} caption="Original capture, unrectified. Declaration polygons are recorded in rectified-image coordinates, so they are not drawn over this photograph." />
        <div className="space-y-4">
          <section className="panel border-l-4 border-l-measure p-5">
            <p className="eyebrow">Extracted declaration</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{scan.fields.find((field) => field.key === "mrp")?.text ?? "Declaration"}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Polygons are supplied by the extraction API. No measurements are derived in the browser.</p>
          </section>

          {measurement && <MeasurementCard measurement={measurement} finding={finding} />}

          <section className="panel p-5">
            <p className="eyebrow">Calibration returned by measurement API</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Mode</dt>
                <dd className="mt-0.5 font-medium text-ink">{scan.calibration.mode}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Scale</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">{scan.calibration.mm_per_px} mm/px</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Scale uncertainty</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">± {scan.calibration.uncertainty_mm_per_px} mm/px</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Rule pack</dt>
                <dd className="numeral mt-0.5 font-medium text-ink">{scan.rule_pack}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]">
        <div>
          <p className="eyebrow">Evaluation API output</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Rule-engine output</h2>
          {/* Positional keys: two different rules both cite rule_ref "7(3)". */}
          <div className="mt-4 space-y-4">
            {scan.findings.map((item, index) => <FindingCard key={`${item.rule_ref}-${index}`} finding={item} />)}
          </div>
        </div>
        <FieldList fields={scan.fields} />
      </section>
    </main>
  );
}
