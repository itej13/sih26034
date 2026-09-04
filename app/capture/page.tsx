"use client";
/* eslint-disable @next/next/no-img-element -- local object URL preview must remain unoptimized */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Scan } from "@/lib/types";
import { PipelineUnavailableError, runPipeline } from "@/lib/api";

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

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) { setError("Please choose a JPG, PNG, or HEIC image."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(candidate); setPreview(URL.createObjectURL(candidate)); setError(undefined); setActiveStage(0);
  };

  const runInspection = async () => {
    if (!file) { setError("Add a package photograph before starting the inspection."); return; }
    setProcessing(true); setError(undefined); setActiveStage(0);
    const timer = window.setInterval(() => setActiveStage((current) => Math.min(current + 1, stages.length - 1)), 850);
    try {
      let result: ScanResponse;
      try {
        const liveResult = await runPipeline(file, "lmpc@2026-07-01");
        result = liveResult;
        // The API contracts return analytical output, not an image URL. Keep the selected
        // browser preview available to the live result screen without altering any analysis.
        result.image_url = await readAsDataUrl(file);
        sessionStorage.setItem(`scan:${liveResult.scan_id}`, JSON.stringify(liveResult));
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
      window.clearInterval(timer); setProcessing(false); setError(caught instanceof Error ? caught.message : "Inspection failed. Try again or open the demo result.");
    }
  };

  return <main className="page-shell"><header className="border-b border-slate-200 pb-6"><p className="eyebrow">New inspection</p><h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Capture the evidence</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Photograph the declaration and calibration card together. The card provides physical scale; the image remains the original inspection record.</p></header><section className="mt-7 grid gap-7 lg:grid-cols-[1.08fr_.92fr]"><div className="panel p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-sm font-bold text-blue-900">01</span><div><h2 className="text-xl font-semibold text-slate-950">Package photograph</h2><p className="text-sm text-slate-600">Use a phone camera or choose a saved image.</p></div></div><label className="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-blue-800 hover:bg-blue-50"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-2xl font-light text-blue-900 shadow-sm">+</span><span className="mt-4 block font-semibold text-slate-900">Take photo or choose image</span><span className="mt-1 block text-sm text-slate-600">Camera capture is enabled on supported phones</span><input ref={inputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} /></label>{preview && <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={preview} alt="Selected package preview" className="max-h-96 w-full object-contain" /></div>}{error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Inspection could not start</p><p className="mt-1">{error}</p><button type="button" onClick={() => { setError(undefined); inputRef.current?.click(); }} className="mt-3 font-semibold underline underline-offset-2">Choose another image</button></div>}<div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={runInspection} className="button-primary" disabled={processing || !file}>{processing ? "Processing inspection…" : "Begin calibrated inspection"}</button><Link href="/result/sc_0142" className="button-secondary">Open demo result</Link></div></div><aside className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Inspection pipeline</p><h2 className="mt-2 text-2xl font-semibold">Five stages. One traceable result.</h2><ol className="mt-7 space-y-5">{stages.map((stage, index) => <li key={stage.label} className="flex gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${processing && index <= activeStage ? "bg-amber-500 text-slate-950" : "border border-slate-600 text-slate-300"}`}>{index < activeStage ? "✓" : index + 1}</span><span><span className={`block text-sm font-semibold ${processing && index === activeStage ? "text-white" : "text-slate-300"}`}>{stage.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{stage.detail}</span></span></li>)}</ol><div className="mt-8 border-t border-slate-700 pt-5 text-sm leading-6 text-slate-300"><strong className="text-white">Field note:</strong> keep the calibration card flat on the same panel as the text. A card beside a standing pack produces an unreliable scale.</div></aside></section></main>;
}
