"use client";
/* eslint-disable @next/next/no-img-element -- local object URL preview must remain unoptimized */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Scan } from "@/lib/types";
import { PipelineIndeterminateError, PipelineUnavailableError, persistScan, runPipeline } from "@/lib/api";
import { VerdictBadge } from "@/components/scan/VerdictBadge";

type ScanResponse = Scan & { stub?: boolean };

const stages = [
  { label: "Upload image", detail: "Securely prepare the original photo" },
  { label: "Read declarations", detail: "Extract labels and bounding polygons" },
  { label: "Calibrate scale", detail: "Validate the ArUco card geometry" },
  { label: "Measure numerals", detail: "OpenCV measures physical glyph height" },
  { label: "Evaluate rules", detail: "Apply the selected legal rule pack" },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function CapturePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [activeStage, setActiveStage] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [indeterminate, setIndeterminate] = useState<string>();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) { setError("Please choose a JPG, PNG, or HEIC image."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(candidate); setPreview(URL.createObjectURL(candidate)); setError(undefined); setIndeterminate(undefined); setActiveStage(0);
  };

  const runInspection = async () => {
    if (!file) { setError("Add a package photograph before starting the inspection."); return; }
    setProcessing(true); setError(undefined); setIndeterminate(undefined); setActiveStage(0);
    const timer = window.setInterval(() => setActiveStage((current) => Math.min(current + 1, stages.length - 1)), 850);
    try {
      let result: ScanResponse;
      try {
        const liveResult = await runPipeline(file, "lmpc@2026-07-01");
        result = liveResult;
        // The API contracts return analytical output, not an image URL. Keep the selected
        // browser preview available to the live result screen without altering any analysis.
        result.image_url = await readAsDataUrl(file);
        // Persist so the inspection becomes a durable, evidence-chained record instead of
        // living only in sessionStorage. persistScan() never throws — no Supabase configured,
        // or the request failing outright, must never cost the officer a completed inspection,
        // so when it reports `persisted: false` we keep exactly today's sessionStorage +
        // /result/live path with the scan runPipeline already produced.
        const outcome = await persistScan(result);
        if (outcome.persisted) result = outcome.scan;
        sessionStorage.setItem(`scan:${result.scan_id}`, JSON.stringify(result));
      } catch (caught) {
        if (!(caught instanceof PipelineUnavailableError)) throw caught;
        const form = new FormData(); form.append("image", file);
        const fallbackResponse = await fetch("/api/scan", { method: "POST", body: form });
        if (!fallbackResponse.ok) throw new Error("The inspection service could not process this image.");
        result = await fallbackResponse.json() as ScanResponse;
      }
      window.clearInterval(timer); setActiveStage(stages.length - 1);
      router.push(result.scan_id.startsWith("live_") ? "/result/live" : `/result/${result.scan_id}`);
    } catch (caught) {
      window.clearInterval(timer); setProcessing(false);
      if (caught instanceof PipelineIndeterminateError) { setIndeterminate(caught.message); return; }
      setError(caught instanceof Error ? caught.message : "Inspection failed. Try again or open the demo result.");
    }
  };

  const stage = stages[activeStage];

  return (
    <main className="page-shell">
      <header className="border-b border-line pb-6">
        <p className="eyebrow">New inspection</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Capture the evidence</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Photograph the declaration and calibration card together. The card provides physical scale; the image remains the original inspection record.</p>
      </header>

      <section className="mt-7 grid gap-7 lg:grid-cols-[1.08fr_.92fr]">
        <div className="panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="numeral grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand">01</span>
            <div>
              <h2 className="text-xl font-semibold text-ink">Package photograph</h2>
              <p className="text-sm text-ink-muted">Use a phone camera or choose a saved image.</p>
            </div>
          </div>

          <label className="mt-6 block cursor-pointer rounded-xl border-2 border-dashed border-line-strong bg-sunken/60 px-5 py-10 text-center transition-colors hover:border-brand hover:bg-brand-soft focus-within:border-brand focus-within:bg-brand-soft">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-2xl font-light text-brand shadow-sm">+</span>
            <span className="mt-4 block font-semibold text-ink">Take photo or choose image</span>
            <span className="mt-1 block text-sm text-ink-muted">Camera capture is enabled on supported phones</span>
            <input ref={inputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />
          </label>

          {preview && (
            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-sunken">
              <img src={preview} alt="Selected package preview" className="max-h-96 w-full object-contain" />
            </div>
          )}

          {indeterminate && (
            <div role="status" className="mt-4 rounded-xl border-2 border-verdict-indeterminate-border bg-verdict-indeterminate-surface p-4 text-sm text-verdict-indeterminate">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict="INDETERMINATE" />
                <p className="font-semibold">Calibration could not be verified</p>
              </div>
              <p className="mt-2 leading-6">{indeterminate}</p>
              <p className="mt-1 leading-6">Keep the calibration card flat on the same panel as the text, then retake the photograph.</p>
              <button type="button" onClick={() => { setIndeterminate(undefined); inputRef.current?.click(); }} className="mt-3 min-h-11 font-semibold underline underline-offset-2">Choose another image</button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-xl border-2 border-verdict-violation-border bg-verdict-violation-surface p-4 text-sm text-verdict-violation">
              <p className="font-semibold">Inspection could not start</p>
              <p className="mt-1 leading-6">{error}</p>
              <button type="button" onClick={() => { setError(undefined); inputRef.current?.click(); }} className="mt-3 min-h-11 font-semibold underline underline-offset-2">Choose another image</button>
            </div>
          )}

          {/*
            Below lg the dark pipeline aside is the second grid row, so the only feedback an
            officer had after tapping the button was below the fold: the phone looked like it
            had done nothing for the several seconds an inspection takes. This repeats the
            active stage at the point of action, and is hidden at lg where the aside is in view.
          */}
          {processing && (
            <div role="status" aria-live="polite" className="mt-6 rounded-xl border border-line bg-sunken p-4 lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{stage.label}</p>
                <p className="numeral text-xs font-medium text-ink-faint">Stage {activeStage + 1} of {stages.length}</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{stage.detail}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${((activeStage + 1) / stages.length) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={runInspection} className="button-primary" disabled={processing || !file}>
              {processing ? `Stage ${activeStage + 1} of ${stages.length} · ${stage.label}…` : "Begin calibrated inspection"}
            </button>
            <Link href="/result/sc_0142" className="button-secondary">Open demo result</Link>
          </div>
        </div>

        <aside className="inset-panel">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-inset-ink">Inspection pipeline</p>
          <h2 className="mt-2 text-2xl font-semibold">Five stages. One traceable result.</h2>
          <ol className="mt-7 space-y-5">
            {stages.map((item, index) => (
              <li key={item.label} className="flex gap-3">
                <span className={`numeral grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${processing && index <= activeStage ? "bg-white text-inset" : "border border-inset-line text-inset-ink"}`}>
                  {processing && index < activeStage ? "\u2713" : index + 1}
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${processing && index === activeStage ? "text-white underline underline-offset-4" : "text-inset-ink"}`}>{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-inset-ink/70">{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 border-t border-inset-line pt-5 text-sm leading-6 text-inset-ink">
            <strong className="text-white">Field note:</strong> keep the calibration card flat on the same panel as the text. A card beside a standing pack produces an unreliable scale.
          </div>
        </aside>
      </section>
    </main>
  );
}
