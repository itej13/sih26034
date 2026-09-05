"use client";

import Link from "next/link";
import { useState } from "react";
import { AnnotatedImage } from "@/components/scan/AnnotatedImage";
import { FieldList } from "@/components/scan/FieldList";
import { FindingCard } from "@/components/scan/FindingCard";
import { MeasurementCard } from "@/components/scan/MeasurementCard";
import { VerdictBadge } from "@/components/scan/VerdictBadge";
import type { Scan } from "@/lib/types";

export default function LiveResultPage() {
  const [scan] = useState<Scan | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      // Keys are "scan:live_<capturedAtMs>" (see runPipeline's scan_id), so the timestamp
      // that makes one scan "newest" is already in the key — sort on it explicitly rather
      // than trusting Object.keys() insertion order.
      const prefix = "scan:live_";
      const latest = Object.keys(sessionStorage)
        .filter((key) => key.startsWith(prefix))
        .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)))[0];
      if (!latest) return undefined;
      const stored = sessionStorage.getItem(latest);
      return stored ? (JSON.parse(stored) as Scan) : undefined;
    } catch {
      return undefined;
    }
  });
  if (!scan) return <main className="page-shell"><section className="panel p-8"><p className="eyebrow">Live result</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">No live result is available</h1><p className="mt-2 text-sm text-slate-600">Start a new inspection to view backend output here.</p><Link href="/capture" className="button-primary mt-5">Start inspection</Link></section></main>;
  const measurement = scan.measurements[0];
  const finding = measurement ? scan.findings.find((item) => item.rule_ref === "7(3)") : undefined;
  return <main className="page-shell"><header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-6"><div><p className="eyebrow">Live pipeline result · {scan.scan_id}</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Inspection result</h1><p className="mt-2 text-sm text-slate-600">Returned by extraction, OpenCV measurement, and rule evaluation APIs.</p></div><div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-right"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Overall verdict</p><div className="mt-2"><VerdictBadge verdict={scan.overall} /></div></div></header><section className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]"><AnnotatedImage fields={scan.fields} imageUrl={scan.image_url || "/fixtures/sample-pack.svg"} /><div className="space-y-4"><section className="panel border-l-4 border-l-amber-600 p-5"><p className="eyebrow">Extracted declaration</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{scan.fields.find((field) => field.key === "mrp")?.text ?? "Declaration"}</h2><p className="mt-2 text-sm text-slate-600">Polygons are supplied by the extraction API. No measurements are derived in the browser.</p></section>{measurement && <MeasurementCard measurement={measurement} finding={finding} />}<section className="panel p-5"><p className="eyebrow">Calibration returned by measurement API</p><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Mode</dt><dd className="font-medium text-slate-900">{scan.calibration.mode}</dd></div><div><dt className="text-slate-500">Scale</dt><dd className="font-medium text-slate-900">{scan.calibration.mm_per_px} mm/px</dd></div><div><dt className="text-slate-500">Scale uncertainty</dt><dd className="font-medium text-slate-900">± {scan.calibration.uncertainty_mm_per_px} mm/px</dd></div><div><dt className="text-slate-500">Rule pack</dt><dd className="font-medium text-slate-900">{scan.rule_pack}</dd></div></dl></section></div></section><section className="mt-10 grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,0.95fr)]"><div><p className="eyebrow">Evaluation API output</p><div className="mt-4 space-y-4">{scan.findings.map((item) => <FindingCard key={`${item.rule_ref}-${item.verdict}`} finding={item} />)}</div></div><FieldList fields={scan.fields} /></section></main>;
}
